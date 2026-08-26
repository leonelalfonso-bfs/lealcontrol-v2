import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { label, type CustomerSummary } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

function parseSupplierRow(row: Record<string, unknown>) {
  const getField = (...candidates: string[]): string => {
    const rowKeys = Object.keys(row);
    for (const c of candidates) {
      if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== "") {
        return String(row[c]).trim();
      }
      const normC = c.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = rowKeys.find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === normC);
      if (match && row[match] !== undefined && row[match] !== null && String(row[match]).trim() !== "") {
        return String(row[match]).trim();
      }
    }
    return "";
  };

  const legalName = getField(
    "legalName",
    "LegalName",
    "Razón social",
    "Razón Social",
    "Razon social",
    "Razon Social",
    "Nombre",
    "Proveedor",
    "Empresa"
  );
  if (!legalName) return null;

  const tradeName =
    getField("tradeName", "TradeName", "Nombre comercial", "Nombre Comercial", "Fantasia", "Fantasía") || null;

  let docNumber = getField(
    "documentNumber",
    "DocumentNumber",
    "CUIT",
    "Cuit",
    "cuit",
    "Documento",
    "Nro Documento",
    "Numero Documento"
  ).replace(/[^0-9]/g, "");

  let docType =
    getField("documentType", "DocumentType", "Tipo Documento", "Tipo documento", "Tipo") ||
    (docNumber.length === 11 ? "CUIT" : "DNI");

  const rawTax = getField(
    "taxCondition",
    "TaxCondition",
    "Condición IVA",
    "Condición Fiscal",
    "Condicion IVA",
    "Condicion Fiscal",
    "IVA",
    "Iva"
  );

  let taxCondition = "ResponsableInscripto";
  const normTax = rawTax.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normTax.includes("inscripto") || normTax === "ri") taxCondition = "ResponsableInscripto";
  else if (normTax.includes("monotribut") || normTax === "mono") taxCondition = "Monotributo";
  else if (normTax.includes("exento") || normTax === "ex") taxCondition = "Exento";
  else if (normTax.includes("consumidor") || normTax.includes("final") || normTax === "cf")
    taxCondition = "ConsumidorFinal";
  else if (normTax.includes("exterior") || normTax.includes("ext")) taxCondition = "ClienteDelExterior";
  else if (rawTax) taxCondition = rawTax;

  const email = getField("email", "Email", "Correo", "Mail") || null;
  const phone = getField("phone", "Teléfono", "Telefono", "Celular") || null;

  return {
    legalName,
    tradeName,
    documentType: docType,
    documentNumber: docNumber || "30000000000",
    taxCondition,
    iibbRegime: "NoInscripto",
    isCustomer: false,
    isSupplier: true,
    email,
    phone
  };
}

export function SuppliersPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CustomerSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = (term = search) => {
    setLoading(true);
    api
      .listCustomers(term, "supplier")
      .then((page) => {
        setItems(page.items);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load("");
  }, []);

  const handleImportSuppliers = async (rows: Record<string, unknown>[]) => {
    try {
      setError(null);
      setSuccessMsg(null);

      const parsedList = rows.map(parseSupplierRow).filter((r): r is NonNullable<typeof r> => r !== null);

      if (parsedList.length === 0) {
        throw new Error(
          "No se encontraron registros válidos en el Excel. Asegúrese de que la columna 'Razón Social' o 'legalName' esté completa."
        );
      }

      await Promise.all(parsedList.map((payload) => api.createCustomer(payload)));
      setSuccessMsg(`Se importaron ${parsedList.length} proveedores exitosamente.`);
      load();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : "Error al importar proveedores desde Excel.");
    }
  };

  const totalBoth = items.filter((i) => i.isCustomer && i.isSupplier).length;
  const totalRi = items.filter((i) => i.taxCondition === "ResponsableInscripto").length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🏢 Proveedores Comercial</h1>
          <p className="muted">Ficha unificada de registro comercial, fiscal y compras</p>
        </div>
        <div className="toolbar">
          <ExcelToolbar
            fileName="proveedores"
            rows={items}
            columns={[
              { key: "legalName", header: "Razón social" },
              { key: "tradeName", header: "Nombre comercial" },
              { key: "documentNumber", header: "CUIT" },
              { key: "taxCondition", header: "Condición IVA" },
              { key: "email", header: "Email" },
              { key: "phone", header: "Teléfono" }
            ]}
            templateColumns={[
              "Razón Social",
              "Nombre Comercial",
              "Tipo Documento",
              "CUIT",
              "Condición IVA",
              "Email",
              "Teléfono"
            ]}
            onImport={handleImportSuppliers}
          />
          <Link className="btn" to="/clientes/nuevo?type=supplier">
            + Nuevo Proveedor
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {successMsg && (
        <div
          className="alert"
          style={{
            marginBottom: 16,
            background: "rgba(16, 185, 129, 0.12)",
            borderColor: "#10b981",
            color: "#065f46",
            fontWeight: 600
          }}
        >
          ✓ {successMsg}
        </div>
      )}

      <div className="kpi kpi-4">
        <div className="card">
          <span className="muted">Total Proveedores</span>
          <strong>{items.length}</strong>
        </div>
        <div className="card">
          <span className="muted">Clientes y Proveedores</span>
          <strong style={{ color: "#2563eb" }}>{totalBoth} (Cuenta Corriente)</strong>
        </div>
        <div className="card">
          <span className="muted">Resp. Inscriptos</span>
          <strong>{totalRi}</strong>
        </div>
        <div className="card">
          <span className="muted">Monotributo / Otros</span>
          <strong>{items.length - totalRi}</strong>
        </div>
      </div>

      <div className="card pad toolbar" style={{ marginBottom: 20 }}>
        <input
          placeholder="Buscar por Razón Social, CUIT, email o teléfono..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          style={{ maxWidth: 420 }}
        />
        <button type="button" className="btn ghost" onClick={() => load()}>
          Buscar
        </button>
      </div>

      <div className="card">
        {loading ? (
          <p className="pad muted">Cargando proveedores…</p>
        ) : items.length === 0 ? (
          <p className="pad muted" style={{ textAlign: "center", padding: 32 }}>
            No hay proveedores registrados. Hacé clic en <strong>"+ Nuevo Proveedor"</strong> para dar de alta.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proveedor / Razón Social</th>
                  <th>CUIT / Tipo</th>
                  <th>Condición IVA</th>
                  <th>Rol / Cuenta Corriente</th>
                  <th>Teléfono / Email</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/clientes/${s.id}`}>
                        <strong>🏢 {s.legalName}</strong>
                      </Link>
                    </td>
                    <td>
                      {label(s.documentType)} {s.documentNumber}
                    </td>
                    <td>
                      <span className="badge ok">{label(s.taxCondition)}</span>
                    </td>
                    <td>
                      {s.isCustomer && s.isSupplier ? (
                        <span
                          className="badge ok"
                          style={{ background: "#dbeafe", color: "#1e40af" }}
                          title="Comparte cuenta corriente unificada de cliente y proveedor"
                        >
                          🤝 Cliente y Proveedor
                        </span>
                      ) : (
                        <span className="badge ok" style={{ background: "#fef3c7", color: "#92400e" }}>
                          🏢 Proveedor Exclusivo
                        </span>
                      )}
                    </td>
                    <td>
                      {s.phone && <div>📞 {s.phone}</div>}
                      {s.email && (
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          ✉️ {s.email}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                          onClick={() => navigate(`/clientes/${s.id}`)}
                        >
                          👁️ Ficha
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                          onClick={() => navigate(`/clientes/${s.id}/editar`)}
                        >
                          ✏️ Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
