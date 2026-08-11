import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { label, type Lead } from "../api/types";

export function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("Manual");

  const load = () => api.listLeads().then(setLeads).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  const capture = async (e: FormEvent) => {
    e.preventDefault();
    await api.captureLead({ name, contactName, phone, source });
    setName(""); setContactName(""); setPhone("");
    load();
  };

  const convert = async (lead: Lead) => {
    const legalName = window.prompt("Razón social del cliente", lead.name);
    if (!legalName) return;
    const cuit = window.prompt("CUIT (11 dígitos)", "");
    if (!cuit) return;
    try {
      const customer = await api.convertLead(lead.id, {
        legalName,
        documentType: "Cuit",
        documentNumber: cuit,
        taxCondition: "ResponsableInscripto",
        iibbRegime: "Local",
        isCustomer: true,
        isSupplier: false,
        phone: lead.phone ?? undefined,
        email: lead.email ?? undefined
      });
      navigate(`/clientes/${customer.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prospectos</h1>
          <div className="muted">Acá nace la relación. Convertir crea el cliente de verdad.</div>
        </div>
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
                <td><button className="btn ghost" onClick={() => convert(l)}>Convertir a cliente</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && <p className="pad muted">No hay prospectos abiertos.</p>}
      </div>
    </>
  );
}
