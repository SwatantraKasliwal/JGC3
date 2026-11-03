/* Carton serials, the way the server keeps them (calc.lock_serials).

   A line's first carton number is allotted once — when the line joins the
   invoice — and stored on it. Customs have the numbers from then on, so they
   never move: dropping an item the supplier could not send leaves its numbers
   unused (i1 = 1, i3 = 3, not i3 = 2), and an item added later takes the
   numbers after the highest one the invoice has ever given out. Only a new
   serial start moves them, all by the same amount, or an explicit
   "renumber", which numbers every line afresh and closes the gaps.

   The edit form previews exactly what the save will do with this. */

/* The invoice's first carton: its serial start, else the number in its
   shipping marks ("GDW 6001-…"), else 2001 — as the documents read it. */
export function serialBase(serialStart, ship) {
  const start = Number(serialStart) || 0;
  if (start) return start;
  const m = /(\d{3,})/.exec(String(ship?.marks || ""));
  return m ? Number(m[1]) : 2001;
}

/* Each saved line's first carton: the stored one, or — on an invoice from an
   API that predates it — the next number down the lines. */
export function savedFroms(lines, base) {
  let next = base;
  return (lines || []).map((l) => {
    const from = l.serial_from != null ? Number(l.serial_from) : next;
    next = Math.max(next, from + (Number(l.boxes) || 0));
    return from;
  });
}

/* What saving `lines` would number them.

   inv       the invoice as saved (serial_start, ship, serial_next, lines)
   lines     the lines as they now stand, in order: { key, item_id, boxes }
   start     the serial start as now typed
   renumber  number everything afresh from the start

   → { ranges: { key: { from, to } }, clashes: [[keyA, keyB]], next, gaps } */
export function previewSerials({ inv, lines, start, renumber = false }) {
  const oldBase = serialBase(inv.serial_start, inv.ship);
  const base = serialBase(start, inv.ship);
  const shift = base - oldBase;
  const was = savedFroms(inv.lines, oldBase);
  const held = {};
  (inv.lines || []).forEach((l, i) => { held[l.item_id] = was[i]; });
  const oldNext = Math.max(oldBase, Number(inv.serial_next) || 0,
    ...(inv.lines || []).map((l, i) => was[i] + (Number(l.boxes) || 0)));

  const boxesOf = (l) => Math.max(0, Math.floor(Number(l.boxes) || 0));
  const ranges = {};
  let next;
  if (renumber) {
    next = base;
    lines.forEach((l) => { ranges[l.key] = { from: next, to: next + boxesOf(l) - 1 }; next += boxesOf(l); });
    return { ranges, clashes: [], next, gaps: 0 };
  }
  const kept = lines.filter((l) => held[l.item_id] != null);
  kept.forEach((l) => { const from = held[l.item_id] + shift; ranges[l.key] = { from, to: from + boxesOf(l) - 1 }; });
  const spans = kept.filter((l) => boxesOf(l) > 0).map((l) => ({ key: l.key, ...ranges[l.key] }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const clashes = [];
  for (let i = 1; i < spans.length; i++) if (spans[i].from <= spans[i - 1].to) clashes.push([spans[i - 1].key, spans[i].key]);
  next = Math.max(base, oldNext + shift, ...kept.map((l) => ranges[l.key].from + boxesOf(l)));
  lines.forEach((l) => {
    if (held[l.item_id] != null) return;
    ranges[l.key] = { from: next, to: next + boxesOf(l) - 1 };
    next += boxesOf(l);
  });
  // Numbers between the start and the last one given that no line now holds.
  const used = lines.reduce((n, l) => n + boxesOf(l), 0);
  return { ranges, clashes, next, gaps: Math.max(0, next - base - used) };
}

export const rangeText = (r, boxes) => (Number(boxes) > 0 && r ? `${r.from}–${r.to}` : "—");
