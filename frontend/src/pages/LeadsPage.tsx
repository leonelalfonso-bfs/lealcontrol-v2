import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { label, type Lead } from "../api/types";
import { ExcelToolbar, excelDate } from "../components/ExcelTools";

export function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("Manual");
  const [conversionLead, setConversionLead] = useState<Lead | null>(null);
  const [legalName, setLegalName] = useState("");
  const [cuit, setCuit] = useState("");
  const [taxCondition, setTaxCondition] = useState("ResponsableInscripto");
  const [iibbRegime, setIibbRegime] = useState("Local");
  const [converting, setConverting] = useState(false);

  const load = () => api.listLeads().then(setLeads).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  const capture = async (e: FormEvent) => {
    e.preventDefault();
    await api.captureLead({ name, contactName, phone, source });
    setName(""); setContactName(""); setPhone("");
    load();
  };

  const openConversion = (lead: Lead) => {
    setConversionLead(lead);
    setLegalName(lead.companyName || lead.name || "");
    setCuit("");
    setTaxCondition("ResponsableInscripto");
    setIibbRegime("Local");
    setError(null);
  };

  const convert = async (event: FormEvent) => {
    event.preventDefault();
    if (!conversionLead) return;

    const documentNumber = cuit.replace(/\D/g, "");
    if (documentNumber.length !== 11) {
      setError("El CUIT debe contener 11 dígitos.");
      return;
    }

    setConverting(true);
    setError(null);
    try {
      const customer = await api.convertLead(conversionLead.id, {
        legalName: legalName.trim(),
        documentType: "Cuit",
        documentNumber,
        taxCondition,
        iibbRegime,
        isCustomer: true,
        isSupplier: false,
        phone: conversionLead.phone ?? undefined,
        email: conversionLead.email ?? undefined
      });
      setConversionLead(null);
      navigate(`/clientes/${customer.id}?returnUrl=/prospectos`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConverting(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prospectos</h1>
          <div className="muted">Acá nace la relación. Convertir crea el cliente de verdad.</div>
        </div>
        <ExcelToolbar fileName="prospectos" rows={leads} columns={[{ key: "companyName", header: "Empresa" }, { key: "contactName", header: "Contacto" }, { key: "source", header: "Origen" }, { key: "status", header: "Estado" }, { key: "createdAtUtc", header: "Fecha" }]} />
      </div>
      {error && <div className="alert">{error}</div>}
      <form className="card pad toolbar" onSubmit={capture} style={{ marginBottom: 16 }}>
        <input placeholder="Empresa / consulta" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Contacto" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <input placeholder="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <select value={source} onChange={(e) => setSource(e.target.value)} style={{ maxWidth: 160 }}>
          <option>Manual</option><option>Phone</option><option>WhatsApp</option><option>Email</option>
          <option>WalkIn</option><option>Catalog</option>
        </select>
        <button className="btn">Capturar</button>
      </form>

      {conversionLead && (
        <form className="card pad" onSubmit={convert} style={{ marginBottom: 16 }}>
          <div className="page-head" style={{ marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0 }}>Convertir prospecto en empresa</h3>
              <div className="muted">Revisá los datos antes de incorporarlo al Directorio.</div>
            </div>
            <button type="button" className="btn ghost" onClick={() => setConversionLead(null)}>Cancelar</button>
          </div>
          <div className="grid-3">
            <label>
              Razón social
              <input value={legalName} onChange={(event) => setLegalName(event.target.value)} required />
            </label>
            <label>
              CUIT
              <input value={cuit} onChange={(event) => setCuit(event.target.value)} inputMode="numeric" placeholder="30-12345678-9" required />
            </label>
            <label>
              Condición fiscal
              <select value={taxCondition} onChange={(event) => setTaxCondition(event.target.value)}>
                <option value="ResponsableInscripto">Responsable inscripto</option>
                <option value="Monotributo">Monotributo</option>
                <option value="Exento">Exento</option>
                <option value="ConsumidorFinal">Consumidor final</option>
              </select>
            </label>
            <label>
              Régimen IIBB
              <select value={iibbRegime} onChange={(event) => setIibbRegime(event.target.value)}>
                <option value="Local">Local</option>
                <option value="ConvenioMultilateral">Convenio multilateral</option>
                <option value="Exento">Exento</option>
                <option value="NoInscripto">No inscripto</option>
              </select>
            </label>
          </div>
          <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn" disabled={converting}>{converting ? "Convirtiendo…" : "Crear empresa"}</button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr><th>Prospecto</th><th>Origen</th><th>Contacto</th><th></th></tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td><strong>{l.name}</strong><div className="muted">{l.description}</div></td>
                <td>{label(l.source)}</td>
                <td>{l.contactName ?? l.phone ?? "—"}</td>
                <td><button type="button" className="btn ghost" onClick={() => openConversion(l)}>Convertir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && <p className="pad muted">No hay prospectos abiertos.</p>}
      </div>
    </>
  );
}
