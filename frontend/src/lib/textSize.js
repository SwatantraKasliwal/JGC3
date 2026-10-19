/* Text size — five steps, picked in the profile menu.

   Most of the app's type is inline pixel sizes, which a root font-size could
   never reach, so the whole UI is drawn at a CSS zoom instead (index.css:
   --app-zoom, 1.12 on a monitor and 1 on a phone). The step chosen here sets
   --text-scale, which multiplies that zoom: type, spacing and controls grow
   together the way browser zoom does. The popups divide their screen-sized
   boxes by the same factor, so a larger step makes them hold less rather than
   spill off the screen.

   Remembered per browser, like the theme, and applied in main.jsx before the
   first paint, so the page never jumps size on load. Storage is in a try: a
   private window refuses it and the app must still work there. */

export const TEXT_SIZES = [
  { k: "xs", label: "Extra small", scale: 0.8 },
  { k: "s", label: "Small", scale: 0.9 },
  { k: "m", label: "Default", scale: 1 },
  { k: "l", label: "Large", scale: 1.1 },
  { k: "xl", label: "Extra large", scale: 1.2 },
];

const KEY = "jg-text-size";
const DEFAULT = "m";

export const textSizeOf = (k) =>
  TEXT_SIZES.find((s) => s.k === k) || TEXT_SIZES.find((s) => s.k === DEFAULT);

export const readTextSize = () => {
  try { return textSizeOf(localStorage.getItem(KEY)).k; } catch (e) { return DEFAULT; }
};

/* Puts the step on the page and remembers it. */
export const applyTextSize = (k) => {
  const step = textSizeOf(k);
  document.documentElement.style.setProperty("--text-scale", String(step.scale));
  try { localStorage.setItem(KEY, step.k); } catch (e) { /* ignore */ }
};
