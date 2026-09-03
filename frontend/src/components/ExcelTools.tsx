import { useRef, useState } from "react";

export type ExcelColumn<T> = { key: keyof T | string; header: string; value?: (row: T) => unknown };

async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default ?? mod;
}

export function excelDate(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function excelNumber(value: unknown) {
  return typeof value === "number" ? value : value == null || value === "" ? "" : Number(value);
}

function downloadWorkbook(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportToExcel<T>(fileName: string, rows: T[], columns: ExcelColumn<T>[]) {
  const data = rows.map(row => Object.fromEntries(columns.map(column => {
    const source = row as Record<string, unknown>;
    let value = column.value ? column.value(row) : source[String(column.key)];
    const key = String(column.key).toLowerCase();
    if (!column.value && key.includes("customerid") && source.customerName) value = source.customerName;
    if (!column.value && key.includes("supplierid") && source.supplierName) value = source.supplierName;
    if (!column.value && (key.includes("date") || key.includes("atutc"))) value = excelDate(value);
    return [column.header, value];
  })));

  const ExcelJS = await loadExcelJS();
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Datos");
  sheet.columns = columns.map(column => ({ header: column.header, key: column.header, width: Math.max(column.header.length + 2, 16) }));
  sheet.addRows(data);
  sheet.autoFilter = { from: "A1", to: sheet.getRow(1).getCell(columns.length).address };
  downloadWorkbook(await book.xlsx.writeBuffer() as ArrayBuffer, `${fileName}.xlsx`);
}

export async function downloadExcelTemplate(fileName: string, columns: string[]) {
  const ExcelJS = await loadExcelJS();
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Plantilla");
  sheet.columns = columns.map(column => ({ header: column, key: column, width: Math.max(column.length + 2, 18) }));
  downloadWorkbook(await book.xlsx.writeBuffer() as ArrayBuffer, `${fileName}-plantilla.xlsx`);
}

export function ExcelToolbar<T>({ fileName, rows, columns, templateColumns, onImport }: { fileName: string; rows: T[]; columns: ExcelColumn<T>[]; templateColumns?: string[]; onImport?: (rows: Record<string, unknown>[]) => void }) {
  const input = useRef<HTMLInputElement>(null); const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, unknown>[] | null>(null);
  const read = async (file: File) => { try { const buffer = await file.arrayBuffer(); const ExcelJS = await loadExcelJS(); const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer); const sheet = book.worksheets[0]; if (!sheet) throw new Error("El Excel no contiene hojas."); const headers = sheet.getRow(1).values as unknown[]; const data: Record<string, unknown>[] = []; sheet.eachRow((row, rowNumber) => { if (rowNumber === 1) return; const item: Record<string, unknown> = {}; headers.slice(1).forEach((header, index) => { if (!header) return; const value = row.getCell(index + 1).value; item[String(header)] = value && typeof value === "object" && "text" in value ? String(value.text) : value ?? ""; }); if (Object.values(item).some(value => value !== "" && value != null)) data.push(item); }); if (!data.length) throw new Error("El Excel no contiene filas de datos."); setError(null); setPending(data); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer el Excel."); } };
  return <><div className="excel-toolbar"><button type="button" className="btn btn-outline compact" onClick={() => void exportToExcel(fileName, rows, columns)}>↓ Exportar Excel</button>{templateColumns && <button type="button" className="btn ghost compact" onClick={() => void downloadExcelTemplate(fileName, templateColumns)}>↓ Plantilla</button>}{onImport && <><button type="button" className="btn ghost compact" onClick={() => input.current?.click()}>↑ Importar Excel</button><input ref={input} hidden type="file" accept=".xlsx" onChange={e => { const file = e.target.files?.[0]; if (file) void read(file); e.currentTarget.value = ""; }} /></>}{error && <span className="excel-error">{error}</span>}</div>{pending && <div className="modal-backdrop"><div className="modal-card card pad"><h2>Vista previa de importación</h2><p className="muted">{pending.length} fila(s) detectadas. Revisá la primera muestra antes de confirmar.</p><div className="table-wrap"><table><thead><tr>{Object.keys(pending[0]).slice(0, 6).map(key => <th key={key}>{key}</th>)}</tr></thead><tbody>{pending.slice(0, 5).map((row, index) => <tr key={index}>{Object.keys(pending[0]).slice(0, 6).map(key => <td key={key}>{String(row[key] ?? "")}</td>)}</tr>)}</tbody></table></div><div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 18 }}><button className="btn ghost" onClick={() => setPending(null)}>Cancelar</button><button className="btn" onClick={() => { onImport?.(pending); setPending(null); }}>Confirmar importación</button></div></div></div>}</>;
}
