import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { label, type Lead } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

export function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("Manual");
  const [conversionLead, setConversionLead] = useState<Lead | null>(null);
  const [legalName, setLegalName] = useState("");
  const [cuit, setCuit] = useState("");
  const [taxCondition, setTaxCondition] = useState("ResponsableInscripto");
  const [iibbRegime, setIibbRegime] = useState("Local");
  const [openOpportunityAfter, setOpenOpportunityAfter] = useState(true);
  const [converting, setConverting] = useState(false);
  const [lookingUpArca, setLookingUpArca] = useState(false);
  const [arcaInfo, setArcaInfo] = useState<string | null>(null);

  const load = () => api.listLeads().then(setLeads).catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const capture = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.captureLead({ name, contactName, email: email.trim() || null, phone, source });
      setName("");
      setContactName("");
      setEmail("");
      setPhone("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openConversion = (lead: Lead) => {
    setConversionLead(lead);
    setLegalName(lead.companyName || lead.name || "");
    const cuitMatch = lead.description?.match(/CUIT\s*([0-9-]{11,13})/i);
    setCuit(cuitMatch ? cuitMatch[1].replace(/\D/g, "") : "");
    setTaxCondition("ResponsableInscripto");
    setIibbRegime("Local");
    setOpenOpportunityAfter(true);
    setArcaInfo(null);
    setError(null);
  };

  const consultArca = async () => {
    const clean = cuit.replace(/\D/g, "");
    if (clean.length !== 11) {
      setError("Ingresá un CUIT de 11 dígitos antes de consultar ARCA.");
      return;
    }
    setLookingUpArca(true);
    setError(null);
    setArcaInfo(null);
    try {
      const res = await api.consultArcaCuit(clean);
      if (res.legalName) setLegalName(res.legalName);
      if (res.taxCondition && ["ResponsableInscripto", "Monotributo", "Exento", "ConsumidorFinal"].includes(res.taxCondition)) {
        setTaxCondition(res.taxCondition);
      }
      setArcaInfo(`ARCA confirmó: ${res.legalName} (${label(res.taxCondition)}).`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLookingUpArca(false);
    }
  };

  const archiveLead = async (lead: Lead) => {
    if (!confirm(`¿Archivar el prospecto "${lead.name}"?`)) return;
    setError(null);
    try {
      await api.archiveLead(lead.id);
      if (conversionLead?.id === lead.id) setConversionLead(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const convert = async (event: FormEvent) => {
    event.preventDefault();
    if (!conversionLead) return;

    const documentNumber = cuit.replace(/\D/g, "");
    if (documentNumber.length !== 11) {
      setError("El CUIT debe contener 11 dígitos numéricos.");
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
      }, openOpportunityAfter);

      if (openOpportunityAfter) {
        const linked = await api.opportunities(customer.id).catch(() => []);
        const opportunity = linked.find((item) => item.leadId === conversionLead.id);
        navigate(opportunity
          ? `/oportunidades/${opportunity.id}`
          : `/clientes/${customer.id}?returnUrl=/prospectos`);
      } else {
        setConversionLead(null);
        navigate(`/clientes/${customer.id}?returnUrl=/prospectos`);
      }
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
          <div className="muted">Acá nace la relación. Al calificar, podés dar de alta la empresa y abrir su oportunidad comercial.</div>
        </div>
        <ExcelToolbar
          fileName="prospectos"
          rows={leads}
          columns={[
            { key: "name", header: "Empresa" },
            { key: "contactName", header: "Contacto" },
            { key: "source", header: "Origen" },
            { key: "status", header: "Estado" },
            { key: "createdAtUtc", header: "Fecha" }
          ]}
        />
      </div>

      {error && <div className="alert">{error}</div>}

      <form className="card pad toolbar" onSubmit={capture} style={{ marginBottom: 16 }}>
        <input placeholder="Empresa / consulta *" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Contacto" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <select value={source} onChange={(e) => setSource(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="Manual">Manual</option>
          <option value="Phone">Teléfono</option>
          <option value="WhatsApp">WhatsApp</option>
          <option value="Email">Email</option>
          <option value="WalkIn">Visita en planta</option>
          <option value="Catalog">Catálogo Web</option>
        </select>
        <button className="btn">Capturar Prospecto</button>
      </form>

      {conversionLead && (
        <form className="card pad" onSubmit={convert} style={{ marginBottom: 16, borderLeft: "5px solid var(--lc-accent)" }}>
          <div className="page-head" style={{ marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0 }}>🏢 Convertir Prospecto en Cliente Formal</h3>
              <div className="muted">Se da de alta en Clientes, se guarda el contacto y se vinculan sus oportunidades y mails.</div>
            </div>
            <button type="button" className="btn ghost" onClick={() => setConversionLead(null)}>
              Cancelar
            </button>
          </div>
          {arcaInfo && <div className="success-banner" style={{ marginBottom: 12 }}>{arcaInfo}</div>}
          <div className="grid-3">
            <label>
              CUIT (11 dígitos) *
              <div className="row" style={{ gap: 6 }}>
                <input
                  value={cuit}
                  onChange={(event) => setCuit(event.target.value)}
                  inputMode="numeric"
                  placeholder="30-12345678-9"
                  required
                />
                <button type="button" className="btn btn-outline compact" disabled={lookingUpArca} onClick={() => void consultArca()}>
                  {lookingUpArca ? "Consultando…" : "ARCA"}
                </button>
              </div>
            </label>
            <label>
              Razón Social / Nombre *
              <input value={legalName} onChange={(event) => setLegalName(event.target.value)} required />
            </label>
            <label>
              Condición Fiscal *
              <select value={taxCondition} onChange={(event) => setTaxCondition(event.target.value)}>
                <option value="ResponsableInscripto">Responsable Inscripto</option>
                <option value="Monotributo">Monotributo</option>
                <option value="Exento">Exento</option>
                <option value="ConsumidorFinal">Consumidor Final</option>
              </select>
            </label>
            <label>
              Régimen IIBB
              <select value={iibbRegime} onChange={(event) => setIibbRegime(event.target.value)}>
                <option value="Local">Local</option>
                <option value="ConvenioMultilateral">Convenio Multilateral</option>
                <option value="Exento">Exento</option>
                <option value="NoInscripto">No Inscripto</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--lc-surface-sunken)", borderRadius: 8 }}>
            <label style={{ alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={openOpportunityAfter}
                onChange={(e) => setOpenOpportunityAfter(e.target.checked)}
              />
              🎯 Crear automáticamente una Oportunidad Comercial en el Embudo para este nuevo cliente
            </label>
          </div>

          <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <Link
              to={`/clientes/nuevo?name=${encodeURIComponent(conversionLead.name || "")}&phone=${encodeURIComponent(conversionLead.phone || "")}`}
              className="btn btn-outline"
              style={{ marginRight: 8 }}
            >
              Abrir Formulario Completo de Cliente
            </Link>
            <button className="btn" disabled={converting}>
              {converting ? "Convirtiendo…" : "Confirmar Alta y Crear"}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Prospecto / Empresa</th>
              <th>Origen</th>
              <th>Contacto</th>
              <th className="t-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted t-center">
                  No hay prospectos pendientes de calificar.
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.name}</strong>
                    <div className="muted">{l.description}</div>
                  </td>
                  <td>{label(l.source)}</td>
                  <td>{l.contactName ?? l.phone ?? "—"}</td>
                  <td className="t-right">
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <Link
                        to={`/clientes/nuevo?name=${encodeURIComponent(l.name || "")}&phone=${encodeURIComponent(l.phone || "")}`}
                        className="btn ghost compact"
                        title="Cargar cliente con formulario completo"
                      >
                        🏢 Cargar Cliente
                      </Link>
                      <button type="button" className="btn compact" onClick={() => openConversion(l)}>
                        Convertir
                      </button>
                      <button type="button" className="btn ghost compact" onClick={() => void archiveLead(l)}>
                        Archivar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
