import { useRef, useState } from "react";
import { api } from "../api/client";

/** Archivo escaneado de un documento (PDF, JPG o PNG): verlo, subirlo o reemplazarlo. `path` es la ruta del archivo en la API. */
export function FileAttachment({ path, fileName, onChanged }: { path: string; fileName?: string | null; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {fileName && <button type="button" className="btn btn-outline compact" title={fileName} onClick={() => void api.openAttachedFile(path).catch((err) => alert(err.message))}>📎 Ver</button>}{" "}
      <button type="button" className="btn btn-outline compact" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Subiendo…" : fileName ? "Cambiar" : "📎 Subir"}</button>
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setBusy(true);
        api.uploadAttachedFile(path, file).then(onChanged).catch((err) => alert(err.message)).finally(() => setBusy(false));
      }} />
    </span>
  );
}
