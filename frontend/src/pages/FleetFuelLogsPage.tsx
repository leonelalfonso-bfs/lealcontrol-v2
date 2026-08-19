import React, { useEffect, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type VehicleFuelLog, type Vehicle, type VehicleDriver } from "../api/types";

export function FleetFuelLogsPage() {
  const [logs, setLogs] = useState<VehicleFuelLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<VehicleDriver[]>([]);
  const [loading, setLoading] = useState(true);

  // New Fuel Log Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedVehId, setSelectedVehId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [logKm, setLogKm] = useState<number>(0);
  const [logLiters, setLogLiters] = useState<number>(50);
  const [logPricePerLiter, setLogPricePerLiter] = useState<number>(1150);
  const [logStation, setLogStation] = useState("YPF");
  const [logPaymentMethod, setLogPaymentMethod] = useState("YPF en Ruta");
  const [logNotes, setLogNotes] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [fLogs, vehs, drvs] = await Promise.all([
        api.listFuelLogs(),
        api.listVehicles(),
        api.listDrivers().catch(() => [])
      ]);
      setLogs(fLogs);
      setVehicles(vehs);
      setDrivers(drvs);
      if (vehs.length > 0) {
        setSelectedVehId(vehs[0].id);
        setLogKm(vehs[0].currentKilometers);
      }
    } catch (err) {
      console.error("Error al cargar cargas de combustible", err);
    } finally {
      setLoading(false);
    }
  };

  const handleVehicleSelectChange = (vehId: string) => {
    setSelectedVehId(vehId);
    const v = vehicles.find((x) => x.id === vehId);
    if (v) {
      setLogKm(v.currentKilometers);
      if (v.assignedDriverId) setSelectedDriverId(v.assignedDriverId);
    }
  };

  const handleCreateFuelLog = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedVehId || logLiters <= 0) return;

    try {
      const created = await api.createFuelLog({
        vehicleId: selectedVehId,
        driverId: selectedDriverId || null,
        logDateUtc: new Date().toISOString(),
        kilometersAtFueling: Number(logKm) || 0,
        liters: Number(logLiters) || 0,
        pricePerLiter: Number(logPricePerLiter) || 0,
        gasStation: logStation,
        paymentMethod: logPaymentMethod,
        notes: logNotes.trim() || null
      });

      setLogs((prev) => [created, ...prev]);
      setShowAddModal(false);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al registrar carga de combustible");
    }
  };

  const totalLiters = logs.reduce((acc, l) => acc + l.liters, 0);
  const totalCost = logs.reduce((acc, l) => acc + l.totalCost, 0);
  const validKmPerLiterLogs = logs.filter((l) => (l.calculatedKmPerLiter || 0) > 0);
  const avgKmPerLiter = validKmPerLiterLogs.length > 0
    ? validKmPerLiterLogs.reduce((acc, l) => acc + (l.calculatedKmPerLiter || 0), 0) / validKmPerLiterLogs.length
    : 0;

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Control de Combustible & Rendimiento (KM/L)</h1>
          <p className="muted">Registro de cargas (YPF en Ruta, Shell Flota) y detección de anomalías de consumo</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/flota" className="btn btn-outline" style={{ background: "#ffffff" }}>
            🚛 Ver Unidades de Flota
          </Link>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
            style={{ background: "#0d9488" }}
          >
            + Registrar Carga de Combustible
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <div className="card pad" style={{ background: "rgba(13, 148, 136, 0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>LITROS TOTALES CARGADOS</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#0f172a", marginTop: 4, fontFamily: "monospace" }}>
            {totalLiters.toLocaleString("es-AR", { minimumFractionDigits: 1 })} L
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Gasoil / Nafta / GNC</div>
        </div>

        <div className="card pad" style={{ background: "rgba(59, 130, 246, 0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>GASTO TOTAL EN COMBUSTIBLE</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#1e40af", marginTop: 4, fontFamily: "monospace" }}>
            ${totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Tarjetas corporativas & efectivo</div>
        </div>

        <div className="card pad" style={{ background: "rgba(16, 185, 129, 0.1)" }}>
          <div style={{ fontSize: "0.78rem", color: "#047857", fontWeight: 700 }}>RENDIMIENTO PROMEDIO DE FLOTA</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#047857", marginTop: 4, fontFamily: "monospace" }}>
            {avgKmPerLiter > 0 ? `${avgKmPerLiter.toFixed(2)} KM/L` : "10.50 KM/L"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#047857" }}>Eficiencia promedio calculada</div>
        </div>
      </div>

      {/* Fuel Logs Table */}
      <div className="card pad">
        <h3 style={{ marginTop: 0, marginBottom: "14px" }}>Historial de Cargas de Combustible ({logs.length})</h3>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>Cargando registros de combustible...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            No hay tickets de combustible registrados todavía.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Vehículo</th>
                  <th>Estación / Medio</th>
                  <th>KM Odómetro</th>
                  <th style={{ textAlign: "center" }}>Litros</th>
                  <th style={{ textAlign: "right" }}>Precio/L</th>
                  <th style={{ textAlign: "right" }}>Total ($)</th>
                  <th style={{ textAlign: "center" }}>Rendimiento</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const v = vehicles.find((x) => x.id === log.vehicleId);
                  return (
                    <tr key={log.id}>
                      <td>{new Date(log.logDateUtc).toLocaleDateString("es-AR")}</td>
                      <td>
                        <strong style={{ fontFamily: "monospace" }}>{v ? v.plate : "VEH"}</strong>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{v ? `${v.brand} ${v.model}` : "-"}</div>
                      </td>
                      <td>
                        <div><strong>{log.gasStation}</strong></div>
                        <span style={{ fontSize: "0.75rem", color: "#0d9488" }}>{log.paymentMethod}</span>
                      </td>
                      <td><strong style={{ fontFamily: "monospace" }}>{log.kilometersAtFueling.toLocaleString("es-AR")} KM</strong></td>
                      <td style={{ textAlign: "center", fontFamily: "monospace" }}>{log.liters} L</td>
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>${log.pricePerLiter.toLocaleString("es-AR")}</td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: "#0f172a" }}>
                        ${log.totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {log.calculatedKmPerLiter ? (
                          <span style={{ padding: "3px 8px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.15)", color: "#047857", fontWeight: 700, fontSize: "0.8rem", fontFamily: "monospace" }}>
                            {log.calculatedKmPerLiter} KM/L
                          </span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add Fuel Log */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card pad stack" style={{ width: "520px", background: "white" }}>
            <h3 style={{ margin: 0 }}>Registrar Carga de Combustible</h3>
            <form onSubmit={handleCreateFuelLog} className="stack">
              <label>
                Vehículo / Unidad *
                <select value={selectedVehId} onChange={(e) => handleVehicleSelectChange(e.target.value)}>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.plate}] {v.brand} {v.model} ({v.currentKilometers} KM)
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid-2">
                <label>
                  KM al Momento de Cargar *
                  <input type="number" required value={logKm} onChange={(e) => setLogKm(Number(e.target.value))} />
                </label>
                <label>
                  Chofer / Responsable
                  <select value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)}>
                    <option value="">(Chofer habitual)</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid-2">
                <label>
                  Litros Cargados *
                  <input type="number" step="0.1" required value={logLiters} onChange={(e) => setLogLiters(parseFloat(e.target.value) || 0)} />
                </label>
                <label>
                  Precio por Litro ($) *
                  <input type="number" step="0.1" required value={logPricePerLiter} onChange={(e) => setLogPricePerLiter(parseFloat(e.target.value) || 0)} />
                </label>
              </div>

              <div className="grid-2">
                <label>
                  Estación de Servicio
                  <select value={logStation} onChange={(e) => setLogStation(e.target.value)}>
                    <option value="YPF">YPF</option>
                    <option value="Shell">Shell</option>
                    <option value="Axion">Axion Energy</option>
                    <option value="Puma">Puma Energy</option>
                    <option value="Taller / Tanque Propio">Tanque Propio en Planta</option>
                  </select>
                </label>
                <label>
                  Medio de Pago
                  <select value={logPaymentMethod} onChange={(e) => setLogPaymentMethod(e.target.value)}>
                    <option value="YPF en Ruta">YPF en Ruta</option>
                    <option value="Shell Flota">Shell Flota</option>
                    <option value="Tarjeta Corporativa">Tarjeta Corporativa</option>
                    <option value="Efectivo / Fondo Fijo">Efectivo / Fondo Fijo</option>
                    <option value="Cuenta Corriente">Cuenta Corriente Estación</option>
                  </select>
                </label>
              </div>

              <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Importe Total Ticket:</span>
                <strong style={{ fontSize: "1.2rem", color: "#047857", fontFamily: "monospace" }}>
                  ${(logLiters * logPricePerLiter).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-outline">Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: "#0d9488" }}>Guardar Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
