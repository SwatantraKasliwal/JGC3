"""Keeps the Render instance from spinning down.

Render's free plan stops the container after 15 minutes with no inbound
request, and the next visitor then waits about a minute for a cold start —
Python boots, `create_all` and `run_migrations` run, the Neon endpoint wakes.
That minute is the whole problem this file exists to remove.

The fix is a request every `KEEPALIVE_INTERVAL_MINUTES` to our own public URL,
so the 15-minute idle timer never runs out. It leaves the process, crosses the
internet and comes back through Render's router, which is what makes it count
as traffic — a call to 127.0.0.1 would never be seen by the router and would
keep nothing alive.

Two limits are worth knowing before trusting it:

  * **it prevents a spin-down, it cannot undo one.** The pinger is a task
    inside the very process that gets stopped, so once the instance is down
    nothing is left running to wake it. It has to be up already — after a
    deploy, or after the first visitor of the day pays the cold start once.
    An outside caller (`.github/workflows/keep-backend-awake.yml`) is what
    covers that gap, and the two are complementary rather than redundant.
  * **it spends free instance hours.** Never sleeping means running ~744
    hours in a 31-day month against the 750 free hours a workspace gets. It
    fits, with no room for a second free web service in the same workspace.

Off unless `KEEPALIVE_ENABLED=true`, so a laptop and a test run never sit in a
loop making requests to themselves.
"""
import asyncio
import logging
import os
import random
import urllib.error
import urllib.request

from .config import settings

log = logging.getLogger(__name__)

# Long enough to survive a cold start at the other end (a redeploy can overlap
# with a ping), short enough that a hung socket cannot stall the next one.
_TIMEOUT_SECONDS = 30
# Spread the pings so a redeploy does not leave every instance calling on the
# same second, and so the pattern is not a metronome in the access log.
_JITTER_SECONDS = 30


def resolve_target() -> str:
    """The URL to ping, or "" if there is nothing sensible to ping.

    `RENDER_EXTERNAL_URL` is injected by Render itself, so a deployment needs
    no URL configured and cannot be left pinging the *previous* service after a
    rename. KEEPALIVE_URL overrides it for anything hosted elsewhere.
    """
    base = (settings.keepalive_url or os.getenv("RENDER_EXTERNAL_URL") or "").strip()
    if not base:
        return ""
    return base.rstrip("/") + "/health"


def _ping(url: str) -> int:
    """One blocking GET. Returns the status code."""
    request = urllib.request.Request(
        url,
        method="GET",
        # Named so this is recognisable in the access log as our own traffic
        # and not mistaken for a scanner hitting /health.
        headers={"User-Agent": "jaikvin-keepalive/1.0", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
        return response.status


async def _loop(url: str, interval_seconds: int) -> None:
    while True:
        # Sleep first: the process has just served its own startup, so there is
        # nothing to keep alive yet.
        await asyncio.sleep(interval_seconds + random.uniform(0, _JITTER_SECONDS))
        try:
            # urllib blocks, and blocking the event loop would stall every
            # request in flight for as long as the socket takes.
            status = await asyncio.to_thread(_ping, url)
            log.debug("keepalive → %s %s", url, status)
        except asyncio.CancelledError:
            raise
        except (urllib.error.URLError, OSError, ValueError) as exc:
            # A failed ping is not worth stopping over: the next one is ten
            # minutes away and the instance is still up either way. Warn rather
            # than error — a redeploy in progress lands here routinely.
            log.warning("keepalive ping to %s failed: %s", url, exc)
        except Exception:  # pragma: no cover - defensive
            # Anything unforeseen must not end the loop, or the service quietly
            # goes back to sleeping after 15 minutes with nothing in the log to
            # say why.
            log.exception("keepalive ping to %s raised", url)


def start(loop_factory=asyncio.create_task):
    """Start the pinger and return its task, or None if it should not run.

    Returning None rather than raising keeps the decision here instead of at
    every call site, and means a missing URL degrades to "no keepalive" rather
    than to "no API".
    """
    if not settings.keepalive_enabled:
        return None

    url = resolve_target()
    if not url:
        log.warning(
            "KEEPALIVE_ENABLED is set but no target URL is known — set "
            "KEEPALIVE_URL to the service's public address (RENDER_EXTERNAL_URL "
            "is only present on Render)"
        )
        return None

    # Below the 15-minute idle timeout, with room for a slow ping. 10 minutes is
    # the default for that reason; a larger value configured by hand would let
    # the instance sleep between pings and defeat the point.
    interval_seconds = max(60, settings.keepalive_interval_minutes * 60)
    if interval_seconds >= 15 * 60:
        log.warning(
            "KEEPALIVE_INTERVAL_MINUTES=%s is at or above Render's 15-minute idle "
            "timeout — the instance can still spin down between pings",
            settings.keepalive_interval_minutes,
        )

    log.info("keepalive: pinging %s every %s minutes", url, interval_seconds // 60)
    return loop_factory(_loop(url, interval_seconds))
