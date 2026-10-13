import { useSearchParams } from "react-router-dom";
import { ChannelsPage, SOCIAL_CHANNELS_ENABLED } from "./ChannelsPage";
import { MailSettingsPage } from "./MailSettingsPage";

type Channel = "correo" | "mensajeria";

/**
 * Configuración → Comunicaciones: todas las cuentas en un solo lugar.
 * Correo (también se usa para enviar facturas y presupuestos) y, cuando se habiliten con la
 * API oficial de Meta (segunda etapa), las redes sociales.
 */
export function CommunicationsSettingsPage({ messagingEnabled }: { messagingEnabled: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const socialEnabled = messagingEnabled && SOCIAL_CHANNELS_ENABLED;
  const requested = searchParams.get("canal") as Channel | null;
  const channel: Channel = requested === "mensajeria" && socialEnabled ? "mensajeria" : "correo";

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
            Cuentas de correo{socialEnabled ? " y redes sociales" : ""} de la empresa. El correo también se usa para enviar facturas y presupuestos.
          </p>
        </div>
      </div>

      {socialEnabled && (
        <div className="tab-row">
          <button type="button" className={`tab-btn ${channel === "correo" ? "active" : ""}`} onClick={() => select("correo")}>
            Correo
          </button>
          <button type="button" className={`tab-btn ${channel === "mensajeria" ? "active" : ""}`} onClick={() => select("mensajeria")}>
            Redes sociales
          </button>
        </div>
      )}

      {channel === "correo" ? <MailSettingsPage embedded /> : <ChannelsPage embedded />}
    </div>
  );
}
