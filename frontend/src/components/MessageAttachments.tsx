import { useEffect, useState } from "react";
import type { EmailAttachmentMeta } from "../api/types";
import { api } from "../api/client";

type Props = {
  messageId: string;
  attachments?: EmailAttachmentMeta[];
  bodyPreview?: string;
};

function isAudioAttachment(att: EmailAttachmentMeta): boolean {
  if (att.contentType.startsWith("audio/")) return true;
  if (/\.(ogg|opus|mp3|m4a|aac|wav|webm)$/i.test(att.fileName)) return true;
  return att.contentType === "application/octet-stream" && /\.ogg$/i.test(att.fileName);
}

function audioMimeType(att: EmailAttachmentMeta): string {
  if (att.contentType.startsWith("audio/")) return att.contentType;
  if (/\.mp3$/i.test(att.fileName)) return "audio/mpeg";
  if (/\.(m4a|aac)$/i.test(att.fileName)) return "audio/mp4";
  if (/\.wav$/i.test(att.fileName)) return "audio/wav";
  return "audio/ogg; codecs=opus";
}

function AuthenticatedMedia({ messageId, att }: { messageId: string; att: EmailAttachmentMeta }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const isAudio = isAudioAttachment(att);
  const isImage = att.contentType.startsWith("image/");

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    setLoadError(false);
    void api.downloadMessageAttachment(messageId, att.id)
      .then((blob) => {
        if (cancelled) return;
        const typedBlob = isAudio ? new Blob([blob], { type: audioMimeType(att) }) : blob;
        objectUrl = URL.createObjectURL(typedBlob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setSrc(null);
        setLoadError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [messageId, att.id, att.contentType, att.fileName, isAudio]);

  if (loadError) {
    return <span className="muted" style={{ fontSize: "0.8rem" }}>No se pudo cargar {att.fileName}</span>;
  }

  if (!src) return <span className="muted" style={{ fontSize: "0.8rem" }}>Cargando {isAudio ? "nota de voz" : att.fileName}...</span>;

  if (isAudio) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <audio controls preload="metadata" style={{ maxWidth: "100%", minWidth: 220, height: 36 }}>
          <source src={src} type={audioMimeType(att)} />
        </audio>
        <span className="muted" style={{ fontSize: "0.72rem" }}>🎤 Nota de voz</span>
      </div>
    );
  }

  if (isImage) {
    return <img src={src} alt={att.fileName} style={{ maxWidth: "100%", borderRadius: 8, maxHeight: 200 }} />;
  }

  return (
    <a href={src} download={att.fileName} style={{ fontSize: "0.82rem", color: "#2563eb" }}>
      📎 {att.fileName}
    </a>
  );
}

export function MessageAttachments({ messageId, attachments, bodyPreview }: Props) {
  const hasAttachments = (attachments?.length ?? 0) > 0;
  const looksLikeMediaOnly =
    !hasAttachments &&
    !!bodyPreview &&
    (bodyPreview.includes("[Mensaje multimedia]") ||
      bodyPreview.includes("[Archivo multimedia]") ||
      bodyPreview.includes("🎤"));

  if (!hasAttachments) {
    if (looksLikeMediaOnly) {
      return (
        <div style={{ marginTop: 6, fontSize: "0.78rem", color: "var(--ink-soft)" }}>
          Archivo multimedia pendiente de descarga. Usá «Sincronizar» para reintentar.
        </div>
      );
    }
    return null;
  }

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {attachments!.map((att) => (
        <AuthenticatedMedia key={att.id} messageId={messageId} att={att} />
      ))}
    </div>
  );
}
