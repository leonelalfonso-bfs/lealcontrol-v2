type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;

/**
 * Guarda el PDF eligiendo la carpeta y el nombre ("Guardar como"), así va directo a la carpeta del cliente. En los
 * navegadores sin esa función (Firefox, Safari) se descarga como siempre. Devuelve false si el usuario canceló.
 */
export async function savePdfAs(blob: Blob, filename: string): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: filename, types: [{ description: "Documento PDF", accept: { "application/pdf": [".pdf"] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false;
      throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
