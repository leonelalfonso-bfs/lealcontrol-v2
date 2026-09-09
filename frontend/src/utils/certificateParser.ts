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

// Worker inlined por Vite (blob URL). Evita fetch a /assets/*.mjs que falla
// con nosniff + MIME incorrecto o fallback SPA a index.html.
import PdfJsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&inline";

let pdfWorkerReady = false;

function ensurePdfWorker(pdfjsLib: typeof import("pdfjs-dist")) {
  if (pdfWorkerReady) return;
  // workerPort tiene prioridad sobre workerSrc; no hace falta CDN ni asset público.
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfJsWorker();
  pdfWorkerReady = true;
}

/**
 * Reconstruct text from PDF pages with vertical baseline grouping tolerance
 */
export async function extractTextFromPdf(file: File, onProgress?: (msg: string) => void): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  ensurePdfWorker(pdfjsLib);

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
    m = text.match(/(\d{4,6}-[A-Z]-\d{4})/i); // SIPEL: 00834-S-0526
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

  // Parse SIPEL / INTI (tabla Identificación / Fabricante / VN / Ec / U / Clase)
  const parseSipel = (): ParsedWeightItem[] => {
    const headerPat = /Identificaci.n\s+Fabricante\s*\/\s*Marca\s+VN\s+Ec\s+U\s+Clase/i;
    if (!headerPat.test(text)) return [];

    // "Previo al ajuste" = error inicial (as-found); "Calibración final" = Ec (as-left).
    const finalSplit = text.split(/Calibraci.n\s+final\s*:?/i);
    const hasBothPhases = finalSplit.length > 1;
    const phases: { scope: string; phase: "asFound" | "asLeft" }[] = hasBothPhases
      ? [
          { scope: finalSplit[0], phase: "asFound" },
          ...finalSplit.slice(1).map((scope) => ({ scope, phase: "asLeft" as const }))
        ]
      : [{ scope: text, phase: "asLeft" }];

    // id + fabricante + VN + Ec + U + clase opcional (en as-found la clase suele ir en la línea anterior)
    const rowPat =
      /^([A-Za-z0-9][\w\-\*]*)\s+(.+?)\s+(\d+(?:[,\.]\d+)?)\s*(kg|g)\s+([+\-]?\d+(?:[,\.]\d+)?)\s*(mg|g|kg)\s+[±]?(\d+(?:[,\.]\d+)?)\s*(mg|g|kg)(?:\s+(M[1-3]|F[1-2]|E[1-2]|N\d+|Fuera\s+de\s+clase))?$/i;

    let pesero = "";
    const peseroMatch =
      text.match(/Pertenecen\s+al\s+pesero\s+(?:Nro\.?\s+de\s+serie\s+)?([A-Z]{1,3}\s*\-?\s*\d{1,5})/i) ||
      text.match(/pesero\s+(AB\-?\d{3,5})/i) ||
      filename.match(/PESERO\s+(AB\-?\d{3,5})/i);
    if (peseroMatch) {
      pesero = peseroMatch[1].replace(/\s+/g, "").trim();
    }

    const byId: { [key: string]: ParsedWeightItem } = {};

    const ingestRow = (
      phase: "asFound" | "asLeft",
      idRaw: string,
      manufacturer: string,
      massNominalKg: number,
      ecG: number,
      uG: number,
      clase: string
    ) => {
      let finalId = idRaw;
      if (pesero !== "" && !idRaw.toLowerCase().includes(pesero.toLowerCase())) {
        finalId = `${pesero} - ${idRaw}`;
      }
      const serial = pesero !== "" ? pesero : idRaw;
      const lotName = pesero !== "" ? `Pesero ${pesero}` : "";
      const existing = byId[finalId];

      if (!existing) {
        byId[finalId] = {
          identification: finalId,
          serialNumber: serial,
          manufacturer,
          lotName,
          nominalValue: Math.round(massNominalKg * 10000) / 10000,
          unit: "kg",
          accuracyClass: clase,
          errorAsFound: phase === "asFound" ? ecG : null,
          conventionalMassCorrection: phase === "asLeft" ? ecG : null,
          uncertainty: uG,
          unitEc: "g",
          factorK
        };
        return;
      }

      if (phase === "asFound") {
        existing.errorAsFound = ecG;
        if (/fuera/i.test(clase) && !existing.accuracyClass) {
          existing.accuracyClass = clase;
        }
      } else {
        // as-left: conservar error inicial ya cargado; actualizar Ec / U / clase final
        if (existing.errorAsFound == null && existing.conventionalMassCorrection != null) {
          // No debería pasar si parseamos as-found primero; red de seguridad
        }
        existing.conventionalMassCorrection = ecG;
        existing.uncertainty = uG;
        existing.accuracyClass = clase;
        existing.manufacturer = manufacturer || existing.manufacturer;
      }
    };

    for (const { scope, phase } of phases) {
      // En as-found, acotar al bloque "Previo al ajuste" si existe (evita basura del encabezado del PDF).
      let usable = scope;
      if (phase === "asFound") {
        const previo = scope.split(/Previo\s+al\s+ajuste\s*:?/i);
        if (previo.length > 1) usable = previo.slice(1).join("\n");
      }

      const lines = usable
        .split(/\n+/)
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      let pendingClass: string | null = null;
      for (const line of lines) {
        if (/^Fuera\s+de\s+clase$/i.test(line)) {
          pendingClass = "Fuera de clase";
          continue;
        }
        if (/^Identificaci/i.test(line) || /^Condiciones\s+ambientales/i.test(line) || /^Los\s+resultados/i.test(line)) {
          pendingClass = null;
          continue;
        }

        const match = line.match(rowPat);
        if (!match) continue;

        const id = match[1].trim();
        const defaultClass = phase === "asFound" ? "Fuera de clase" : "M1";
        const clase = (match[9] || pendingClass || defaultClass).trim();
        pendingClass = null;

        let massNominal = toFloat(match[3]);
        const unitNominal = match[4].toLowerCase().trim();
        if (unitNominal === "g") massNominal /= 1000.0;

        let ec = toFloat(match[5]);
        const unitEc = match[6].toLowerCase().trim();
        if (unitEc === "mg") ec /= 1000.0;
        else if (unitEc === "kg") ec *= 1000.0;

        let u = toFloat(match[7]);
        const unitU = match[8].toLowerCase().trim();
        if (unitU === "mg") u /= 1000.0;
        else if (unitU === "kg") u *= 1000.0;

        ingestRow(phase, id, match[2].trim(), massNominal, ec, u, clase);
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
    if (/IRAM|DC-M-1602|conformidad/i.test(text) && !/Identificaci.n\s+Fabricante/i.test(text)) {
      warnings.push(
        "Este PDF parece un certificado de conformidad IRAM (sin tabla VN/Ec/U). Usá el certificado de calibración SIPEL (p. ej. 00834-S-… / 00865-S-…)."
      );
    } else {
      warnings.push(
        "No se detectaron pesas en la tabla. Verificá que el archivo PDF contenga texto seleccionable (no imagen escaneada)."
      );
    }
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
