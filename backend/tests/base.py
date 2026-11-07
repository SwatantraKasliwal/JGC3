"""Test harness. Importing app.main runs create_all + migrations against whatever
DATABASE_URL says, and backend/.env points at the live database — so the
environment is pinned here, before anything from `app` is imported, and the run
stops dead if it ended up anywhere but a throwaway database.

    cd backend
    PYTHONPATH=.venv/lib/python3.12/site-packages /usr/bin/python3.12 -m unittest discover -s tests -t . -v

Set JG_TEST_DATABASE_URL to run the same suite on a throwaway Postgres.
"""
import os
import tempfile
import unittest

_scratch = tempfile.mkdtemp(prefix="jg-tests-")
_url = os.environ.get("JG_TEST_DATABASE_URL") or f"sqlite:///{_scratch}/test.db"
if "neon" in _url or "render.com" in _url:
    raise SystemExit("Refusing to run the tests against a hosted database.")

ORIGIN = "http://testserver"
os.environ.update({
    "DATABASE_URL": _url, "ENVIRONMENT": "development", "OTP_ENABLED": "false",
    "RATE_LIMIT_ENABLED": "false", "MAIL_PROVIDER": "smtp", "MAIL_API_KEY": "", "SMTP_HOST": "",
    "COOKIE_SECURE": "false", "CORS_ORIGINS": ORIGIN,
})

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app import models  # noqa: E402
from app.main import app  # noqa: E402
from app.security import create_token, hash_password  # noqa: E402

assert settings.database_url == _url, "the test database did not take effect"
assert "neon" not in str(engine.url), "connected to the live database"


class ApiCase(unittest.TestCase):
    """A clean database and a signed-in admin for every test, with the order book
    from the brief: four purchase orders, of which PO1 and PO2 hold the items
    packed. Item prices differ by order so a wrong allocation shows in the money."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        admin = models.User(email="admin@jaikvin-test.com", password_hash=hash_password("x"), name="Admin",
                            role="admin", status="active", access=[], email_verified=True, token_version=1)
        db.add(admin)
        db.commit()
        self.client.cookies.set(settings.cookie_name, create_token(admin.id, 1))
        db.close()
        self.client.headers.update({"Origin": ORIGIN})

        self.sup = self.ok(self.client.post("/api/suppliers", json={"code": "Kiran", "name": "Kiran Plastics", "place": "Mumbai"}))
        self.sup2 = self.ok(self.client.post("/api/suppliers", json={"code": "Hansa", "name": "Hansa Polymers", "place": "Bhiwandi"}))
        self.buyer = self.ok(self.client.post("/api/buyers", json={"name": "Corecomp", "brand": "GDW", "ports": []}))
        self.i = {}
        for n in range(1, 7):
            self.i[n] = self.ok(self.client.post("/api/items", json={
                "code": f"I{n}", "gd": f"GD{n}", "description": f"Item {n}", "packing": 10,
                "supplier_id": self.sup["id"] if n < 5 else self.sup2["id"],
                "unit_value": 100.0, "unit_fob100": 50.0, "value_mode": "piece", "fob_mode": "100", "volume": 0.1,
            }))["id"]
        # Each order: {item number: boxes}. Packing is 10 pieces a box.
        self.place_order("PO1", "2026-01-10", {1: 20, 2: 20, 3: 20})
        self.place_order("PO2", "2026-02-10", {1: 30, 2: 30, 4: 30, 5: 10})
        self.place_order("PO3", "2026-03-10", {6: 5})
        self.place_order("PO4", "2026-04-10", {6: 5})

    def ok(self, resp, code=None):
        self.assertTrue(resp.is_success if code is None else resp.status_code == code, f"{resp.status_code} {resp.text}")
        return resp.json() if resp.content else None

    def place_order(self, po, date, boxes):
        self.ok(self.client.post("/api/purchase-orders", json={
            "po": po, "date": date, "buyer_id": self.buyer["id"], "rbi": 80.0,
            "lines": [{"item_id": self.i[n], "qty": b * 10} for n, b in boxes.items()],
        }))

    def invoice_body(self, no, boxes, pins=None, date="2026-05-01", mode=None):
        """`boxes` {item number: boxes}; `pins` {item number: {po: boxes}}."""
        lines = []
        for n, b in boxes.items():
            line = {"item_id": self.i[n], "supplier_id": self.sup["id"] if n < 5 else self.sup2["id"], "boxes": b}
            if pins is not None:
                line["po_alloc"] = [{"po": k, "boxes": v} for k, v in pins.get(n, {}).items()]
            lines.append(line)
        return {"invoice_no": no, "date": date, "buyer_id": self.buyer["id"], "serial_start": 1001,
                "allocation": mode or ("custom" if pins is not None else "fifo"), "lines": lines}

    def record(self, no, boxes, pins=None, **kw):
        return self.ok(self.client.post("/api/invoices", json=self.invoice_body(no, boxes, pins, **kw)), 201)

    def legs(self, inv, n):
        """{po: boxes} an invoice's boxes of item n were put on, re-read from the API."""
        fresh = self.ok(self.client.get(f"/api/invoices/{inv['id']}"))
        return {x["po"]: x["boxes"] for x in fresh["po_legs"].get(self.i[n], [])}

    def pending(self, po, n):
        """Boxes of item n still owed on a PO, per the balance register."""
        rows = self.ok(self.client.get("/api/reports/balance"))["po"]
        return sum(r["pending"] for r in rows if r["po"] == po and r["item_id"] == self.i[n])
