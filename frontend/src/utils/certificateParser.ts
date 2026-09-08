export interface ParsedWeightItem {
  identification: string;
  serialNumber: string;
  manufacturer: string;
  lotName?: string;
  nominalValue: number;
  unit: string;
  accuracyClass: string;
  errorAsFound?: number | null;
  conventionalMassCorrection?: number | null; // As Left / Ec
  uncertainty?: number | null; // U
  unitEc: string; // 'g' | 'kg'
  factorK?: number;
  hasAsterisk?: boolean;
}

export interface ParsedCertificateResult {
  certInfo: {
    certificateNumber: string;
    calibrationDate: string; // YYYY-MM-DD
    expirationDate: string;  // YYYY-MM-DD
    factorK: number;
    formatDetected: "CERPES_OAA" | "SIPEL_INTI" | "UNKNOWN";
  };
  weights: ParsedWeightItem[];
  count: number;
  warnings: string[];
}

/**
 * Reconstruct text from PDF pages with vertical baseline grouping tolerance
 */
export async function extractTextFromPdf(file: File, onProgress?: (msg: string) => void): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  if (typeof window !== "undefined" && "Worker" in window) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  if (onProgress) onProgress(`Reconstruyendo geometría de página (${pdf.numPages} págs.)…`);
  
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    
    // Group text items by Y coordinate with baseline tolerance (4px)
    const linesMap: { [key: number]: { text: string; x: number }[] } = {};
    const tolerance = 4;

    for (const item of content.items as any[]) {
      if (!item.str || item.str.trim() === "") continue;
      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);

      let foundY: number | null = null;
      for (const existingYStr in linesMap) {
        const existingY = parseFloat(existingYStr);
        if (Math.abs(existingY - y) <= tolerance) {
          foundY = existingY;
          break;
        }
      }

      if (foundY !== null) {
        linesMap[foundY].push({ text: item.str, x });
      } else {
        linesMap[y] = [{ text: item.str, x }];
      }
    }

    // Sort descending by Y (top to bottom)
    const sortedY = Object.keys(linesMap).map(Number).sort((a, b) => b - a);

    let pageText = "";
    sortedY.forEach((y) => {
      // Sort ascending by X (left to right)
      const lineItems = linesMap[y].sort((a, b) => a.x - b.x);
      const lineStr = lineItems.map((it) => it.text).join("   ");
      pageText += lineStr + "\n";
    });

    fullText += pageText + "\n";
  }

  return fullText;
}

/**
 * Main certificate text parser supporting CERPES/OAA and SIPEL/INTI
 */
export function parseCertificateText(rawText: string, filename: string = ""): ParsedCertificateResult {
  const text = rawText.replace(/\r\n|\r/g, "\n");
  const warnings: string[] = [];

  // Detect format
  let format: "CERPES_OAA" | "SIPEL_INTI" | "UNKNOWN" = "UNKNOWN";
  if (/CERPES|OAA\d{4,}/i.test(text)) {
    format = "CERPES_OAA";
  } else if (/Sipel|INTI|Servicio Argentino de Calibraci/i.test(text)) {
    format = "SIPEL_INTI";
  }

  if (format === "UNKNOWN") {
    warnings.push("Formato no reconocido automáticamente — por favor revisá los resultados antes de importar.");
  }

  // Extract Certificate Number
  let certNum = "";
  let m = text.match(/Medici.n\s+N.?\s{1,10}([\w\-]+)/i);
  if (m) {
    certNum = m[1].trim();
  } else {
    m = text.match(/Certificado.*?N.?\s{1,10}(\d{4,6}[\-\/]\w+[\-\/]?\w*)/i);
    if (m) {
      certNum = m[1].trim();
    } else {
      m = text.match(/(?:CERTIFICADO|Certificado\s+N.?[:]?)\s{0,5}(OAA\d+|\d+)/i);
      if (m) {
        certNum = m[1].trim();
      } else {
        m = text.match(/OAA\d{4,}/i);
        if (m) certNum = m[0].trim();
      }
    }
  }

  // Extract Dates
  let calDate = "";
  let expDate = "";

  const fmtDate = (d: string) => {
    const dm = d.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dm) {
      const day = dm[1].padStart(2, "0");
      const month = dm[2].padStart(2, "0");
      return `${dm[3]}-${month}-${day}`;
    }
    return d;
  };

  const calMatch = text.match(/Fecha\s+de\s+calibraci.n[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
                   text.match(/Emisi.n[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (calMatch) {
    calDate = fmtDate(calMatch[1]);
  }

  for (const src of [text, filename]) {
    const expMatch = src.match(/(?:[Vv]to\.?|[Vv]ence|[Vv]encimiento|[Vv]alidez)[:\s]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/);
    if (expMatch) {
      expDate = fmtDate(expMatch[1]);
      break;
    }
  }

  if (!expDate && calDate) {
    const [y, mm, dd] = calDate.split("-").map(Number);
    if (!isNaN(y)) {
      expDate = `${y + 1}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }

  // Factor K
  let factorK = 2.0;
  const kMatch = text.match(/factor\s+de\s+(?:cubrimiento|cobertura)\s+k\s*=\s*([\d,\.]+)/i) ||
                 text.match(/cobertura\s+k\s*=\s*([\d,\.]+)/i);
  if (kMatch) {
    factorK = parseFloat(kMatch[1].replace(",", ".")) || 2.0;
  }

  const toFloat = (s: string) => parseFloat(s.replace(",", ".").trim());

  // Parse SIPEL / INTI
  const parseSipel = (): ParsedWeightItem[] => {
    const headerPat = /Identificaci.n\s{1,15}Fabricante\s*\/\s*Marca\s{1,15}VN\s{1,15}Ec\s{1,15}U\s{1,15}Clase/i;
    const parts = text.split(headerPat);
    if (parts.length < 2) return [];

    const rowPat = /([\w\-\*\.\s]+?)\s{2,}(.+?)\s{2,}(\d+(?:[,\.]\d+)?)\s*(kg|g)\s{2,}([+\-]?\d+(?:[,\.]\d+)?)\s*(mg|g|kg)\s{2,}[±]?(\d+(?:[,\.]\d+)?)\s*(mg|g|kg)\s{2,}(M[1-3]|F[1-2]|E[1-2]|N\d*|Fuera\s+de\s+clase)/gi;

    let pesero = "";
    const peseroMatch = text.match(/Pertenecen\s+al\s+pesero\s+(?:Nro\.?\s+de\s+serie\s+)?([A-Z]{1,3}\s*\-?\s*\d{1,5})/i);
    if (peseroMatch) {
      pesero = peseroMatch[1].trim();
    }

    const byId: { [key: string]: ParsedWeightItem } = {};

    for (let idx = 1; idx < parts.length; idx++) {
      let chunk = parts[idx].split(/Los resultados contenidos|Condiciones ambientales/i)[0];
      let match;
      while ((match = rowPat.exec(chunk)) !== null) {
        const id = match[1].trim();
        const clase = match[9].trim();
        const isFuera = /fuera/i.test(clase);

        let massNominal = toFloat(match[3]);
        const unitNominal = match[4].toLowerCase().trim();
        if (unitNominal === "g") massNominal /= 1000.0;

        let ec = toFloat(match[5]);
        const unitEc = match[6].toLowerCase().trim();
        if (unitEc === "mg") ec /= 1000.0;

        let u = toFloat(match[7]);
        const unitU = match[8].toLowerCase().trim();
        if (unitU === "mg") u /= 1000.0;

        let finalId = id;
        if (pesero !== "" && !id.toLowerCase().includes(pesero.toLowerCase())) {
          finalId = `${pesero} - ${id}`;
        }

        const serial = pesero !== "" ? pesero : id;
        const lotName = pesero !== "" ? `Pesero ${pesero}` : "";

        if (byId[finalId]) {
          if (!isFuera && /fuera/i.test(byId[finalId].accuracyClass)) {
            byId[finalId].errorAsFound = byId[finalId].conventionalMassCorrection;
            byId[finalId].conventionalMassCorrection = ec;
            byId[finalId].uncertainty = u;
            byId[finalId].accuracyClass = clase;
          }
        } else {
          byId[finalId] = {
            identification: finalId,
            serialNumber: serial,
            manufacturer: match[2].trim(),
            lotName,
            nominalValue: Math.round(massNominal * 10000) / 10000,
            unit: "kg",
            accuracyClass: clase,
            errorAsFound: null,
            conventionalMassCorrection: ec,
            uncertainty: u,
            unitEc: "g",
            factorK
          };
        }
      }
    }

    return Object.values(byId);
  };

  // Parse CERPES / OAA
  const parseCerpes = (): ParsedWeightItem[] => {
    let headerPat = /RESULTADOS\s+DE\s+LAS\s+MEDICIONES\s+MARCA\s{1,10}NRO\s+SERIE\s{1,10}UNIDAD\s{1,10}INCERTIDUMBRE\s{1,10}ERROR\s+CONV\.?\s{1,10}VALOR\s+NOMINAL/i;
    let parts = text.split(headerPat);

    if (parts.length < 2) {
      headerPat = /IDENTIFICACION\s{1,15}MARCA\s{1,15}(?:NRO\.?\s*SERIE?)\s{1,15}VALOR\s+NOMINAL\s{1,15}ERROR\s+CONV\.?\s{1,15}INCERTIDUMBRE\s{1,15}UNIDAD/i;
      parts = text.split(headerPat);
    }

    if (parts.length < 2) return [];

    const rowPat = /([\w\-\.\s]+?)(?:\s*\(\*\))?\s{2,}(.+?)\s{2,}([\w\-\s]+)\s{2,}(\d{4,9})\s{2,}([+\-]?\d+(?:[,\.]\d+)?)\s{2,}(\d+(?:[,\.]\d+)?)\s{2,}(g|kg)/gi;
    const byId: { [key: string]: ParsedWeightItem } = {};

    for (let idx = 1; idx < parts.length; idx++) {
      let chunk = parts[idx].split(/Los resultados|OBSERVACIONES|CERPES/i)[0];
      let match;
      while ((match = rowPat.exec(chunk)) !== null) {
        const id = match[1].trim();
        const raw = parseFloat(match[4]);
        const unit = match[7].toLowerCase().trim();

        const massKg = (raw >= 10000 && unit === "g") ? raw / 1000.0 : raw;
        const hasAsterisk = match[0].includes("*");

        if (byId[id]) {
          if (byId[id].hasAsterisk && !hasAsterisk) {
            byId[id].errorAsFound = byId[id].conventionalMassCorrection;
            byId[id].conventionalMassCorrection = toFloat(match[5]);
            byId[id].uncertainty = toFloat(match[6]);
            byId[id].hasAsterisk = false;
          }
        } else {
          byId[id] = {
            identification: id,
            serialNumber: match[3].trim(),
            manufacturer: match[2].trim(),
            nominalValue: Math.round(massKg * 10000) / 10000,
            unit: "kg",
            accuracyClass: "M1",
            errorAsFound: null,
            conventionalMassCorrection: toFloat(match[5]),
            uncertainty: toFloat(match[6]),
            unitEc: unit,
            factorK,
            hasAsterisk
          };
        }
      }
    }

    return Object.values(byId);
  };

  let weights: ParsedWeightItem[] = [];
  if (format === "SIPEL_INTI") {
    weights = parseSipel();
  } else if (format === "CERPES_OAA") {
    weights = parseCerpes();
  } else {
    weights = [...parseSipel(), ...parseCerpes()];
  }

  if (weights.length === 0) {
    warnings.push("No se detectaron pesas en la tabla. Verificá que el archivo PDF contenga texto seleccionable (no imagen escaneada).");
  }

  return {
    certInfo: {
      certificateNumber: certNum,
      calibrationDate: calDate,
      expirationDate: expDate,
      factorK,
      formatDetected: format
    },
    weights,
    count: weights.length,
    warnings
  };
}
