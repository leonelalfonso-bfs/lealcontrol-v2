import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { StandardWeight } from "../../api/types";

export function StandardWeightsPage() {
  const [weights, setWeights] = useState<StandardWeight[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWeights = () => {
    setLoading(true);
    api.listStandardWeights()
      .then(setWeights)
      .catch((err) => console.error("Error al cargar pesas patrón:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWeights();
  }, []);

  const handleDelete = async (id: string, codeName: string) => {
    if (!confirm(`¿Está seguro de eliminar la pesa patrón '${codeName}'?`)) return;
    try {
      await api.deleteStandardWeight(id);
      loadWeights();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar pesa patrón.");
    }
  };

  return (
    <div className="page-wide">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Trazabilidad Metrológica
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            ⚖️ Gestión de Pesas Patrón
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Pesas de calibración con trazabilidad a patrones de referencia y laboratorios de calibración acreditados
          </p>
        </div>

        <Link
          to="/metrologia/patrones/nuevo"
          className="btn"
          style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", fontWeight: 700 }}
        >
          ➕ Registrar Pesa Patrón
        </Link>
      </div>

      <div className="card pad">
        {loading ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>Cargando padrón de pesas patrón...</div>
        ) : weights.length === 0 ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            No se encontraron pesas patrón registradas.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código / Identificador</th>
                  <th>Valor Nominal</th>
                  <th>Clase Exactitud</th>
                  <th>Material</th>
                  <th>Error Convencional</th>
                  <th>Incertidumbre (U)</th>
                  <th>Certificado de Calibración</th>
                  <th>Laboratorio Emisor</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {weights.map((w) => {
                  const isExpired = w.expirationDate && new Date(w.expirationDate) < new Date();
                  return (
                    <tr key={w.id}>
                      <td>
                        <strong style={{ color: "#0d9488" }}>{w.code}</strong>
                        {w.serialNumber && (
                          <div className="muted" style={{ fontSize: "0.74rem" }}>Nº Serie: {w.serialNumber}</div>
                        )}
                      </td>
                      <td>
                        <strong>{w.nominalValue.toLocaleString("es-AR")} {w.unit}</strong>
                      </td>
                      <td>
                        <span className="tag" style={{ fontWeight: 700 }}>Clase {w.accuracyClass}</span>
                      </td>
                      <td>{w.material}</td>
                      <td>
                        <span style={{ fontFamily: "monospace", fontSize: "0.84rem" }}>
                          {w.conventionalMassCorrection >= 0 ? `+${w.conventionalMassCorrection}` : w.conventionalMassCorrection} {w.unit}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: "monospace", fontSize: "0.84rem" }}>
                          ±{w.uncertainty} {w.unit}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontSize: "0.84rem" }}>{w.certificateNumber || "—"}</strong>
                      </td>
                      <td>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>{w.traceabilityLab}</div>
                      </td>
                      <td>
                        {w.expirationDate ? (
                          <span style={{ color: isExpired ? "#dc2626" : "inherit", fontWeight: isExpired ? 700 : 400 }}>
                            {new Date(w.expirationDate).toLocaleDateString("es-AR")}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <span className={`badge ${!isExpired && w.status === "Valid" ? "ok" : "prio-high"}`}>
                          {!isExpired && w.status === "Valid" ? "Vigente" : "Vencida"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <Link
                            to={`/metrologia/patrones/${w.id}`}
                            className="btn ghost compact"
                            title="Editar Certificado"
                          >
                            ✏️ Editar
                          </Link>
                          <button
                            type="button"
                            className="btn ghost compact"
                            onClick={() => handleDelete(w.id, w.code)}
                            style={{ color: "#dc2626" }}
                            title="Eliminar"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
