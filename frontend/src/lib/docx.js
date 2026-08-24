/* ============================================================================
   A real .docx writer, with no dependencies.

   Two of the client's papers are Word documents rather than workbooks — the
   annexure that staples to the bill of lading (24), and the container weight
   declaration (34). They are typed sheets: a heading, some lines, a couple of
   ruled tables. Handing those out as a spreadsheet would be handing out
   something the client would have to retype before sending it on, so they are
   written as what they are.

   A document is a plain object:

     { blocks, page, font }

   `blocks` is an array of:

     { kind: "p", text, align?, bold?, underline? } ... a paragraph
     { kind: "tbl", grid, rows } ...................... a ruled table

   `grid` is the column widths in twips (1440 to the inch, as Word states
   them), and `rows` an array of rows, a row an array of cells:

     [text] | [text, span] .... span is how many of the grid's columns it takes

   The tables are ruled the way Word's own rule them and the client's file does:
   dotted between one line and the next, solid down between the columns, solid
   under the last line, and nothing around the outside.
   ============================================================================ */
import { X, utf8, zipBlob } from "./zip.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/* Word measures type in half-points, and a paragraph's own run properties have
   to be repeated on the paragraph mark as well or the line spacing jumps. */
const runPr = (f, b, u) =>
  `<w:rPr><w:rFonts w:ascii="${X(f.name)}" w:hAnsi="${X(f.name)}" w:cs="${X(f.name)}"/>${b ? "<w:b/>" : ""}${u ? '<w:u w:val="single"/>' : ""}<w:sz w:val="${f.size * 2}"/><w:szCs w:val="${f.size * 2}"/></w:rPr>`;

const para = (f, { text = "", align, bold, underline } = {}) => {
  const jc = align ? `<w:jc w:val="${align}"/>` : "";
  const pr = runPr(f, bold, underline);
  const run = text ? `<w:r>${pr}<w:t xml:space="preserve">${X(text)}</w:t></w:r>` : "";
  return `<w:p><w:pPr>${jc}<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${pr}</w:pPr>${run}</w:p>`;
};

const TBL_BORDERS = '<w:tblBorders>'
  + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
  + '<w:insideH w:val="dotted" w:sz="4" w:space="0" w:color="auto"/>'
  + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
  + "</w:tblBorders>";

function table(f, { grid, rows }) {
  const total = grid.reduce((a, x) => a + x, 0);
  const cols = grid.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const body = rows.map((r) => {
    let at = 0;
    const cells = r.map(([text, span = 1]) => {
      const w = grid.slice(at, at + span).reduce((a, x) => a + x, 0);
      at += span;
      return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}</w:tcPr>${para(f, { text })}</w:tc>`;
    }).join("");
    return `<w:tr>${cells}</w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${TBL_BORDERS}<w:tblLayout w:type="fixed"/></w:tblPr>`
    + `<w:tblGrid>${cols}</w:tblGrid>${body}</w:tbl>`;
}

/** Build the .docx package for a document and hand back a Blob. */
export function buildDOCX({ blocks = [], page = {}, font = {} } = {}) {
  const f = { name: font.name || "Calibri", size: font.size || 12 };
  /* Word's page is stated in twips. A4 and the margins of a typed letter are
     what these papers are set on unless the caller says otherwise. */
  const p = {
    w: page.w || 11905, h: page.h || 16837,
    top: page.top ?? 1440, bottom: page.bottom ?? 1440,
    left: page.left ?? 1800, right: page.right ?? 1800,
  };
  /* A table may not be the last thing in a body — Word wants a paragraph after
     it — so one is added if the document ends on a table. */
  const list = blocks[blocks.length - 1]?.kind === "tbl" ? [...blocks, { kind: "p" }] : blocks;
  const body = list.map((b) => (b.kind === "tbl" ? table(f, b) : para(f, b))).join("");
  const sect = `<w:sectPr><w:pgSz w:w="${p.w}" w:h="${p.h}"/>`
    + `<w:pgMar w:top="${p.top}" w:right="${p.right}" w:bottom="${p.bottom}" w:left="${p.left}"`
    + ' w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';

  const files = [
    {
      name: "[Content_Types].xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
    },
    {
      name: "_rels/.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    },
    {
      name: "word/_rels/document.xml.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    },
    {
      name: "word/styles.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${X(f.name)}" w:hAnsi="${X(f.name)}" w:cs="${X(f.name)}"/><w:sz w:val="${f.size * 2}"/><w:szCs w:val="${f.size * 2}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`),
    },
    {
      name: "word/document.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}${sect}</w:body></w:document>`),
    },
  ];

  return zipBlob(files, DOCX_MIME);
}
