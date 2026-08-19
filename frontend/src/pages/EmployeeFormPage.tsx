import React, { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { provinces, type Employee, type EppDelivery } from "../api/types";
import { digitsOnly, formatCuitDisplay, isValidCuitChecksum } from "../lib/arContact";

export function EmployeeFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"general" | "labor" | "banking" | "epp">("general");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [fileNumber, setFileNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [cuil, setCuil] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("M");
  const [nationality, setNationality] = useState("Argentina");
  const [civilStatus, setCivilStatus] = useState("Soltero/a");

  const [address, setAddress] = useState("");
  const [city, setCity] = useState("San Lorenzo");
  const [province, setProvince] = useState("SantaFe");
  const [postalCode, setPostalCode] = useState("2200");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");

  const [hireDate, setHireDate] = useState(new Date().toISOString().split("T")[0]);
  const [seniorityRecognitionDate, setSeniorityRecognitionDate] = useState("");
  const [contractType, setContractType] = useState<number>(0);
  const [jobTitle, setJobTitle] = useState("Técnico Especialista");
  const [department, setDepartment] = useState("Técnica");
  const [costCenter, setCostCenter] = useState("Operaciones");
  const [workplaceLocation, setWorkplaceLocation] = useState("Planta Central");
  const [unionCct, setUnionCct] = useState("Comercio 130/75");
  const [unionCategory, setUnionCategory] = useState("Administrativo A");
  const [healthInsurance, setHealthInsurance] = useState("OSECAC");
  const [baseSalary, setBaseSalary] = useState<number>(500000);
  const [hourlyRate, setHourlyRate] = useState<number>(0);
  const [status, setStatus] = useState<number>(0);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [bankName, setBankName] = useState("Banco de la Nación Argentina");
  const [cbu, setCbu] = useState("");
  const [bankAlias, setBankAlias] = useState("");

  // EPP Sublist
  const [eppList, setEppList] = useState<EppDelivery[]>([]);
  const [showAddEppModal, setShowAddEppModal] = useState(false);
  const [newEppItem, setNewEppItem] = useState("");
  const [newEppBrand, setNewEppBrand] = useState("");
  const [newEppCert, setNewEppCert] = useState("");
  const [newEppQty, setNewEppQty] = useState(1);

  useEffect(() => {
    if (isEditing && id) {
      loadEmployee(id);
    } else {
      setFileNumber(`LEG-${Math.floor(100 + Math.random() * 900)}`);
    }
  }, [id, isEditing]);

  const loadEmployee = async (empId: string) => {
    try {
      setLoading(true);
      const emp = await api.getEmployee(empId);
      setFileNumber(emp.fileNumber);
      setFirstName(emp.firstName);
      setLastName(emp.lastName);
      setDocumentNumber(emp.documentNumber);
      setCuil(emp.cuil);
      if (emp.birthDate) setBirthDate(new Date(emp.birthDate).toISOString().split("T")[0]);
      setGender(emp.gender);
      setNationality(emp.nationality);
      setCivilStatus(emp.civilStatus);
      setAddress(emp.address);
      setCity(emp.city);
      setProvince(emp.province);
      setPostalCode(emp.postalCode);
      setPhone(emp.phone);
      setEmail(emp.email);
      setEmergencyContactName(emp.emergencyContactName || "");
      setEmergencyContactPhone(emp.emergencyContactPhone || "");

      if (emp.hireDate) setHireDate(new Date(emp.hireDate).toISOString().split("T")[0]);
      if (emp.seniorityRecognitionDate) setSeniorityRecognitionDate(new Date(emp.seniorityRecognitionDate).toISOString().split("T")[0]);
      setContractType(emp.contractType);
      setJobTitle(emp.jobTitle);
      setDepartment(emp.department);
      setCostCenter(emp.costCenter);
      setWorkplaceLocation(emp.workplaceLocation);
      setUnionCct(emp.unionCct);
      setUnionCategory(emp.unionCategory);
      setHealthInsurance(emp.healthInsurance);
      setBaseSalary(emp.baseSalary);
      setHourlyRate(emp.hourlyRate);
      setStatus(emp.status);
      setPhotoPath(emp.photoPath || null);
      setNotes(emp.notes || "");

      setBankName(emp.bankName);
      setCbu(emp.cbu);
      setBankAlias(emp.bankAlias);

      const epps = await api.listEmployeeEpps(empId).catch(() => []);
      setEppList(epps);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar colaborador");
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPath(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !cuil.trim()) {
      setError("Completá Nombre, Apellido y CUIL.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload: Partial<Employee> = {
        fileNumber: fileNumber.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        documentNumber: documentNumber.trim() || digitsOnly(cuil).substring(2, 10),
        cuil: digitsOnly(cuil),
        birthDate: birthDate ? new Date(birthDate).toISOString() : null,
        gender,
        nationality,
        civilStatus,
        address: address.trim(),
        city: city.trim(),
        province,
        postalCode: postalCode.trim(),
        phone: phone.trim(),
        email: email.trim(),
        emergencyContactName: emergencyContactName.trim() || null,
        emergencyContactPhone: emergencyContactPhone.trim() || null,
        hireDate: new Date(hireDate).toISOString(),
        seniorityRecognitionDate: seniorityRecognitionDate ? new Date(seniorityRecognitionDate).toISOString() : null,
        contractType,
        jobTitle: jobTitle.trim(),
        department: department.trim(),
        costCenter: costCenter.trim(),
        workplaceLocation: workplaceLocation.trim(),
        unionCct: unionCct.trim(),
        unionCategory: unionCategory.trim(),
        healthInsurance: healthInsurance.trim(),
        baseSalary: Number(baseSalary) || 0,
        hourlyRate: Number(hourlyRate) || 0,
        bankName: bankName.trim(),
        cbu: cbu.trim(),
        bankAlias: bankAlias.trim(),
        status,
        photoPath,
        notes: notes.trim() || null
      };

      if (isEditing && id) {
        await api.updateEmployee(id, payload);
        navigate("/rrhh/empleados");
      } else {
        const created = await api.createEmployee(payload);
        navigate(`/rrhh/empleados/${created.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar colaborador");
    } finally {
      setSaving(false);
    }
  };

  const handleAddEpp = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !newEppItem.trim()) return;

    try {
      const created = await api.createEppDelivery({
        employeeId: id,
        itemName: newEppItem.trim(),
        brandModel: newEppBrand.trim() || null,
        certificateNumber: newEppCert.trim() || null,
        quantity: Number(newEppQty) || 1,
        deliveryDateUtc: new Date().toISOString()
      });
      setEppList((prev) => [created, ...prev]);
      setShowAddEppModal(false);
      setNewEppItem("");
      setNewEppBrand("");
      setNewEppCert("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al registrar entrega de EPP");
    }
  };

  if (loading) {
    return <div className="card pad" style={{ textAlign: "center" }}>Cargando legajo 360°...</div>;
  }

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>{isEditing ? `Legajo #${fileNumber} - ${lastName}, ${firstName}` : "Alta de Nuevo Colaborador"}</h1>
          <p className="muted">Ficha integral del trabajador conforme a LCT 20.744 y convenios paritarios</p>
        </div>
        <Link to="/rrhh/empleados" className="btn btn-outline">
          ← Volver a la Nómina
        </Link>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", marginBottom: "16px", border: "1px solid #f87171" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Tabs Navigation */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontWeight: activeTab === "general" ? 800 : 500,
            color: activeTab === "general" ? "#0d9488" : "#64748b",
            borderBottom: activeTab === "general" ? "3px solid #0d9488" : "none"
          }}
        >
          👤 1. Datos Personales & Domicilio
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("labor")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontWeight: activeTab === "labor" ? 800 : 500,
            color: activeTab === "labor" ? "#0d9488" : "#64748b",
            borderBottom: activeTab === "labor" ? "3px solid #0d9488" : "none"
          }}
        >
          💼 2. Datos Laborales, CCT & Sueldo
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("banking")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontWeight: activeTab === "banking" ? 800 : 500,
            color: activeTab === "banking" ? "#0d9488" : "#64748b",
            borderBottom: activeTab === "banking" ? "3px solid #0d9488" : "none"
          }}
        >
          🏦 3. Bancarización & Contacto Emergencia
        </button>

        {isEditing && (
          <button
            type="button"
            onClick={() => setActiveTab("epp")}
            style={{
              padding: "10px 18px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === "epp" ? 800 : 500,
              color: activeTab === "epp" ? "#0d9488" : "#64748b",
              borderBottom: activeTab === "epp" ? "3px solid #0d9488" : "none"
            }}
          >
            🦺 4. EPP & Ropa de Trabajo (SRT 299/11)
          </button>
        )}
      </div>

      <form onSubmit={handleSaveEmployee}>
        {/* TAB 1: GENERAL & PERSONAL */}
        {activeTab === "general" && (
          <div className="card pad stack">
            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "20px", alignItems: "flex-start", borderBottom: "1px solid #e2e8f0", paddingBottom: "18px" }}>
              {/* Photo Box */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: "50%",
                    border: "2px dashed #cbd5e1",
                    background: "#f8fafc",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden"
                  }}
                >
                  {photoPath ? (
                    <img src={photoPath} alt="Foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: "2.2rem", color: "#94a3b8" }}>📷</span>
                  )}
                </div>
                <label className="btn btn-outline" style={{ marginTop: 8, padding: "4px 8px", fontSize: "0.75rem", cursor: "pointer", display: "inline-block" }}>
                  📁 {photoPath ? "Cambiar Foto" : "Subir Foto"}
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
                </label>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                <div className="grid-3">
                  <label>
                    N° de Legajo *
                    <input type="text" required value={fileNumber} onChange={(e) => setFileNumber(e.target.value)} style={{ fontFamily: "monospace", fontWeight: 700 }} />
                  </label>
                  <label>
                    Apellido(s) *
                    <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </label>
                  <label>
                    Nombre(s) *
                    <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </label>
                </div>

                <div className="grid-3">
                  <label>
                    CUIL / CUIT *
                    <input type="text" required placeholder="20-xxxxxxxx-x" value={formatCuitDisplay(cuil)} onChange={(e) => setCuil(e.target.value)} style={{ fontFamily: "monospace", fontWeight: 700 }} />
                  </label>
                  <label>
                    DNI / Pasaporte
                    <input type="text" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
                  </label>
                  <label>
                    Fecha de Nacimiento
                    <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                  </label>
                </div>

                <div className="grid-3">
                  <label>
                    Género
                    <select value={gender} onChange={(e) => setGender(e.target.value)}>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                      <option value="X">No Binario / Otro</option>
                    </select>
                  </label>
                  <label>
                    Estado Civil
                    <select value={civilStatus} onChange={(e) => setCivilStatus(e.target.value)}>
                      <option value="Soltero/a">Soltero/a</option>
                      <option value="Casado/a">Casado/a</option>
                      <option value="Unión Convivencial">Unión Convivencial</option>
                      <option value="Divorciado/a">Divorciado/a</option>
                      <option value="Viudo/a">Viudo/a</option>
                    </select>
                  </label>
                  <label>
                    Nacionalidad
                    <input type="text" value={nationality} onChange={(e) => setNationality(e.target.value)} />
                  </label>
                </div>
              </div>
            </div>

            <h3>Domicilio Real & Contacto</h3>
            <div className="grid-3">
              <label style={{ gridColumn: "span 2" }}>
                Calle y Altura (Domicilio)
                <input type="text" placeholder="Av. San Martín 1234 Piso 2" value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
              <label>
                Código Postal
                <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
              </label>
            </div>

            <div className="grid-3">
              <label>
                Ciudad
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label>
                Provincia
                <select value={province} onChange={(e) => setProvince(e.target.value)}>
                  {provinces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Teléfono / WhatsApp
                <input type="text" placeholder="341-5551234" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
            </div>

            <label>
              Email Personal / Corporativo
              <input type="email" placeholder="colaborador@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
        )}

        {/* TAB 2: LABORAL & SUELDO */}
        {activeTab === "labor" && (
          <div className="card pad stack">
            <h3>Contratación, Puesto & Encuadre Gremial</h3>

            <div className="grid-3">
              <label>
                Fecha de Ingreso *
                <input type="date" required value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </label>
              <label>
                Antigüedad Reconocida (si difiere del ingreso)
                <input type="date" value={seniorityRecognitionDate} onChange={(e) => setSeniorityRecognitionDate(e.target.value)} />
              </label>
              <label>
                Modalidad de Contratación
                <select value={contractType} onChange={(e) => setContractType(Number(e.target.value))}>
                  <option value={0}>Tiempo Indeterminado (LCT Art. 90)</option>
                  <option value={1}>Plazo Fijo</option>
                  <option value={2}>Eventual</option>
                  <option value={3}>Periodo de Prueba</option>
                  <option value={4}>Pasantía / Formativo</option>
                </select>
              </label>
            </div>

            <div className="grid-3">
              <label>
                Puesto / Cargo *
                <input type="text" required value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </label>
              <label>
                Departamento
                <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="Técnica">Técnica</option>
                  <option value="Operaciones">Operaciones / Taller</option>
                  <option value="Ventas">Ventas & Comercial</option>
                  <option value="Administración">Administración & Finanzas</option>
                  <option value="Logística">Logística & Depósito</option>
                </select>
              </label>
              <label>
                Centro de Costos
                <input type="text" value={costCenter} onChange={(e) => setCostCenter(e.target.value)} />
              </label>
            </div>

            <div className="grid-3">
              <label>
                Convenio Colectivo de Trabajo (CCT)
                <select value={unionCct} onChange={(e) => setUnionCct(e.target.value)}>
                  <option value="Comercio 130/75">Comercio 130/75 (FAECYS)</option>
                  <option value="UOM 260/75">UOM 260/75 (Metalúrgicos)</option>
                  <option value="UOCRA 76/75">UOCRA 76/75 (Construcción)</option>
                  <option value="Camioneros 40/89">Camioneros 40/89 (Logística)</option>
                  <option value="Químicos">Sindicato del Personal Químico</option>
                  <option value="Fuera de Convenio">Fuera de Convenio / Jerárquico</option>
                </select>
              </label>
              <label>
                Categoría Profesional de Convenio
                <input type="text" value={unionCategory} onChange={(e) => setUnionCategory(e.target.value)} />
              </label>
              <label>
                Obra Social Sindical / Prepaga
                <input type="text" value={healthInsurance} onChange={(e) => setHealthInsurance(e.target.value)} />
              </label>
            </div>

            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <h4 style={{ margin: "0 0 12px 0", color: "#047857" }}>💰 Parámetros Salariales para Liquidación</h4>
              <div className="grid-3">
                <label>
                  Sueldo Básico Mensual (ARS) *
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(parseFloat(e.target.value) || 0)}
                    style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.1rem", color: "#047857" }}
                  />
                </label>
                <label>
                  Valor Hora (si es jornalizado)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
                    style={{ fontFamily: "monospace" }}
                  />
                </label>
                <label>
                  Estado del Empleado
                  <select value={status} onChange={(e) => setStatus(Number(e.target.value))}>
                    <option value={0}>🟢 Activo</option>
                    <option value={1}>🟡 Licencia Médica / Especial</option>
                    <option value={2}>🔴 Baja Definitiva</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BANCARIZACION & CONTACTO DE EMERGENCIA */}
        {activeTab === "banking" && (
          <div className="card pad stack">
            <h3>Cuenta Bancaria Sueldo (Acreditación Automática)</h3>
            <div className="grid-3">
              <label>
                Entidad Bancaria
                <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </label>
              <label style={{ gridColumn: "span 2" }}>
                CBU (22 Dígitos) *
                <input
                  type="text"
                  maxLength={22}
                  placeholder="0110xxxxxxxxxxxxxxxxxxxx"
                  value={cbu}
                  onChange={(e) => setCbu(e.target.value)}
                  style={{ fontFamily: "monospace", fontWeight: 700 }}
                />
              </label>
            </div>

            <div className="grid-2">
              <label>
                Alias CBU
                <input type="text" placeholder="JUAN.PEREZ.SUELDO" value={bankAlias} onChange={(e) => setBankAlias(e.target.value)} />
              </label>
              <label>
                Lugar de Trabajo Habitual
                <input type="text" value={workplaceLocation} onChange={(e) => setWorkplaceLocation(e.target.value)} />
              </label>
            </div>

            <h3>Contacto de Emergencia</h3>
            <div className="grid-2">
              <label>
                Nombre del Contacto (Familiar / Allegado)
                <input type="text" placeholder="María Pérez (Cónyuge)" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
              </label>
              <label>
                Teléfono de Emergencia
                <input type="text" placeholder="341-5559999" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} />
              </label>
            </div>

            <label>
              Observaciones del Legajo
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anotaciones internas de RRHH..." />
            </label>
          </div>
        )}

        {/* Actions Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "20px" }}>
          <button type="button" onClick={() => navigate("/rrhh/empleados")} className="btn btn-outline">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{ padding: "10px 24px", background: "#0d9488", fontWeight: 700 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Legajo 360°"}
          </button>
        </div>
      </form>

      {/* TAB 4: EPP LIST */}
      {isEditing && activeTab === "epp" && (
        <div className="card pad stack" style={{ marginTop: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Historial de Entrega de EPP & Ropa de Trabajo</h3>
              <div className="muted">Cumplimiento Resolución SRT 299/2011</div>
            </div>
            <button
              type="button"
              onClick={() => setShowAddEppModal(true)}
              className="btn btn-primary"
              style={{ background: "#0d9488", fontSize: "0.82rem" }}
            >
              + Registrar Entrega de EPP
            </button>
          </div>

          {eppList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
              No hay entregas registradas para este colaborador.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha de Entrega</th>
                    <th>Elemento / Ropa</th>
                    <th>Marca & Modelo</th>
                    <th>Certificado IRAM / Sello</th>
                    <th style={{ textAlign: "center" }}>Cant.</th>
                  </tr>
                </thead>
                <tbody>
                  {eppList.map((epp) => (
                    <tr key={epp.id}>
                      <td>{new Date(epp.deliveryDateUtc).toLocaleDateString("es-AR")}</td>
                      <td><strong>{epp.itemName}</strong></td>
                      <td>{epp.brandModel || "-"}</td>
                      <td><span style={{ fontFamily: "monospace" }}>{epp.certificateNumber || "-"}</span></td>
                      <td style={{ textAlign: "center" }}>{epp.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Mini Modal: Add EPP */}
      {showAddEppModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card pad stack" style={{ width: "500px", background: "white" }}>
            <h3 style={{ margin: 0 }}>Registrar Entrega de EPP</h3>
            <form onSubmit={handleAddEpp} className="stack">
              <label>
                Elemento / Ropa de Trabajo *
                <input type="text" required placeholder="Ej: Calzado de Seguridad con puntera de acero" value={newEppItem} onChange={(e) => setNewEppItem(e.target.value)} />
              </label>
              <div className="grid-2">
                <label>
                  Marca & Modelo
                  <input type="text" placeholder="Ej: Ombú Krypton Talle 42" value={newEppBrand} onChange={(e) => setNewEppBrand(e.target.value)} />
                </label>
                <label>
                  N° Certificado IRAM / Sello
                  <input type="text" placeholder="Ej: IRAM 3610" value={newEppCert} onChange={(e) => setNewEppCert(e.target.value)} />
                </label>
              </div>
              <label>
                Cantidad
                <input type="number" min="1" value={newEppQty} onChange={(e) => setNewEppQty(Number(e.target.value))} />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowAddEppModal(false)} className="btn btn-outline">Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: "#0d9488" }}>Guardar Registro</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
