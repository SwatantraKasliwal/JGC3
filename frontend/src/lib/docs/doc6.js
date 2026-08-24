import { supplierPoDocs } from "./common.js";

export const B_6 = (ctx) => ({
  name: "Suppliers_PO_6",
  html: supplierPoDocs(ctx).map((d) => d.html).join('<div class="pgbrk"></div>'),
  page: "portrait",
});
