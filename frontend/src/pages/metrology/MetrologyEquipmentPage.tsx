import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { MetrologyEquipment, CustomerSummary } from "../../api/types";
import { CustomerPicker } from "../../components/pickers";

export function MetrologyEquipmentPage() {
  const [equipments, setEquipments] = useState<MetrologyEquipment[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [standardFilter, setStandardFilter] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [eqList, custList] = await Promise.all([
        api.listMetrologyEquipment(),
        api.listCustomers().catch(() => ({ items: [] }))
      ]);
      setEquipments(eqList || []);
      const custItems = (custList as any).items || custList || [];
      setCustomers(custItems);
    } catch (err: any) {
      console.error("Error al cargar equipos de metrología:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: string, codeName: string) => {
    if (!confirm(`¿Confirma eliminar la balanza/instrumento "${codeName}"?`)) return;
    try {
      await api.deleteMetrologyEquipment(id);
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar equipo.");
    }
  };

  const filteredEquipments = equipments.filter((e) => {
    const matchesSearch =
      !search ||
      e.code.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      (e.brand && e.brand.toLowerCase().includes(search.toLowerCase())) ||
      (e.model && e.model.toLowerCase().includes(search.toLowerCase())) ||
      (e.serialNumber && e.serialNumber.toLowerCase().includes(search.toLowerCase())) ||
      (e.customerName && e.customerName.toLowerCase().includes(search.toLowerCase())) ||
      (e.location && e.location.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = !statusFilter || e.status === statusFilter;
    const matchesCustomer = !customerFilter || e.customerId === customerFilter;
    const matchesStandard = !standardFilter || e.applicableStandard === standardFilter;

    return matchesSearch && matchesStatus && matchesCustomer && matchesStandard;
  });

  return (
    <div className="page-wide">
      {/* Top Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="eyebrow t-accent t-strong t-caps t-small" style={{ letterSpacing: "0.08em" }}>
            Metrología Legal
          </span>
          <h1 style={{ margin: "2px 0 0" }}>
            ⚖️ Gestión de Equipos
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Padrón técnico de básculas para camiones, plataformas y tolvas según Resoluciones 25/2025 y 2307/1980
          </p>
        </div>

        <Link
          to="/metrologia/equipos/nuevo"
          className="btn"
        >
          ➕ Registrar Nuevo Equipo
        </Link>
      </div>

      {/* KPI Stats */}
      <div className="kpi kpi-4" style={{ marginBottom: 24 }}>
        <div className="card pad" style={{ borderLeft: "4px solid var(--lc-accent)" }}>
          <div className="muted">Total Instrumentos</div>
          <strong className="t-xl">{equipments.length}</strong>
          <div className="t-small t-strong" style={{ color: "var(--lc-ok)", marginTop: 4 }}>
            ✓ {equipments.filter((e) => e.status === "Active").length} operativos
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid var(--lc-info)" }}>
          <div className="muted">Básculas Camioneras</div>
          <strong className="t-xl">
            {equipments.filter((e) => e.platformType === "TruckScale" || !e.platformType).length}
          </strong>
          <div className="t-small t-info t-strong" style={{ marginTop: 4 }}>
            Pesaje pesado / transporte
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid var(--lc-warn)" }}>
          <div className="muted">Plataformas & Tolvas</div>
          <strong className="t-xl">
            {equipments.filter((e) => e.platformType && e.platformType !== "TruckScale").length}
          </strong>
          <div className="t-small t-warn t-strong" style={{ marginTop: 4 }}>
            Industria y laboratorio
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid var(--lc-danger)" }}>
          <div className="muted">Calibración Vencida</div>
          <strong className="t-xl t-danger">
            {equipments.filter((e) => e.nextCalibrationDate && new Date(e.nextCalibrationDate) < new Date()).length}
          </strong>
          <div className="t-small t-danger t-strong" style={{ marginTop: 4 }}>
            Requieren ensayo urgente
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "center" }}>
          <input
            type="search"
            placeholder="🔍 Buscar por código, descripción, serie, cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Todos los Estados</option>
            <option value="Active">✓ Activo / Operativo</option>
            <option value="UnderMaintenance">En Mantenimiento</option>
            <option value="Decommissioned">Fuera de Servicio</option>
          </select>

          <CustomerPicker
            role="all"
            value={customerFilter}
            onChange={(id) => setCustomerFilter(id)}
            placeholder="Todos los clientes"
            aria-label="Filtrar por cliente"
          />

          <select
            value={standardFilter}
            onChange={(e) => setStandardFilter(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Todas las Normas</option>
            <option value="Res25_2025">Res. 25/2025</option>
            <option value="Res2307_1980">Res. 2307/1980</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card pad">
        {loading ? (
          <div className="muted t-center" style={{ padding: 40 }}>Cargando catálogo de balanzas...</div>
        ) : filteredEquipments.length === 0 ? (
          <div className="muted t-center" style={{ padding: 40 }}>
            No se encontraron instrumentos con los filtros seleccionados.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Código</th>
                  <th>Descripción & Ubicación</th>
                  <th>Cliente / Propietario</th>
                  <th>Plataforma & Modelo</th>
                  <th>Indicador</th>
                  <th>Capacidad (Max / e)</th>
                  <th>Próxima Calibración</th>
                  <th>Estado</th>
                  <th className="t-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredEquipments.map((eq) => {
                  const isExpired = eq.nextCalibrationDate && new Date(eq.nextCalibrationDate) < new Date();
                  return (
                    <tr key={eq.id}>
                      <td>
                        <span className="badge t-accent t-strong" style={{ background: "var(--lc-accent-soft)" }}>
                          {eq.code}
                        </span>
                      </td>
                      <td>
                        <strong>{eq.description}</strong>
                        {eq.location && <div className="muted t-small">📍 {eq.location}</div>}
                      </td>
                      <td>
                        <span className="t-small t-strong">{eq.customerName || "Uso Interno / Propio"}</span>
                      </td>
                      <td>
                        <span className="t-small">{eq.platformApprovalCode || eq.brand || "—"}</span>
                        {eq.platformDimensions && <div className="muted t-small">{eq.platformDimensions}</div>}
                      </td>
                      <td>
                        <span className="t-small">{eq.indicator1Brand} {eq.indicator1Model}</span>
                        {eq.indicator1SerialNumber && <div className="muted t-small">S/N: {eq.indicator1SerialNumber}</div>}
                      </td>
                      <td>
                        <strong>{eq.maxCapacity?.toLocaleString("es-AR")} {eq.unit}</strong>
                        <div className="muted t-small">
                          e = {eq.verificationIntervalE} {eq.unit} | Cl. {eq.accuracyClass}
                        </div>
                      </td>
                      <td>
                        {eq.nextCalibrationDate ? (
                          <span className="t-small" style={{ color: isExpired ? "#dc2626" : "inherit", fontWeight: isExpired ? 800 : 500 }}>
                            {new Date(eq.nextCalibrationDate).toLocaleDateString("es-AR")}
                            {isExpired && " ⚠️ Vencida"}
                          </span>
                        ) : (
                          <span className="muted t-small">Sin calibrar</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${eq.status === "Active" ? "ok" : "prio-high"}`}>
                          {eq.status === "Active" ? "✓ Operativo" : eq.status}
                        </span>
                      </td>
                      <td className="t-right">
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <Link
                            to={`/metrologia/ensayos/nuevo?equipmentId=${eq.id}`}
                            className="btn ghost compact"
                            title="Calibrar / Ensayar Balanza"
                          >
                            ⚖️ Ensayar
                          </Link>
                          <Link
                            to={`/metrologia/equipos/${eq.id}`}
                            className="btn ghost compact"
                            title="Editar Ficha Técnica"
                          >
                            ✏️ Editar
                          </Link>
                          <button
                            type="button"
                            className="btn ghost compact btn-outline danger"
                            onClick={() => handleDelete(eq.id, eq.code)}
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
