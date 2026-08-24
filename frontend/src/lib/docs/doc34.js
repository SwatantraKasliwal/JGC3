import { L, ddmm, esc, exporterBlock, num, sum } from "./common.js";

export const B_34 = (ctx) => {
  const rows = L(ctx), s = ctx.inv.ship || {};
  const net = sum(rows, "netTotal"), gross = sum(rows, "grossTotal"), tare = 2185;
  const html = `<div class="title">34 · CONTAINER WEIGHT DECLARATION (CWD)</div>${exporterBlock(ctx)}<br>
    <table style="width:100%">
      <tr><td class="k">Invoice No.</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Container No.</td><td>${esc(s.container || "—")}</td><td class="k">Seal No.</td><td>${esc(s.seal || "—")}</td></tr>
      <tr><td class="k">Vessel</td><td>${esc(s.vessel || "—")}</td><td class="k">BL No.</td><td>${esc(s.blNo || "—")}</td></tr>
      <tr><td class="k">No of Packages</td><td>${esc(s.pkgs || sum(rows, "boxes"))}</td><td class="k">Marks</td><td>${esc(s.marks || "—")}</td></tr>
    </table>
    <table><tr><th>Particulars</th><th>Weight (KGS)</th></tr>
      <tr><td>Nett Weight of Cargo</td><td class="r">${num(net)}</td></tr>
      <tr><td>Gross Weight of Cargo</td><td class="r">${num(gross)}</td></tr>
      <tr><td>Tare Weight of Container</td><td class="r">${num(tare)}</td></tr>
      <tr class="tot"><td>Verified Gross Mass (VGM)</td><td class="r">${num(gross + tare)}</td></tr></table>
    <p>We declare the above container weight is verified and correct. For ${esc(ctx.EXPORTER.name)}.</p>`;
  return { name: "CWD_34", html };
};
