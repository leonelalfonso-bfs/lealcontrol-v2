import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { provinces, type Employee, type EppDelivery, type EmployeeDocument } from "../api/types";
import { digitsOnly } from "../lib/arContact";

const INGRESO_DOC_TYPES = [
  { id: "CV", label: "📄 CV Actualizado", description: "Currículum Vitae con experiencia laboral y referencias" },
  { id: "DNI", label: "🪪 DNI (Frente y Dorso)", description: "Copia legible del Documento Nacional de Identidad" },
  { id: "CUIL", label: "📑 Constancia de CUIL", description: "Constancia oficial emitida por ANSES / AFIP" },
  { id: "AltaTemprana", label: "🏛️ Alta Temprana AFIP", description: "Constancia de registro en Mi Simplificación AFIP" },
  { id: "Preocupacional", label: "🩺 Examen Preocupacional & ART", description: "Apto médico de ingreso y exámenes periódicos de ley" },
  { id: "CargasFamilia", label: "👨‍👩‍👧 Cargas de Familia (F. 572)", description: "Declaración Jurada deducciones y asignaciones familiares" },
  { id: "DomicilioReal", label: "🏠 DDJJ Domicilio Real", description: "Declaración Jurada actualizada con factura de servicio" },
  { id: "TituloEstudios", label: "🎓 Título o Certificado de Estudios", description: "Título secundario, técnico o universitario autenticado" },
  { id: "DatosBancarios", label: "🏦 Constancia CBU / Cuenta Sueldo", description: "Comprobante de CBU / Alias para acreditación de haberes" },
  { id: "LicenciaConducir", label: "🚗 Licencia de Conducir / Habilitaciones", description: "Registro de conducir y habilitaciones técnicas operativas" }
];

const EGRESO_DOC_TYPES = [
  { id: "ReciboLiquidacionFinal", label: "🧾 Recibo Liquidación Final Firmado", description: "Recibo de haberes finales firmado conforme por el colaborador" },
  { id: "CertificadoArt80", label: "📜 Certificado de Trabajo (Art. 80 LCT)", description: "Certificado de trabajo y constancia de aportes Art. 80" },
  { id: "CertificadoAfip57", label: "📊 Certificado Remuneraciones (AFIP PS 6.2)", description: "Formulario oficial AFIP de servicios y remuneraciones históricas" },
  { id: "TelegramaRenunciaDespido", label: "✉️ Telegrama de Renuncia / Copia CD", description: "Constancia fehaciente de desvinculación laboral" }
];

export function EmployeeFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"general" | "labor" | "banking" | "documents" | "epp">("general");
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
  const [terminationDate, setTerminationDate] = useState("");
  const [contractType, setContractType] = useState<number>(0);
  const [jobTitle, setJobTitle] = useState("Técnico Especialista");
  const [department, setDepartment] = useState("Técnica");
  const [costCenter, setCostCenter] = useState("Operaciones");
  const [workplaceLocation, setWorkplaceLocation] = useState("Planta Central");
  const [unionCct, setUnionCct] = useState("Comercio 130/75");
  const [unionCategory, setUnionCategory] = useState("Administrativo A");
  const [healthInsurance, setHealthInsurance] = useState("OSECAC");
  const [baseSalary, setBaseSalary] = useState<number>(750000);
  const [hourlyRate, setHourlyRate] = useState<number>(0);
  const [status, setStatus] = useState<number>(0);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [bankName, setBankName] = useState("Banco de la Nación Argentina");
  const [cbu, setCbu] = useState("");
  const [bankAlias, setBankAlias] = useState("");

  // Documents State
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

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
      if (emp.terminationDate) setTerminationDate(new Date(emp.terminationDate).toISOString().split("T")[0]);
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

      const [epps, docs] = await Promise.all([
        api.listEmployeeEpps(empId).catch(() => []),
        api.listEmployeeDocuments(empId).catch(() => [])
      ]);
      setEppList(epps);
      setDocuments(docs);
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
        terminationDate: terminationDate ? new Date(terminationDate).toISOString() : null,
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

  // Upload PDF / Document File
  const handleFileUpload = async (docType: string, category: "Ingreso" | "Egreso", e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    try {
      setUploadingDocType(docType);
      setError(null);

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const existing = documents.find((d) => d.documentType === docType);

        if (existing) {
          await api.updateEmployeeDocument(existing.id, {
            ...existing,
            fileName: file.name,
            fileUrl: base64,
            status: "Presentado",
            uploadedAtUtc: new Date().toISOString()
          });
        } else {
          await api.createEmployeeDocument(id, {
            documentType: docType,
            category,
            fileName: file.name,
            fileUrl: base64,
            status: "Presentado",
            uploadedAtUtc: new Date().toISOString()
          });
        }

        const updatedDocs = await api.listEmployeeDocuments(id);
        setDocuments(updatedDocs);
        setUploadingDocType(null);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err?.message || "Error al subir archivo");
      setUploadingDocType(null);
    }
  };

  const handleViewDoc = (doc: EmployeeDocument) => {
    if (!doc.fileUrl) {
      alert("No hay archivo cargado para este documento.");
      return;
    }
    const win = window.open();
    if (win) {
      if (doc.fileUrl.startsWith("data:")) {
        win.document.write(
          `<iframe src="${doc.fileUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
        );
        win.document.title = doc.fileName || doc.documentType;
      } else {
        win.location.href = doc.fileUrl;
      }
    }
  };

  const handleDownloadDoc = (doc: EmployeeDocument) => {
    if (!doc.fileUrl) {
      alert("No hay archivo para descargar.");
      return;
    }
    const a = document.createElement("a");
    a.href = doc.fileUrl;
    a.download = doc.fileName || `${doc.documentType}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDeleteDoc = async (doc: EmployeeDocument) => {
    if (!window.confirm(`¿Quitar el archivo adjunto de "${doc.fileName || doc.documentType}"?`)) return;
    try {
      if (id) {
        await api.updateEmployeeDocument(doc.id, {
          ...doc,
          fileUrl: null,
          fileName: "",
          status: "Pendiente"
        });
        const updatedDocs = await api.listEmployeeDocuments(id);
        setDocuments(updatedDocs);
      }
    } catch (err: any) {
      setError(err?.message || "Error al quitar archivo.");
    }
  };

  const handleAddEpp = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !newEppItem.trim()) return;

    try {
      await api.createEppDelivery({
        employeeId: id,
        itemName: newEppItem.trim(),
        brandModel: newEppBrand.trim() || undefined,
        certificateNumber: newEppCert.trim() || undefined,
        quantity: Number(newEppQty) || 1,
        deliveryDateUtc: new Date().toISOString()
      });
      setShowAddEppModal(false);
      setNewEppItem("");
      setNewEppBrand("");
      setNewEppCert("");
      setNewEppQty(1);
      const epps = await api.listEmployeeEpps(id);
      setEppList(epps);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al entregar EPP");
    }
  };

  if (loading) {
    return (
      <div className="page-wide" style={{ padding: 40, textAlign: "center" }}>
        <p className="muted">Cargando ficha del colaborador...</p>
      </div>
    );
  }

  const docMap = new Map(documents.map((d) => [d.documentType, d]));
  const ingresoPresented = INGRESO_DOC_TYPES.filter((d) => {
    const doc = docMap.get(d.id);
    return doc?.status === "Presentado" || Boolean(doc?.fileUrl);
  }).length;
  const egresoPresented = EGRESO_DOC_TYPES.filter((d) => {
    const doc = docMap.get(d.id);
    return doc?.status === "Presentado" || Boolean(doc?.fileUrl);
  }).length;

  return (
    <div className="page-wide stack" style={{ gap: 20, paddingBottom: 60 }}>
      {/* Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#64748b", marginBottom: 6 }}>
            <Link to="/rrhh" style={{ color: "#64748b", textDecoration: "none" }}>
              RRHH
            </Link>
            <span>›</span>
            <Link to="/rrhh/empleados" style={{ color: "#64748b", textDecoration: "none" }}>
              Colaboradores
            </Link>
            <span>›</span>
            <span style={{ color: "#0f172a", fontWeight: 600 }}>{isEditing ? `${lastName}, ${firstName}` : "Nuevo Colaborador"}</span>
          </div>
          <h1 style={{ margin: 0 }}>{isEditing ? `👤 ${lastName}, ${firstName} (${fileNumber})` : "👤 Nuevo Colaborador"}</h1>
          <p className="muted" style={{ margin: "4px 0 0 0" }}>
            Ficha laboral completa, legajo digital con adjuntos PDF, datos previsionales y asignación de EPP
          </p>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate("/rrhh/empleados")}>
            ← Volver a Colaboradores
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleSaveEmployee}
            disabled={saving}
            style={{ background: "linear-gradient(135deg, #ec4899, #db2777)", color: "#fff", fontWeight: 700 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Colaborador"}
          </button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {/* Tabs */}
      <div className="tab-row">
        <button
          type="button"
          className={`tab-btn ${activeTab === "general" ? "active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          👤 1. Datos Personales
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "labor" ? "active" : ""}`}
          onClick={() => setActiveTab("labor")}
        >
          💼 2. Contrato & Convenio
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "banking" ? "active" : ""}`}
          onClick={() => setActiveTab("banking")}
        >
          🏦 3. Datos Bancarios
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "documents" ? "active" : ""}`}
          onClick={() => setActiveTab("documents")}
        >
          📂 4. Legajo Digital ({ingresoPresented}/{INGRESO_DOC_TYPES.length} PDF)
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "epp" ? "active" : ""}`}
          onClick={() => setActiveTab("epp")}
        >
          🛡️ 5. Entrega de EPP ({eppList.length})
        </button>
      </div>

      {/* TAB 1: DATOS PERSONALES */}
      {activeTab === "general" && (
        <div className="card pad stack" style={{ gap: 20, borderLeft: "5px solid #ec4899" }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>👤 Identificación & Datos de Contacto</h2>

          <div className="row" style={{ gap: 24, alignItems: "center" }}>
            <div style={{ width: 100, height: 100, borderRadius: "50%", background: "var(--surface-sunken)", border: "2px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
              {photoPath ? (
                <img src={photoPath} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: "2rem" }}>👤</span>
              )}
            </div>
            <div>
              <label className="btn btn-outline compact" style={{ cursor: "pointer" }}>
                📷 Subir Foto de Perfil
                <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
              </label>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>Formatos PNG, JPG hasta 2MB</div>
            </div>
          </div>

          <div className="grid-3">
            <label>
              Legajo N° *
              <input required value={fileNumber} onChange={(e) => setFileNumber(e.target.value)} />
            </label>
            <label>
              Nombre(s) *
              <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label>
              Apellido(s) *
              <input required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
          </div>

          <div className="grid-3">
            <label>
              DNI / Documento *
              <input required value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
            </label>
            <label>
              CUIL * (11 dígitos)
              <input required value={cuil} onChange={(e) => setCuil(e.target.value)} placeholder="20-12345678-9" />
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
              Nacionalidad
              <input value={nationality} onChange={(e) => setNationality(e.target.value)} />
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
          </div>

          <div className="grid-3">
            <label>
              Domicilio Real (Calle y N°)
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ej: San Martín 1234" />
            </label>
            <label>
              Ciudad
              <input value={city} onChange={(e) => setCity(e.target.value)} />
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
          </div>

          <div className="grid-2">
            <label>
              Teléfono / WhatsApp
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 9 341 555-1234" />
            </label>
            <label>
              Email Personal / Corporativo
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="empleado@lealcontrol.com" />
            </label>
          </div>

          <div className="grid-2">
            <label>
              Contacto de Emergencia (Nombre)
              <input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Ej: María Gómez (Cónyuge)" />
            </label>
            <label>
              Teléfono de Emergencia
              <input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder="+54 9 341 555-9876" />
            </label>
          </div>
        </div>
      )}

      {/* TAB 2: CONTRATO & CONVENIO */}
      {activeTab === "labor" && (
        <div className="card pad stack" style={{ gap: 20, borderLeft: "5px solid #3b82f6" }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>💼 Relación Laboral & Previsional</h2>

          <div className="grid-3">
            <label>
              Fecha de Ingreso *
              <input type="date" required value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            </label>
            <label>
              Reconocimiento de Antigüedad
              <input type="date" value={seniorityRecognitionDate} onChange={(e) => setSeniorityRecognitionDate(e.target.value)} />
            </label>
            <label>
              Fecha de Egreso / Baja
              <input type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} />
            </label>
          </div>

          <div className="grid-3">
            <label>
              Tipo de Contrato *
              <select value={contractType} onChange={(e) => setContractType(Number(e.target.value))}>
                <option value={0}>Tiempo Indeterminado</option>
                <option value={1}>Plazo Fijo</option>
                <option value={2}>Eventual</option>
                <option value={3}>Período de Prueba</option>
                <option value={4}>Pasantía</option>
              </select>
            </label>
            <label>
              Puesto / Cargo *
              <input required value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </label>
            <label>
              Departamento / Área *
              <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="Dirección & Gerencia">Dirección & Gerencia</option>
                <option value="Metrología & Calidad">Metrología & Calidad</option>
                <option value="Taller & Laboratorio">Taller & Laboratorio</option>
                <option value="Ventas & CRM">Ventas & CRM</option>
                <option value="Logística & Flota">Logística & Flota</option>
                <option value="Administración & Finanzas">Administración & Finanzas</option>
              </select>
            </label>
          </div>

          <div className="grid-3">
            <label>
              Convenio Colectivo (CCT)
              <input value={unionCct} onChange={(e) => setUnionCct(e.target.value)} placeholder="Comercio 130/75, UOM, etc." />
            </label>
            <label>
              Categoría Profesional
              <input value={unionCategory} onChange={(e) => setUnionCategory(e.target.value)} placeholder="Administrativo A, Técnico Principal" />
            </label>
            <label>
              Obra Social
              <input value={healthInsurance} onChange={(e) => setHealthInsurance(e.target.value)} placeholder="OSECAC, OSDE, Swiss Medical" />
            </label>
          </div>

          <div className="grid-3">
            <label>
              Sueldo Básico Mensual ($ ARS) *
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={baseSalary}
                onChange={(e) => setBaseSalary(Number(e.target.value))}
              />
            </label>
            <label>
              Valor Hora ($ ARS)
              <input
                type="number"
                step="0.01"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
              />
            </label>
            <label>
              Estado Laboral *
              <select value={status} onChange={(e) => setStatus(Number(e.target.value))}>
                <option value={0}>✓ Activo</option>
                <option value={1}>Licencia / Suspensión</option>
                <option value={2}>Egresado / Baja</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {/* TAB 3: DATOS BANCARIOS */}
      {activeTab === "banking" && (
        <div className="card pad stack" style={{ gap: 20, borderLeft: "5px solid #10b981" }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>🏦 Acreditación de Haberes (CBU / Cuenta Sueldo)</h2>

          <div className="grid-3">
            <label>
              Banco Emisor
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Banco Nación, Banco Galicia, etc." />
            </label>
            <label>
              CBU (22 dígitos numéricos)
              <input value={cbu} onChange={(e) => setCbu(e.target.value)} placeholder="0110000000000000000000" maxLength={22} />
            </label>
            <label>
              Alias Bancario
              <input value={bankAlias} onChange={(e) => setBankAlias(e.target.value)} placeholder="LEAL.EMPLEADO.SUELDO" />
            </label>
          </div>
        </div>
      )}

      {/* TAB 4: LEGAJO DIGITAL & DOCUMENTACIÓN (SUBIDA, VISTA Y DESCARGA DE PDF) */}
      {activeTab === "documents" && (
        <div className="stack" style={{ gap: 20 }}>
          {!isEditing && (
            <div className="alert" style={{ background: "rgba(236, 72, 153, 0.1)", borderColor: "#ec4899", color: "#9d174d" }}>
              💡 Guardá primero los datos principales del colaborador para habilitar la subida directa de archivos PDF al legajo digital.
            </div>
          )}

          {/* Documentación Activa & Ingreso */}
          <div className="card pad stack" style={{ gap: 16, borderLeft: "5px solid #8b5cf6" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "1.15rem", margin: 0 }}>📂 Documentación Activa & de Ingreso</h2>
                <p className="muted" style={{ margin: "4px 0 0 0", fontSize: "0.85rem" }}>
                  Checklist obligatorio de legajo digital con adjuntos PDF conforme normativas laborales y de ART
                </p>
              </div>
              <span className="badge ok" style={{ fontSize: "0.85rem", padding: "6px 12px" }}>
                Cumplimiento: {ingresoPresented} / {INGRESO_DOC_TYPES.length} ({Math.round((ingresoPresented / INGRESO_DOC_TYPES.length) * 100)}%)
              </span>
            </div>

            <div className="table-wrap">
              <table className="table" style={{ width: "100%", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ background: "var(--surface-sunken)" }}>
                    <th style={{ width: 240 }}>Documento Requerido</th>
                    <th>Detalle & Archivo Adjunto</th>
                    <th style={{ width: 110, textAlign: "center" }}>Estado</th>
                    <th style={{ width: 230, textAlign: "right" }}>Gestión Documental</th>
                  </tr>
                </thead>
                <tbody>
                  {INGRESO_DOC_TYPES.map((doc) => {
                    const existing = docMap.get(doc.id);
                    const hasFile = Boolean(existing?.fileUrl);
                    const isPresented = existing?.status === "Presentado" || hasFile;
                    const isUploading = uploadingDocType === doc.id;

                    return (
                      <tr key={doc.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td>
                          <strong>{doc.label}</strong>
                          <div className="muted" style={{ fontSize: "0.75rem", marginTop: 2 }}>{doc.description}</div>
                        </td>
                        <td>
                          {hasFile ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: "1rem" }}>📑</span>
                              <div>
                                <strong style={{ color: "#0f172a", fontSize: "0.82rem", display: "block" }}>
                                  {existing?.fileName || `${doc.id}.pdf`}
                                </strong>
                                <span className="muted" style={{ fontSize: "0.72rem" }}>
                                  Subido: {existing?.uploadedAtUtc ? new Date(existing.uploadedAtUtc).toLocaleDateString("es-AR") : "Reciente"}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: "0.8rem", fontStyle: "italic" }}>
                              Sin archivo PDF adjunto
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`badge ${isPresented ? "ok" : "error"}`} style={{ fontSize: "0.72rem" }}>
                            {isPresented ? "✓ Presentado" : "Pendiente"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                            {hasFile && existing && (
                              <>
                                <button
                                  type="button"
                                  className="btn ghost compact"
                                  title="Ver documento en nueva pestaña"
                                  style={{ padding: "4px 8px", fontSize: "0.75rem", color: "#8b5cf6" }}
                                  onClick={() => handleViewDoc(existing)}
                                >
                                  👁️ Ver
                                </button>
                                <button
                                  type="button"
                                  className="btn ghost compact"
                                  title="Descargar archivo PDF"
                                  style={{ padding: "4px 8px", fontSize: "0.75rem", color: "#0d9488" }}
                                  onClick={() => handleDownloadDoc(existing)}
                                >
                                  ⬇️ Descargar
                                </button>
                              </>
                            )}

                            {isEditing ? (
                              <label
                                className={`btn compact ${hasFile ? "btn-outline" : ""}`}
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "4px 10px",
                                  cursor: "pointer",
                                  background: hasFile ? undefined : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                                  color: hasFile ? undefined : "#fff"
                                }}
                              >
                                {isUploading ? "Subiendo..." : hasFile ? "🔄 Reemplazar" : "📤 Subir PDF"}
                                <input
                                  type="file"
                                  accept=".pdf,image/*,.doc,.docx"
                                  style={{ display: "none" }}
                                  disabled={isUploading}
                                  onChange={(e) => handleFileUpload(doc.id, "Ingreso", e)}
                                />
                              </label>
                            ) : null}

                            {hasFile && existing && (
                              <button
                                type="button"
                                className="btn ghost compact"
                                title="Quitar archivo"
                                style={{ padding: "4px 6px", fontSize: "0.75rem", color: "#ef4444" }}
                                onClick={() => handleDeleteDoc(existing)}
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Subcategoría: Documentación de Egreso */}
          <div className="card pad stack" style={{ gap: 16, borderLeft: "5px solid #ef4444", background: status === 2 ? "#fff" : "rgba(241, 245, 249, 0.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "1.15rem", margin: 0, color: "#991b1b" }}>🧾 Subcategoría: Documentación de Egreso / Desvinculación</h2>
                <p className="muted" style={{ margin: "4px 0 0 0", fontSize: "0.85rem" }}>
                  Comprobantes finales firmados, certificados de trabajo (Art. 80 LCT) y constancias de baja
                </p>
              </div>
              <span className="badge primary" style={{ fontSize: "0.85rem", padding: "6px 12px" }}>
                {egresoPresented} / {EGRESO_DOC_TYPES.length} PDF Adjuntos
              </span>
            </div>

            <div className="table-wrap">
              <table className="table" style={{ width: "100%", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ background: "var(--surface-sunken)" }}>
                    <th style={{ width: 260 }}>Documento de Desvinculación</th>
                    <th>Detalle Legal & Archivo</th>
                    <th style={{ width: 110, textAlign: "center" }}>Estado</th>
                    <th style={{ width: 230, textAlign: "right" }}>Gestión Documental</th>
                  </tr>
                </thead>
                <tbody>
                  {EGRESO_DOC_TYPES.map((doc) => {
                    const existing = docMap.get(doc.id);
                    const hasFile = Boolean(existing?.fileUrl);
                    const isPresented = existing?.status === "Presentado" || hasFile;
                    const isUploading = uploadingDocType === doc.id;

                    return (
                      <tr key={doc.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td>
                          <strong style={{ color: "#991b1b" }}>{doc.label}</strong>
                          <div className="muted" style={{ fontSize: "0.75rem", marginTop: 2 }}>{doc.description}</div>
                        </td>
                        <td>
                          {hasFile ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: "1rem" }}>📑</span>
                              <div>
                                <strong style={{ color: "#0f172a", fontSize: "0.82rem", display: "block" }}>
                                  {existing?.fileName || `${doc.id}.pdf`}
                                </strong>
                                <span className="muted" style={{ fontSize: "0.72rem" }}>
                                  Subido: {existing?.uploadedAtUtc ? new Date(existing.uploadedAtUtc).toLocaleDateString("es-AR") : "Reciente"}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: "0.8rem", fontStyle: "italic" }}>
                              Sin archivo PDF adjunto
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`badge ${isPresented ? "ok" : "ghost"}`} style={{ fontSize: "0.72rem" }}>
                            {isPresented ? "✓ Completado" : "Pendiente"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                            {hasFile && existing && (
                              <>
                                <button
                                  type="button"
                                  className="btn ghost compact"
                                  title="Ver documento en nueva pestaña"
                                  style={{ padding: "4px 8px", fontSize: "0.75rem", color: "#8b5cf6" }}
                                  onClick={() => handleViewDoc(existing)}
                                >
                                  👁️ Ver
                                </button>
                                <button
                                  type="button"
                                  className="btn ghost compact"
                                  title="Descargar archivo PDF"
                                  style={{ padding: "4px 8px", fontSize: "0.75rem", color: "#0d9488" }}
                                  onClick={() => handleDownloadDoc(existing)}
                                >
                                  ⬇️ Descargar
                                </button>
                              </>
                            )}

                            {isEditing ? (
                              <label
                                className={`btn compact ${hasFile ? "btn-outline" : ""}`}
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "4px 10px",
                                  cursor: "pointer",
                                  background: hasFile ? undefined : "linear-gradient(135deg, #ef4444, #dc2626)",
                                  color: hasFile ? undefined : "#fff"
                                }}
                              >
                                {isUploading ? "Subiendo..." : hasFile ? "🔄 Reemplazar" : "📤 Subir PDF"}
                                <input
                                  type="file"
                                  accept=".pdf,image/*,.doc,.docx"
                                  style={{ display: "none" }}
                                  disabled={isUploading}
                                  onChange={(e) => handleFileUpload(doc.id, "Egreso", e)}
                                />
                              </label>
                            ) : null}

                            {hasFile && existing && (
                              <button
                                type="button"
                                className="btn ghost compact"
                                title="Quitar archivo"
                                style={{ padding: "4px 6px", fontSize: "0.75rem", color: "#ef4444" }}
                                onClick={() => handleDeleteDoc(existing)}
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: EPP */}
      {activeTab === "epp" && (
        <div className="card pad stack" style={{ gap: 20, borderLeft: "5px solid #0d9488" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: "1.15rem", margin: 0 }}>🛡️ Elementos de Protección Personal (EPP)</h2>
              <p className="muted" style={{ margin: "4px 0 0 0", fontSize: "0.85rem" }}>
                Historial de indumentaria y elementos de seguridad entregados bajo firma
              </p>
            </div>
            {isEditing && (
              <button type="button" className="btn" onClick={() => setShowAddEppModal(true)} style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
                + Registrar Entrega de EPP
              </button>
            )}
          </div>

          <div className="table-wrap">
            <table className="table" style={{ width: "100%", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "var(--surface-sunken)" }}>
                  <th>Elemento / Indumentaria</th>
                  <th>Marca / Modelo</th>
                  <th>Certificado IRAM / Sello</th>
                  <th style={{ width: 80, textAlign: "center" }}>Cantidad</th>
                  <th style={{ width: 140, textAlign: "center" }}>Fecha Entrega</th>
                </tr>
              </thead>
              <tbody>
                {eppList.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 24 }} className="muted">
                      No hay registros de entrega de EPP para este colaborador.
                    </td>
                  </tr>
                ) : (
                  eppList.map((epp) => (
                    <tr key={epp.id}>
                      <td><strong>{epp.itemName}</strong></td>
                      <td>{epp.brandModel || "—"}</td>
                      <td>{epp.certificateNumber || "—"}</td>
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{epp.quantity}</td>
                      <td style={{ textAlign: "center" }} className="muted">
                        {new Date(epp.deliveryDateUtc).toLocaleDateString("es-AR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Agregar Entrega de EPP */}
      {showAddEppModal && (
        <div className="modal-backdrop" onClick={() => setShowAddEppModal(false)}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <span className="eyebrow">SEGURIDAD & HIGIENE</span>
                <h2>🛡️ Registrar Entrega de EPP</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowAddEppModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleAddEpp} className="stack" style={{ gap: 14, marginTop: 12 }}>
              <label>
                Elemento / Equipo de Seguridad *
                <input required value={newEppItem} onChange={(e) => setNewEppItem(e.target.value)} placeholder="Ej: Calzado de seguridad con puntera de acero" />
              </label>

              <div className="grid-2">
                <label>
                  Marca / Modelo
                  <input value={newEppBrand} onChange={(e) => setNewEppBrand(e.target.value)} placeholder="Ej: Funcional Trekking" />
                </label>
                <label>
                  N° Certificado IRAM / Sello
                  <input value={newEppCert} onChange={(e) => setNewEppCert(e.target.value)} placeholder="Ej: IRAM 3610 / Sello S" />
                </label>
              </div>

              <label>
                Cantidad *
                <input type="number" min="1" step="1" required value={newEppQty} onChange={(e) => setNewEppQty(Number(e.target.value))} />
              </label>

              <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAddEppModal(false)}>
                  Cancelar
                </button>
                <button className="btn">Guardar Registro</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
