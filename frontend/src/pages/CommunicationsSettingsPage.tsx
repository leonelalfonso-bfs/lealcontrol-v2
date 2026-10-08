import { useSearchParams } from "react-router-dom";
import { ChannelsPage } from "./ChannelsPage";
import { MailSettingsPage } from "./MailSettingsPage";

type Channel = "correo" | "mensajeria";

/**
 * Configuración → Comunicaciones: todas las cuentas en un solo lugar.
 * Correo (también se usa para enviar facturas y presupuestos) y, si la empresa tiene
 * el módulo Comunicaciones, WhatsApp (Instagram y Facebook quedan para la segunda etapa).
 */
export function CommunicationsSettingsPage({ messagingEnabled }: { messagingEnabled: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("canal") as Channel | null;
  const channel: Channel = requested === "mensajeria" && messagingEnabled ? "mensajeria" : "correo";

  const select = (next: Channel) => {
    const params = new URLSearchParams(searchParams);
    if (next === "correo") params.delete("canal");
    else params.set("canal", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">CONFIGURACIÓN</span>
          <h1>Comunicaciones</h1>
          <p className="muted">
            Cuentas de correo{messagingEnabled ? " y WhatsApp" : ""} de la empresa. El correo también se usa para enviar facturas y presupuestos.
          </p>
        </div>
      </div>

      {messagingEnabled && (
        <div className="tab-row">
          <button type="button" className={`tab-btn ${channel === "correo" ? "active" : ""}`} onClick={() => select("correo")}>
            Correo
          </button>
          <button type="button" className={`tab-btn ${channel === "mensajeria" ? "active" : ""}`} onClick={() => select("mensajeria")}>
            WhatsApp
          </button>
        </div>
      )}

      {channel === "correo" ? <MailSettingsPage embedded /> : <ChannelsPage embedded />}
    </div>
  );
}
