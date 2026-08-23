import { ddmm, esc, exporterBlock, orderAgg, orderRefOf, sum, tableOf, usd, usdp } from "./common.js";

/* ---------- Stage A · Buyer order ---------- */
export const B_1 = (ctx) => {
  const rows = orderAgg(ctx);
  const cols = [
    { h: "#", c: 1, f: (r) => rows.indexOf(r) + 1 },
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Size", c: 1, f: (r) => esc(r.it.size) },
    { h: "Qty (Pcs)", r: 1, key: "qty", t: "int", v: (r) => r.qty, f: (r) => r.qty.toLocaleString("en-IN") },
    { h: "Rate $/pc", r: 1, key: "rate", t: "usd4", v: (r) => r.fobPc, f: (r) => usdp(r.fobPc) },
    { h: "Amount $", r: 1, key: "amount", t: "usd", fml: "{qty}*{rate}", f: (r) => usd(r.fobTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 5 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1, sum: "amount", t: "usd" }];
  const html = `<div class="title">BUYER PURCHASE ORDER</div>
    <table style="width:100%"><tr><td style="width:55%">${exporterBlock(ctx)}</td>
      <td><table style="width:100%"><tr><td class="k">PO No.</td><td class="b">${esc(orderRefOf(ctx))}</td></tr>
      <tr><td class="k">Date</td><td class="b">${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Buyer</td><td class="b">${esc(ctx.buyer.name)} T/A ${esc(ctx.buyer.brand)}</td></tr>
      <tr><td class="k">Our Reference</td><td class="b">${esc(ctx.buyer.ourReference || "")}</td></tr>
      <tr><td class="k">Ship To</td><td>${esc(ctx.buyer.addr || ctx.buyer.shipTo)}</td></tr></table></td></tr></table>
    ${tableOf(cols, rows, foot)}`;
  return { name: "Buyers_Order", html };
};
