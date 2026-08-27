import { useEffect, useState } from "react";
import type { EmailAttachmentMeta } from "../api/types";

type Props = {
  messageId: string;
  attachments?: EmailAttachmentMeta[];
};

function AuthenticatedMedia({ messageId, att }: { messageId: string; att: EmailAttachmentMeta }) {
  const [src, setSrc] = useState<string | null>(null);
  const isAudio = att.contentType.startsWith("audio/");
  const isImage = att.contentType.startsWith("image/");

  useEffect(() => {
    const tenantId = localStorage.getItem("tenantId") || "";
    const url = `/api/v1/communications/messages/${messageId}/attachments/${att.id}/download`;
    let objectUrl: string | null = null;
    void fetch(url, { headers: { "X-Tenant-Id": tenantId } })
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [messageId, att.id]);

  if (!src) return <span className="muted" style={{ fontSize: "0.8rem" }}>Cargando {att.fileName}...</span>;

  if (isAudio) {
    return (
      <audio controls preload="metadata" style={{ maxWidth: "100%", height: 32 }}>
        <source src={src} type={att.contentType} />
      </audio>
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

export function MessageAttachments({ messageId, attachments }: Props) {
  if (!attachments?.length) return null;

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {attachments.map((att) => (
        <AuthenticatedMedia key={att.id} messageId={messageId} att={att} />
      ))}
    </div>
  );
}
