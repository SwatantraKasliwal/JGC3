/* Custom PO — which purchase orders a packing's boxes come off.

   Pure figures, shared by record packing and edit invoice, with no React in
   them so verify-docs can run them too. The API checks the same rules again
   when the invoice is saved (routers/invoices.py _resolve_allocation).

     rows    [{ item_id, boxes }]            what was entered
     open    { item_id: [{ po, date, buyer_id, open }] }   oldest first
     picked  [po]                            the orders ticked
     manual  { item_id: { po: boxes } }      lines split by hand; the others
                                             fill the ticked orders oldest first */

/* The orders holding at least one entered item with boxes still open — nothing
   else is offered. Oldest first, each saying how much of the entry it can take. */
export function eligiblePos(rows, open) {
  const by = new Map();
  rows.forEach((r) => (open?.[r.item_id] || []).forEach((o) => {
    const e = by.get(o.po) || { po: o.po, date: o.date, buyer_id: o.buyer_id, items: 0, boxes: 0 };
    e.items += 1;
    e.boxes += Number(o.open) || 0;
    by.set(o.po, e);
  }));
  return [...by.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.po).localeCompare(String(b.po)));
}

/* One line against the ticked orders.
     cells    { po: boxes } placed on each
     required what must be placed: the boxes, or all the orders hold if less
     spare    boxes beyond everything on order — reported, not placed
     short    still to place; negative when a hand split overshoots
     known    false until the API has answered for this item — nothing may be
              called "beyond what is on order" before then */
export function placeRow(row, legs, picked, manual) {
  const known = Array.isArray(legs);
  const boxes = Math.max(0, Math.floor(Number(row.boxes) || 0));
  const room = (legs || []).reduce((n, o) => n + (Number(o.open) || 0), 0);
  const required = Math.min(boxes, room);
  const on = (legs || []).filter((o) => picked.includes(o.po));
  const cells = {};
  if (manual) {
    on.forEach((o) => {
      const n = Math.min(Math.max(0, Math.floor(Number(manual[o.po]) || 0)), Number(o.open) || 0);
      if (n > 0) cells[o.po] = n;
    });
  } else {
    let left = required;
    on.forEach((o) => {
      const n = Math.min(Number(o.open) || 0, left);
      if (n > 0) { cells[o.po] = n; left -= n; }
    });
  }
  const placed = Object.values(cells).reduce((n, v) => n + v, 0);
  return { cells, placed, required, spare: known ? Math.max(0, boxes - room) : 0, short: required - placed, known };
}

/* Every line at once. `ok` is what the save needs: the orders are known, and
   every box they have room for sits on an order. */
export function placement(rows, open, picked, manual) {
  const byItem = {};
  let short = 0, over = 0, spare = 0, known = true;
  rows.forEach((r) => {
    if (!open?.[r.item_id]) known = false;
    const p = placeRow(r, open?.[r.item_id], picked, manual?.[r.item_id]);
    byItem[r.item_id] = p;
    if (p.short > 0) short += p.short; else over -= p.short;
    spare += p.spare;
  });
  return { byItem, short, over, spare, ok: known && !short && !over };
}

/* What the API stores on the line. */
export const toPins = (cells) => Object.entries(cells || {})
  .filter(([, n]) => n > 0).map(([po, boxes]) => ({ po, boxes }));

/* An invoice's saved lines back into the ticks and hand-split figures, so
   editing it opens as it was saved. */
export function fromLines(lines) {
  const picked = new Set(), manual = {};
  (lines || []).forEach((l) => (l.po_alloc || []).forEach((p) => {
    picked.add(p.po);
    (manual[l.item_id] ||= {})[p.po] = Number(p.boxes) || 0;
  }));
  return { picked: [...picked], manual };
}
