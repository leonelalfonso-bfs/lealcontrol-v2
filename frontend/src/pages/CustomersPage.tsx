import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { label, type CustomerSummary } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

function parseCustomerRow(row: Record<string, unknown>) {
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
    "Cliente",
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
    "Numero Documento",
    "DNI",
    "Dni"
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

  let taxCondition = "ConsumidorFinal";
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
    isCustomer: true,
    isSupplier: false,
    email,
    phone
  };
}

export function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = (term = search) => {
    api
      .listCustomers(term, "customer")
      .then((page) => {
        setItems(page.items);
        setTotal(page.total ?? 0);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    load("");
  }, []);

  const handleImportCustomers = async (rows: Record<string, unknown>[]) => {
    try {
      setError(null);
      setSuccessMsg(null);

      const parsedList = rows.map(parseCustomerRow).filter((r): r is NonNullable<typeof r> => r !== null);

      if (parsedList.length === 0) {
        throw new Error(
          "No se encontraron registros válidos en el Excel. Asegúrese de que la columna 'Razón Social' o 'legalName' esté completa."
        );
      }

      await Promise.all(parsedList.map((payload) => api.createCustomer(payload)));
      setSuccessMsg(`Se importaron ${parsedList.length} clientes exitosamente.`);
      load();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : "Error al importar clientes desde Excel.");
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clientes</h1>
          <div className="muted">{total} en este tenant</div>
        </div>
        <div className="toolbar">
          <ExcelToolbar
            fileName="clientes"
            rows={items}
            columns={[
              { key: "legalName", header: "Razón social" },
              { key: "tradeName", header: "Nombre comercial" },
              { key: "documentNumber", header: "Documento" },
              { key: "email", header: "Email" },
              { key: "phone", header: "Teléfono" },
              { key: "status", header: "Estado" }
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
            onImport={handleImportCustomers}
          />
          <Link className="btn" to="/clientes/nuevo">
            Nuevo cliente
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

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <input
          placeholder="Buscar por razón social, CUIT, email o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          style={{ maxWidth: 420 }}
        />
        <button className="btn ghost" onClick={() => load()}>
          Buscar
        </button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Documento</th>
              <th>IVA</th>
              <th>Contacto</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} onClick={() => navigate(`/clientes/${c.id}`)}>
                <td>
                  <strong>{c.legalName}</strong>
                  {c.tradeName && <div className="muted">{c.tradeName}</div>}
                </td>
                <td>
                  {label(c.documentType)} {c.documentNumber}
                </td>
                <td>{label(c.taxCondition)}</td>
                <td>{c.email ?? c.phone ?? "—"}</td>
                <td>
                  <span className={c.status === "Active" ? "badge" : "badge off"}>{label(c.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="pad muted">No hay resultados.</p>}
      </div>
    </>
  );
}
