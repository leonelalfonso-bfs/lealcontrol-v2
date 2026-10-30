import { useRef, useState } from "react";
import { api } from "../../api/client";

/** Archivo escaneado de un vencimiento o credencial: verlo, subirlo o reemplazarlo (PDF, JPG o PNG). */
export function FleetAttachment({ kind, id, fileName, onChanged }: { kind: "documents" | "credentials"; id: string; fileName?: string | null; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {fileName && <button type="button" className="btn btn-outline compact" title={fileName} onClick={() => void api.openFleetFile(kind, id).catch((err) => alert(err.message))}>📎 Ver</button>}{" "}
      <button type="button" className="btn btn-outline compact" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Subiendo…" : fileName ? "Cambiar" : "📎 Subir"}</button>
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setBusy(true);
        api.uploadFleetFile(kind, id, file).then(onChanged).catch((err) => alert(err.message)).finally(() => setBusy(false));
      }} />
    </span>
  );
}
