import { useState } from "react";

type Channel = "WhatsApp" | "Instagram" | "Facebook";

const channels: Array<{ id: Channel; icon: string; color: string; description: string; requirements: string[] }> = [
  { id: "WhatsApp", icon: "◉", color: "#25a56a", description: "Atención, ventas y envío de comprobantes desde WhatsApp Business Platform.", requirements: ["Número de WhatsApp Business", "Cuenta de Meta Business", "Token y webhook de Meta"] },
  { id: "Instagram", icon: "◎", color: "#c24b8d", description: "Mensajes directos de cuentas profesionales vinculadas a Meta.", requirements: ["Cuenta profesional de Instagram", "Página de Facebook vinculada", "Permisos de mensajería de Meta"] },
  { id: "Facebook", icon: "f", color: "#477cc8", description: "Messenger de páginas comerciales, integrado al mismo historial.", requirements: ["Página comercial de Facebook", "Cuenta de Meta Business", "Permisos y webhook de Messenger"] }
];

export function ChannelsPage() {
  const [expanded, setExpanded] = useState<Channel | null>(null);
  return <div className="channels-page page-wide">
    <div className="page-head"><div><span className="eyebrow">COMUNICACIONES</span><h1>Canales sociales</h1><p className="muted">Conectá los canales donde tus clientes ya conversan y gestioná todo desde una sola bandeja.</p></div></div>
    <div className="card pad channel-intro"><div><span className="eyebrow">BANDEJA OMNICANAL</span><h2>Una conversación, un historial</h2><p className="muted">Cada mensaje podrá vincularse con una empresa, contacto, prospecto u oportunidad, sin importar si llegó por email, WhatsApp, Instagram o Facebook.</p></div><span className="channel-orbit">✉　◉　◎　f</span></div>
    <div className="channel-grid">{channels.map((channel) => <article className="card pad channel-card" key={channel.id} style={{ ["--channel-color" as string]: channel.color }}><div className="channel-card-head"><span className="channel-icon">{channel.icon}</span><div><h2>{channel.id}</h2><span className="channel-status">Preparado para conectar</span></div></div><p className="muted">{channel.description}</p><button type="button" className="btn btn-outline" onClick={() => setExpanded(expanded === channel.id ? null : channel.id)}>{expanded === channel.id ? "Ocultar requisitos" : "Ver requisitos"}</button>{expanded === channel.id && <div className="channel-requirements"><strong>Necesitamos:</strong><ul>{channel.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul><div className="hint">La conexión real se habilita desde Meta y luego se completa aquí. No uses credenciales personales ni contraseñas de redes sociales.</div></div>}</article>)}</div>
    <section className="card pad channel-roadmap"><h2>Orden de implementación</h2><div className="channel-steps"><span className="done">1 <b>Correo</b><small>Conectado</small></span><span className="current">2 <b>WhatsApp</b><small>Próximo canal</small></span><span>3 <b>Instagram</b><small>Sobre Meta</small></span><span>4 <b>Facebook</b><small>Messenger</small></span></div></section>
  </div>;
}
