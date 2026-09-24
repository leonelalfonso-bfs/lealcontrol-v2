import { useEffect, useRef } from "react";
import { plainToRich, sanitizeRichText } from "../utils/richText";

const SIZES = ["12px", "14px", "16px", "18px", "22px"];

type Props = {
  value: string;
  onChange: (html: string) => void;
};

export function TechnicalDetailEditor({ value, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = plainToRich(value);
    // Solo al abrir el editor. Mientras se escribe, el estado lo actualiza onInput.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = () => {
    onChange(sanitizeRichText(editorRef.current?.innerHTML || ""));
  };

  const run = (command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    sync();
  };

  const applySize = (px: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand("fontSize", false, "7");
    editor.querySelectorAll("font[size='7']").forEach((node) => {
      const span = document.createElement("span");
      span.style.fontSize = px;
      span.innerHTML = node.innerHTML;
      node.replaceWith(span);
    });
    sync();
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <button type="button" className="btn ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => run("formatBlock", "H2")}>Título</button>
        <button type="button" className="btn ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => run("formatBlock", "H3")}>Subtítulo</button>
        <button type="button" className="btn ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => run("formatBlock", "P")}>Texto</button>
        <button type="button" className="btn ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")}><strong>N</strong></button>
        <button type="button" className="btn ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => run("italic")}><em>C</em></button>
        <button type="button" className="btn ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => run("insertUnorderedList")}>Ítems</button>
        <button type="button" className="btn ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => run("insertOrderedList")}>1. 2. 3.</button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
          Tamaño
          <select defaultValue="" onChange={(e) => { if (e.target.value) applySize(e.target.value); e.target.value = ""; }}>
            <option value="">Elegir</option>
            {SIZES.map((size) => <option key={size} value={size}>{size.replace("px", "")}</option>)}
          </select>
        </label>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        className="tech-detail-editor"
        style={{
          minHeight: 320,
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          padding: "12px 14px",
          background: "#fff",
          lineHeight: 1.45,
          outline: "none"
        }}
      />
      <style>{`
        .tech-detail-editor h2 { font-size: 1.25rem; margin: 0.6rem 0 0.3rem; }
        .tech-detail-editor h3 { font-size: 1.05rem; margin: 0.5rem 0 0.25rem; }
        .tech-detail-editor p { margin: 0 0 0.45rem; }
        .tech-detail-editor ul, .tech-detail-editor ol { margin: 0.2rem 0 0.6rem 1.2rem; }
      `}</style>
    </div>
  );
}
