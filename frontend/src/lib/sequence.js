/* The item sequence — the order items are listed in, everywhere.

   Oswin's pipes first, smallest bore up (15 MM, 20 MM, 25 MM …), then VP's PP
   fittings, Hansa's PP, Hansa's nylon (GRN) and VP's nylon. VP and Hansa make
   both kinds, so it is the range that decides an item's place, not the
   supplier. A range the list does not name follows them.

   Inside a range, Setup → Item groups may split the goods into blocks that
   each print as a table of their own (Oswin's PMF pipes, by default).

   This mirrors calc.range_key / calc.item_rank on the server — the API sorts
   its own lists with that, and this sorts what the browser lays out itself
   (the documents). Keep the two in step. */

export const DEFAULT_SEQUENCE = ["Oswin", "VP-PP", "Hansa-PP", "Hansa-GRN", "VP-GRN", "Kiran"];

const KNOWN = Object.fromEntries(DEFAULT_SEQUENCE.map((k) => [k.toLowerCase(), k]));

/* What each range is called on screen. */
export const RANGE_LABEL = {
  Oswin: "Oswin (by bore — 15 MM, 20 MM …)",
  "VP-PP": "VP Plastics — PP",
  "Hansa-PP": "Hansa — PP",
  "Hansa-GRN": "Hansa — GRN (Nylon)",
  "VP-GRN": "VP Plastics — GRN (Nylon)",
  Kiran: "Kiran",
};

const INCH_TO_MM = { 0.5: 15, 0.75: 20, 1: 25, 1.25: 32, 1.5: 40, 2: 50, 2.5: 65, 3: 80, 4: 100 };

/* Accepts an item in either spelling — the API's (source_sheet, sticker_rule)
   or the document engine's (sourceSheet, stickerRule). */
const pick = (it, a, b) => (it?.[a] ?? it?.[b] ?? "");

export function rangeKey(it, supplierCode = "") {
  const sheet = String(pick(it, "source_sheet", "sourceSheet")).trim().toLowerCase();
  if (KNOWN[sheet]) return KNOWN[sheet];
  const code = String(supplierCode || "").trim().toLowerCase();
  const grn = String(pick(it, "sticker_rule", "stickerRule")).toLowerCase() === "grn";
  if (code.startsWith("oswin")) return "Oswin";
  if (code.startsWith("vp")) return grn ? "VP-GRN" : "VP-PP";
  if (code.startsWith("hansa")) return grn ? "Hansa-GRN" : "Hansa-PP";
  if (code.startsWith("kiran")) return "Kiran";
  return "";
}

/* The bore in millimetres: "15", '1/2"', '1-1/4"', or the "15 MM (1/2")" the
   group is named. Unknown sorts last. */
export function boreMm(it) {
  const raw = String(it?.size ?? "").trim();
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  const m = /^\s*(\d+)(?:\s*[-\s.]\s*(\d+)\s*\/\s*(\d+)|\s*\/\s*(\d+))?\s*(?:"|in|inch)/i.exec(raw);
  if (m) {
    const whole = Number(m[1]);
    const inches = m[2] ? whole + Number(m[2]) / Number(m[3]) : m[4] ? whole / Number(m[4]) : whole;
    const key = Math.round(inches * 100) / 100;
    return INCH_TO_MM[key] ?? Math.round(inches * 25.4);
  }
  const g = /(\d+(?:\.\d+)?)\s*MM/i.exec(String(it?.group ?? ""));
  return g ? Number(g[1]) : 1e9;
}

/* ---- Item groups inside a range ----
   A range can be split into blocks that print as tables of their own — Oswin's
   M/F threaded pipes (PMF…) below the rest of Oswin, for one. An item's
   category is the letters its GD code starts with (PE, PEL, PFH, PMF, PP …);
   Setup → Additional settings → Item groups puts categories into named groups
   and orders them. What no group names stays in the range's "rest" block, in
   the range's own order (Oswin by bore). Mirrors calc.item_block on the server.

   { range: [ { id, name, rest?, cats: [..], sort: "listed" | "natural" } ] } */
export const REST_GROUP = { id: "rest", name: "", rest: true, cats: [], sort: "natural" };

export const DEFAULT_GROUPS = {
  Oswin: [REST_GROUP, { id: "pmf", name: "PMF", cats: ["PMF"], sort: "listed" }],
};

/* The short name a block heading starts with. */
export const RANGE_SHORT = {
  Oswin: "Oswin", "VP-PP": "VP Plastics — PP", "Hansa-PP": "Hansa — PP",
  "Hansa-GRN": "Hansa — GRN", "VP-GRN": "VP Plastics — GRN", Kiran: "Kiran",
};

export function itemCategory(it) {
  const raw = String(it?.gd || "").trim() || String(it?.code || "").trim();
  const m = /^[A-Za-z]+/.exec(raw);
  return m ? m[0].toUpperCase() : "";
}

export function rangeBlocks(range, groups = DEFAULT_GROUPS) {
  const all = groups || DEFAULT_GROUPS;
  const key = Object.keys(all).find((k) => k.toLowerCase() === String(range || "").toLowerCase());
  const list = (key ? all[key] : []).map((g) => ({ ...g, cats: (g.cats || []).map((c) => String(c).toUpperCase()) }));
  return list.some((g) => g.rest) ? list : [{ ...REST_GROUP }, ...list];
}

/* Which block of its range an item sits in. `label` is what a heading prints:
   the range for its rest block, "Oswin · PMF" for a named group. */
export function itemBlock(it, supplierCode = "", groups = DEFAULT_GROUPS) {
  const range = rangeKey(it, supplierCode);
  const blocks = rangeBlocks(range, groups);
  const cat = itemCategory(it);
  let at = blocks.findIndex((g) => !g.rest && cat && g.cats.includes(cat));
  if (at < 0) at = blocks.findIndex((g) => g.rest);
  const g = blocks[at];
  const listed = !g.rest && (g.sort || "listed") === "listed";
  const short = RANGE_SHORT[range] || range || "Other";
  return {
    range, at, catAt: listed && g.cats.includes(cat) ? g.cats.indexOf(cat) : 0,
    key: `${range}#${g.id || at}`, name: g.name || "", rest: !!g.rest,
    label: g.rest ? (g.name ? `${short} · ${g.name}` : short) : `${short} · ${g.name || g.cats.join(" + ")}`,
  };
}

/* A sort key: [range place, block, category in block, bore, group, length,
   GD code, code]. */
export function itemRank(it, supplierCode = "", sequence = DEFAULT_SEQUENCE, groups = DEFAULT_GROUPS) {
  const seq = (sequence?.length ? sequence : DEFAULT_SEQUENCE).map((s) => String(s).toLowerCase());
  const key = rangeKey(it, supplierCode);
  const found = key ? seq.indexOf(key.toLowerCase()) : -1;
  const at = found < 0 ? seq.length : found;
  const blk = itemBlock(it, supplierCode, groups);
  const gd = String(it?.gd || it?.code || "");
  const code = String(it?.code || "");
  if (key === "Oswin") {
    const len = Number(String(it?.length ?? "").trim()) || 0;
    return [at, blk.at, blk.catAt, boreMm(it), String(it?.group || ""), len, gd, code];
  }
  return [at, blk.at, blk.catAt, 0, "", 0, gd, code];
}

const cmpKey = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
};

/* A comparator over items, given the suppliers they point at. `getItem` lets
   it sort anything that carries an item (a line, a row) rather than the item
   itself. Stable: equal items keep the order they came in. */
export function bySequence({ suppliers = [], sequence, groups, getItem = (x) => x, supplierOf } = {}) {
  const codeOf = Object.fromEntries((suppliers || []).map((s) => [s.id, s.code]));
  const keyOf = (x) => {
    const it = getItem(x) || {};
    const sid = supplierOf ? supplierOf(x) : (it.supplier_id ?? it.supplierId);
    return itemRank(it, codeOf[sid] || "", sequence, groups || DEFAULT_GROUPS);
  };
  return (a, b) => cmpKey(keyOf(a), keyOf(b));
}

/* A function naming the block anything that carries an item sits in, for the
   headings a list is broken up by. Same arguments as bySequence. */
export function blockOf({ suppliers = [], groups, getItem = (x) => x, supplierOf } = {}) {
  const codeOf = Object.fromEntries((suppliers || []).map((s) => [s.id, s.code]));
  return (x) => {
    const it = getItem(x) || {};
    const sid = supplierOf ? supplierOf(x) : (it.supplier_id ?? it.supplierId);
    return itemBlock(it, codeOf[sid] || "", groups || DEFAULT_GROUPS);
  };
}

/* The heading each row of an ordered list opens, if any: the block's label
   where the block changes — or nothing at all when the whole list is one
   block, so a list of one range reads exactly as it always did. */
export function blockHeads(rows, block) {
  const blocks = rows.map(block);
  if (new Set(blocks.map((b) => b.key)).size < 2) return rows.map(() => null);
  return blocks.map((b, i) => (i === 0 || blocks[i - 1].key !== b.key ? b.label : null));
}

/* Sorted copy — never mutates what it was handed. */
export const sortBySequence = (list, opts) => {
  const cmp = bySequence(opts);
  return (list || []).map((x, i) => [x, i]).sort((p, q) => cmp(p[0], q[0]) || p[1] - q[1]).map(([x]) => x);
};
