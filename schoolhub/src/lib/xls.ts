// Dependency-free Excel export using the SpreadsheetML 2003 (.xls) XML format,
// which Excel, Numbers and LibreOffice all open natively. Serve with
// Content-Type: application/vnd.ms-excel.

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isNum = (v: any) => typeof v === "number" || (typeof v === "string" && v !== "" && /^-?\d+(\.\d+)?$/.test(v));

function cell(v: any): string {
  if (isNum(v)) return `<Cell><Data ss:Type="Number">${esc(v)}</Data></Cell>`;
  return `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
}
function row(cells: any[]): string {
  return `<Row>${cells.map(cell).join("")}</Row>`;
}
function header(cells: any[]): string {
  return `<Row>${cells.map((c) => `<Cell ss:StyleID="h"><Data ss:Type="String">${esc(c)}</Data></Cell>`).join("")}</Row>`;
}

export type Sheet = { name: string; headers: string[]; rows: (string | number)[][]; title?: string };

export function sheetsToXls(sheets: Sheet[]): Buffer {
  const worksheets = sheets.map((sh) => {
    const rows: string[] = [];
    if (sh.title) rows.push(`<Row><Cell ss:StyleID="t"><Data ss:Type="String">${esc(sh.title)}</Data></Cell></Row>`, "<Row></Row>");
    rows.push(header(sh.headers));
    for (const r of sh.rows) rows.push(row(r));
    const name = esc((sh.name || "Sheet").slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
    return `<Worksheet ss:Name="${name}"><Table>${rows.join("")}</Table></Worksheet>`;
  }).join("");

  const xml =
    `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles>` +
    `<Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#EEF2FF" ss:Pattern="Solid"/></Style>` +
    `<Style ss:ID="t"><Font ss:Bold="1" ss:Size="14"/></Style>` +
    `</Styles>` +
    worksheets +
    `</Workbook>`;
  return Buffer.from(xml, "utf8");
}

/** Convenience for a single-sheet export. */
export function tableToXls(name: string, headers: string[], rows: (string | number)[][], title?: string): Buffer {
  return sheetsToXls([{ name, headers, rows, title }]);
}
