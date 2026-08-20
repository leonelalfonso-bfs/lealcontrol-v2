import * as XLSX from "xlsx";
import * as fs from "fs";

const filepath = "/mnt/c/Users/fulls/Downloads/productos-plantilla.xlsx";
if (!fs.existsSync(filepath)) {
  console.log("File not found at", filepath);
} else {
  const fileBuffer = fs.readFileSync(filepath);
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  console.log("Sheet Names:", workbook.SheetNames);
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n=== SHEET: ${sheetName} ===`);
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    data.slice(0, 30).forEach((row, idx) => {
      console.log(`Row ${idx}:`, JSON.stringify(row));
    });
  }
}
