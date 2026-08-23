import { FOOT_PT, L, PROFORMA_FAMILIES, PROFORMA_ROWS, SIGN_PT, USD, buyerLogoImage, commonOf, ddmm, deliveryMonth, esc, familyOf, fitSheet, fobModeOf, forLine, formGrid, num, perLabel, proformaFooter, proformaRate, sum, usd } from "./common.js";

/* A band per item group, in the order the invoice runs. A band whose goods have
   no length loses that column, as their moulded-fitting pages do. */
export function proformaBands(ctx) {
  const bands = new Map();
  L(ctx).forEach((r) => {
    const key = familyOf(r.it);
    if (!bands.has(key)) bands.set(key, []);
    bands.get(key).push(r);
  });
  // Families in the order their form prints them, whatever order they were
  // packed in; anything unrecognised follows, under its own heading.
  return PROFORMA_FAMILIES.filter(([k]) => bands.has(k)).map(([k, head]) => {
    const rows = bands.get(k);
    return {
      head,
      rows,
      boxes: k === "box",
      lengths: rows.some((r) => String(r.it.length || "").trim()),
      per: commonOf(rows, (r) => fobModeOf(r.it)) === "piece" ? "Per Piece" : "Per 100 Pieces",
    };
  });
}

export function proforma17Sheet(ctx, bands) {
  const E = ctx.EXPORTER;
  const b = ctx.buyer;
  const P = {
    ttl: { font: "refb11", border: false, align: "right", valign: "center" },
    brand: { font: "refb14", border: false, align: "center", valign: "center" },
    sub: { font: "ref", border: false, align: "center", valign: "center" },
    lbl: { font: "ref", border: false, valign: "center" },
    val: { font: "refb", border: false, valign: "center" },
    box: { font: "ref", border: "box", valign: "top", wrap: true },
    boxC: { font: "ref", border: "box", align: "center", valign: "center" },
    band: { font: "refb", border: "box", valign: "center" },
    head: { font: "refb", border: "box", align: "center", valign: "center", wrap: true },
    code: { font: "ref", border: "box", align: "center", valign: "center" },
    per: { font: "ref", border: "box", align: "center", valign: "center", wrap: true },
    num: { font: "ref", border: "box", align: "center", valign: "center", fmt: "int" },
    money: { font: "ref", border: "box", align: "right", valign: "center", fmt: USD },
    blank: { font: "ref", border: "box", valign: "center" },
    tot: { font: "refb", border: "rt", align: "right", valign: "center", fmt: USD },
    totLbl: { font: "refb", border: "t", align: "center", valign: "center" },
    plain: { font: "ref", border: false, valign: "center" },
    /* The contact strip along the foot, set small as their paper sets it, and
       the line the order is signed for — held to the top of the freight run so
       the space beneath it is left clear to sign in. */
    foot: { font: "ref8", border: false, align: "center", valign: "center" },
    signTop: { font: "ref", border: false, align: "center", valign: "top" },
    /* The runs their form rules as one unbroken box rather than a row of
       cells. Only the edges the box itself owns are drawn, so no rule falls
       between the columns it crosses. */
    boxTL: { font: "refb", border: "lt", align: "center", valign: "center" },
    boxT: { font: "refb", border: "t", align: "center", valign: "center" },
    boxTR: { font: "ref", border: "rt", valign: "center" },
    boxML: { font: "ref", border: "l", align: "center", valign: "center" },
    boxM: { font: "ref", border: false, align: "center", valign: "center" },
    boxMR: { font: "ref", border: "r", valign: "center" },
    boxBL: { font: "ref", border: "lb", valign: "center" },
    boxB: { font: "ref", border: "b", valign: "center" },
    boxBR: { font: "ref", border: "rb", valign: "center" },
    frLbl: { font: "refb", border: "lt", align: "center", valign: "center" },
    frVal: { font: "ref", border: "rt", valign: "center" },
    frLblB: { font: "refb", border: "lb", align: "center", valign: "center" },
    frValB: { font: "ref", border: "rb", valign: "center" },
  };
  const G = formGrid(8);
  const { row, gap } = G;

  // The mark stands in this row, so it is given the height to hold it.
  row([[5, { v: "", s: P.plain }], [2, { v: "PURCHASE ORDER", s: P.ttl }], [1, { v: "", s: P.plain }]],
    b.logo ? 46 : undefined);
  row([[4, { v: b.name || "", s: P.brand }], [1, { v: "NO.", s: P.lbl }], [3, { v: b.orderNo || "", s: P.val }]], 21);
  row([[4, { v: b.tagline || (b.brand ? `T/A ${b.brand}` : ""), s: P.sub }],
    [1, { v: "DATE", s: P.lbl }], [3, { v: ddmm(ctx.inv.date), s: P.val }]]);
  gap();

  row([[1, { v: "", s: P.plain }], [3, { v: "TO:", s: P.lbl }],
    [1, { v: "", s: P.plain }], [3, { v: "DELIVER TO:", s: P.lbl }]]);
  row([[1, { v: "", s: P.plain }], [3, { v: [E.name, E.addr].filter(Boolean).join("\n"), s: P.box }],
    [1, { v: "", s: P.plain }],
    [3, { v: [`${b.name || ""}${b.brand ? ` T/A ${b.brand}` : ""}`, b.addr || b.shipTo || ""].filter(Boolean).join("\n"), s: P.box }]], 42);
  gap();

  // The account-code strip: one box, three rows deep, no rule down the middle.
  row([[3, { v: "A/C CODE", s: P.boxTL }], [3, { v: "TEL NUMBER", s: P.boxT }], [2, { v: "", s: P.boxTR }]]);
  row([[3, { v: b.acCode || "", s: P.boxML }], [3, { v: `+91-${E.tel}`, s: P.boxM }], [2, { v: "", s: P.boxMR }]]);
  row([[3, { v: "", s: P.boxBL }], [3, { v: "", s: P.boxB }], [2, { v: "", s: P.boxBR }]]);
  gap();

  const first = G.at() + 1;
  let lines = 0;
  /* The eighths a band's own columns take — the length is worth two of them,
     and a band without one gives the size all three. */
  const shapeOf = (band) => (band.lengths ? [1, 1, 2, 1, 1, 1, 1] : [1, 3, 1, 1, 1, 1]);
  bands.forEach((band) => {
    row([[8, { v: band.head, s: P.band }]]);
    const H = band.boxes
      ? ["CODE", "SIZE (MM)", "PIECES", "Unit Price.", "Per Piece", "Total Value."]
      : band.lengths
        ? ["CODE", "SIZE (MM / IN)", "LEN (MM)", "PIECES", "RATE", band.per, "TOTAL VALUE"]
        : ["CODE", "SIZE (MM)", "PIECES", "RATE", band.per, "TOTAL VALUE"];
    const shape = shapeOf(band);
    row(H.map((v, i) => [shape[i], { v, s: P.head }]));
    band.rows.forEach((r) => {
      const line = G.at() + 1;
      const per100 = fobModeOf(r.it) !== "piece";
      const cells = [
        [1, { v: r.it.code || "", s: P.code }],
        [shape[1], { v: r.it.size || "", s: P.code }],
      ];
      if (band.lengths) cells.push([shape[2], { v: r.it.length || "", s: P.code }]);
      /* Whatever the band's shape, the pieces land on E and the rate on F —
         the size takes up the slack — so one formula serves both. */
      cells.push(
        [1, { v: r.pieces, t: "n", s: P.num }],
        [1, { v: proformaRate(r), t: "n", s: P.money }],
        [1, { v: perLabel(r.it), s: P.per }],
        [1, { f: `E${line}*F${line}${per100 ? "/100" : ""}`, s: P.money }],
      );
      row(cells);
      lines += 1;
    });
  });
  // The rest of the frame, ruled and empty, keeping the last band's columns.
  const fillShape = bands.length ? shapeOf(bands[bands.length - 1]) : [8];
  for (let i = lines; i < PROFORMA_ROWS; i++) row(fillShape.map((n) => [n, { v: "", s: P.blank }]));
  const last = G.at();
  row([[5, { v: "", s: { border: "lt" } }], [2, { v: "Total", s: P.totLbl }],
    [1, { f: first <= last ? `SUM(H${first}:H${last})` : "0", s: P.tot }]]);
  row([[5, { v: "", s: { border: "lb" } }], [2, { v: "", s: P.boxB }], [1, { v: "", s: P.boxBR }]]);
  gap();

  /* The freight terms and the line the order is signed for stand side by side,
     the name on the first of the two rows so the space below it stays clear —
     that is where the stamp and the signature go once it is printed. */
  row([[1, { v: "FREIGHT", s: P.frLbl }], [3, { v: "TO COLLECT / PAYABLE AT DESTINATION", s: P.frVal }],
    [4, { v: forLine(b), s: P.signTop }]]);
  row([[1, { v: "DELIVERY", s: P.frLblB }], [3, { v: deliveryMonth(ctx), s: P.frValB }],
    [4, { v: "", s: P.plain }]]);
  gap(SIGN_PT);
  proformaFooter(b).forEach((l) => {
    if (l.spaced) gap(FOOT_PT);
    row([[8, { v: l.text, s: P.foot }]], FOOT_PT);
  });

  return fitSheet({
    name: "Proforma",
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: Array(8).fill(11.5),
    defaultRowHeight: 14.25,
    colStyle: { font: "ref", border: false, valign: "center" },
    image: buyerLogoImage(b),
    page: {
      paper: 9, orientation: "portrait", fit: true, fitH: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

/* A blank line in the form, matching the worksheet's own gap rows. */
export const SPACE = '<tr class="nb"><td class="nb" colspan="8" style="height:9px"></td></tr>';

/* The space their paper leaves under the line the order is signed for, for the
   stamp and the signature, and the shorter break before the last line of the
   contact strip — the same two gaps the worksheet leaves, in pixels. */
export const SIGN_SPACE = '<tr class="nb"><td class="nb" colspan="8" style="height:44px"></td></tr>';

export const FOOT_SPACE = '<tr class="nb"><td class="nb" colspan="8" style="height:11px"></td></tr>';

/* Several runs of their form are one ruled box with the text set at fixed
   points inside it rather than a row of cells — the account-code strip, the
   total line, the freight block. Each is one cell of the eight-column grid
   holding a table of its own that draws no rules, so the box stays unbroken
   while the text still lands on the eighths. `parts` are [width%, class, html]. */
export const bpoBox = (rows) => `<table class="in">${rows.map((cells) => `<tr>${cells
  .map(([w, cls, v]) => `<td style="width:${w}%"${cls ? ` class="${cls}"` : ""}>${v == null ? "" : v}</td>`)
  .join("")}</tr>`).join("")}</table>`;

export const B_17 = (ctx) => {
  const E = ctx.EXPORTER;
  const b = ctx.buyer;
  const bands = proformaBands(ctx);
  const total = sum(L(ctx), "fobTotal");
  const addr = (lines) => lines.filter(Boolean).map(esc).join("<br>");
  const lines = bands.reduce((n, band) => n + band.rows.length, 0);

  /* The eighths a band's own columns take. The length is worth two of them;
     a band without one gives the size all three. */
  const shapeOf = (band) => (band.lengths ? [1, 1, 2, 1, 1, 1, 1] : [1, 3, 1, 1, 1, 1]);
  const span = (n) => (n > 1 ? ` colspan="${n}"` : "");

  const section = (band) => {
    /* The cartons are headed in their own words on their form — "Unit Price."
       and "Total Value." where the goods above say RATE and TOTAL VALUE. */
    const H = band.boxes
      ? ["CODE", "SIZE (MM)", "PIECES", "Unit Price.", "Per Piece", "Total Value."]
      : band.lengths
        ? ["CODE", "SIZE (MM / IN)", "LEN (MM)", "PIECES", "RATE", band.per, "TOTAL VALUE"]
        : ["CODE", "SIZE (MM)", "PIECES", "RATE", band.per, "TOTAL VALUE"];
    const shape = shapeOf(band);
    const head = `<tr>${H.map((h, i) => `<th${span(shape[i])}>${esc(h)}</th>`).join("")}</tr>`;
    /* Their goods are ruled down the columns but not across: a line separates
       the heading from the first item and nothing separates the items from one
       another, so a band reads as one block. Hence `ln` — see the print CSS. */
    const body = band.rows.map((r) => {
      const rate = proformaRate(r);
      return `<tr class="ln"><td class="c">${esc(r.it.code)}</td>
        <td class="c"${span(shape[1])}>${esc(r.it.size)}</td>
        ${band.lengths ? `<td class="c"${span(shape[2])}>${esc(r.it.length)}</td>` : ""}
        <td class="c" data-t="int" data-v="${r.pieces}">${r.pieces.toLocaleString("en-IN")}</td>
        <td class="r" data-t="usd" data-v="${rate}">${usd(rate)}</td>
        <td class="c">${esc(perLabel(r.it))}</td>
        <td class="r" data-t="usd" data-v="${r.fobTotal}">${usd(r.fobTotal)}</td></tr>`;
    }).join("");
    return `<tr class="po"><td colspan="8">${esc(band.head)}</td></tr>${head}${body}`;
  };

  /* The frame runs on past the goods to the foot of the page, and the empty
     rows keep the rules of the band above them, as their form leaves them. */
  const fillShape = bands.length ? shapeOf(bands[bands.length - 1]) : [8];
  const filler = `<tr class="ln">${fillShape.map((n) => `<td${span(n)}>&nbsp;</td>`).join("")}</tr>`;

  /* The masthead, the addresses and the account code repeat at the top of
     every printed page, as they do on page 2 of their own form.

     Their sheet rules everything on eight equal columns: the mark and their
     name over the first four, the order number and date on the fifth and what
     follows, the two address boxes on the second-to-fourth and sixth-to-last
     with a column of air between them. */
  const html = `<table class="wb bpo">
      <colgroup>${Array(8).fill('<col style="width:12.5%">').join("")}</colgroup>
      <thead>
        <tr class="nb"><td class="nb c" colspan="4">${b.logo ? `<img class="bpo-logo" src="${esc(b.logo)}" alt="">` : ""}</td>
          <td class="nb"></td><td class="nb b c ttl" colspan="2">PURCHASE ORDER</td><td class="nb"></td></tr>
        <tr class="nb"><td class="nb big c" colspan="4">${esc(b.name || "")}</td>
          <td class="nb">NO.</td><td class="nb b val" colspan="3">${esc(b.orderNo || "")}</td></tr>
        <tr class="nb"><td class="nb c tag" colspan="4">${esc(b.tagline || (b.brand ? `T/A ${b.brand}` : ""))}</td>
          <td class="nb">DATE</td><td class="nb b val" colspan="3">${ddmm(ctx.inv.date)}</td></tr>
        ${SPACE}
        <tr class="nb"><td class="nb"></td><td class="nb" colspan="3">TO:</td>
          <td class="nb"></td><td class="nb" colspan="3">DELIVER TO:</td></tr>
        <tr><td class="nb"></td><td class="party" colspan="3">${addr([E.name, E.addr])}</td>
          <td class="nb"></td>
          <td class="party" colspan="3">${addr([`${b.name || ""}${b.brand ? ` T/A ${b.brand}` : ""}`, b.addr || b.shipTo])}</td></tr>
        ${SPACE}
        <tr><td class="bx" colspan="8">${bpoBox([
          [[37.5, "c", "A/C CODE"], [37.5, "c", "TEL NUMBER"], [25, null, null]],
          [[37.5, "c", esc(b.acCode || "")], [37.5, "c", `+91-${esc(E.tel)}`], [25, null, null]],
          [[37.5, null, "&nbsp;"], [37.5, null, null], [25, null, null]],
        ])}</td></tr>
        ${SPACE}
      </thead>
      <tbody>
        ${bands.map(section).join("")}
        ${Array(Math.max(0, PROFORMA_ROWS - lines)).fill(filler).join("")}
        <tr><td class="bx" colspan="8">${bpoBox([
          [[62.5, null, null], [25, "c", "Total"], [12.5, "r b", usd(total)]],
          [[62.5, null, "&nbsp;"], [25, null, null], [12.5, null, null]],
        ])}</td></tr>
        ${SPACE}
        <tr class="sig"><td class="bx" colspan="4">${bpoBox([
          [[25, "c b", "FREIGHT"], [75, null, "TO COLLECT / PAYABLE AT DESTINATION"]],
          [[25, "c b", "DELIVERY"], [75, null, esc(deliveryMonth(ctx))]],
        ])}</td>
          <td class="nb c sign" colspan="4">${esc(forLine(b))}</td></tr>
        ${SIGN_SPACE}
        ${proformaFooter(b).map((l) => `${l.spaced ? FOOT_SPACE : ""}<tr class="ft"><td class="nb c foot" colspan="8">${esc(l.text)}</td></tr>`).join("")}
      </tbody>
    </table>`;
  return { name: "Proforma_Invoice_17", html, sheet: proforma17Sheet(ctx, bands), page: "portrait" };
};
