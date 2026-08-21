// ==========================================================================
// LEAL CONTROL ERP 2.0 - PUBLIC WEBSITE INTERACTIVITY & DEMO INTAKE
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  // 1. Interactive Module Showcase Data & Switcher
  const moduleData = {
    contabilidad: {
      title: "🏛️ Contabilidad Profesional & P&L en Tiempo Real",
      desc: "Llevá la contabilidad formal de tu empresa al nivel de los gigantes de la industria. Motor de asientos automáticos por venta, compra y cobranza, Libro Diario, Libro Mayor, Sumas y Saldos a 8 Columnas y Portal para Estudios Contables.",
      features: [
        "Plan de 77 Cuentas estándar para empresas y cooperativas argentinas",
        "Generación automática de asientos de partida doble (Debe = Haber)",
        "Balance de Sumas y Saldos a 8 Columnas descargable en Excel y PDF",
        "Conciliación Bancaria con Smart Match e imputación de gastos en 1 clic",
        "Portal de Cierres Fiscales con Candado Contable y Libro IVA Digital ARCA"
      ],
      previewHtml: `
        <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
          <div style="padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; font-size: 0.85rem;">📖 Libro Diario de Asientos Contables</span>
            <span class="badge success" style="font-size: 0.75rem;">✓ Asiento #1042 Balanceado</span>
          </div>
          <div style="padding: 14px 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.82rem;">
              <span><strong>Asiento #1042:</strong> Venta Factura A 0004-00018942</span>
              <span style="color: #64748b;">21/08/2026</span>
            </div>
            <table style="width: 100%; font-size: 0.8rem; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid #cbd5e1; color: #64748b; text-align: left;">
                  <th style="padding: 6px 0;">Cuenta</th>
                  <th style="padding: 6px 0; text-align: right;">Debe ($)</th>
                  <th style="padding: 6px 0; text-align: right;">Haber ($)</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 6px 0;"><code>1.1.02.001</code> Deudores por Ventas (San Lorenzo S.A.)</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #2563eb;">$ 1.815.000,00</td>
                  <td style="padding: 6px 0; text-align: right; color: #94a3b8;">-</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 6px 0;"><code>4.1.01</code> Venta de Mercaderías & Insumos</td>
                  <td style="padding: 6px 0; text-align: right; color: #94a3b8;">-</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #059669;">$ 1.500.000,00</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0;"><code>2.1.02.001</code> IVA Débito Fiscal 21%</td>
                  <td style="padding: 6px 0; text-align: right; color: #94a3b8;">-</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #059669;">$ 315.000,00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `
    },
    granos: {
      title: "🌾 Cereales & Granos: Plataforma de Corretaje y Acopio",
      desc: "Gestión especializada para acopios, cooperativas y productores agropecuarios. Liquidación de contratos, fijaciones a pizarra Rosario/MATba, cartas de porte electrónicas (CPE) y control de mermas.",
      features: [
        "Contratos de Compraventa, Consignación y Canje de Granos",
        "Fijaciones parciales con toma automática de cotización de pizarra",
        "Logística de camiones, Balanza y descarga de CPE de ARCA",
        "Liquidación automática de mermas por humedad, zaranda y chamico",
        "Posición de granos en vivo por acopio, silo y exportador"
      ],
      previewHtml: `
        <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
          <div style="padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; font-size: 0.85rem;">📋 Contrato de Soja Disponible Nº 2026-CTR-884</span>
            <span class="badge primary" style="font-size: 0.75rem;">Fijado 75%</span>
          </div>
          <div style="padding: 14px 16px;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; text-align: center;">
              <div style="background: #f8fafc; padding: 8px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="font-size: 0.7rem; color: #64748b;">TOTAL CONTRATADO</div>
                <div style="font-weight: 800; font-size: 1rem; color: #0f172a;">500,00 Tn</div>
              </div>
              <div style="background: #f8fafc; padding: 8px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="font-size: 0.7rem; color: #64748b;">ENTREGADO (CPE)</div>
                <div style="font-weight: 800; font-size: 1rem; color: #10b981;">375,40 Tn</div>
              </div>
              <div style="background: #f8fafc; padding: 8px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="font-size: 0.7rem; color: #64748b;">PIZARRA ROSARIO</div>
                <div style="font-weight: 800; font-size: 1rem; color: #2563eb;">$ 318.500/Tn</div>
              </div>
            </div>
            <div style="font-size: 0.8rem; color: #475569; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 8px;">
              <span><strong>Productor:</strong> Agropecuaria Los Ombúes S.A.</span>
              <span><strong>Destino:</strong> Terminal Puerto San Martín (Cargill)</span>
            </div>
          </div>
        </div>
      `
    },
    flota: {
      title: "🚛 Flota, Vehículos & Logística Integral",
      desc: "Control total de camiones, utilitarios y maquinaria. Monitoreo de consumo de combustible $/km, historial de servicios mecánicos y alertas automáticas de vencimiento de VTV, RTO y seguros.",
      features: [
        "Ficha técnica individual por vehículo, dominio y chofer asignado",
        "Control de odómetro, cargas de combustible y rendimiento L/100km",
        "Plan de mantenimiento preventivo y correctivo con costos asociados",
        "Semáforo de vencimientos legales: VTV, RTO, Pólizas de Seguro, Senasa",
        "Reporte ejecutivo de costo por kilómetro y amortización"
      ],
      previewHtml: `
        <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
          <div style="padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; font-size: 0.85rem;">🚛 Unidad Scania R450 • Dominio AF-892-LC</span>
            <span class="badge success" style="font-size: 0.75rem;">Operativo</span>
          </div>
          <div style="padding: 14px 16px;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px;">
              <div style="font-size: 0.8rem;">
                <span style="color: #64748b; display: block; font-size: 0.72rem;">ODÓMETRO ACTUAL</span>
                <strong>142.850 Km</strong>
              </div>
              <div style="font-size: 0.8rem;">
                <span style="color: #64748b; display: block; font-size: 0.72rem;">CONSUMO PROMEDIO</span>
                <strong style="color: #059669;">32,4 L / 100 Km</strong>
              </div>
              <div style="font-size: 0.8rem;">
                <span style="color: #64748b; display: block; font-size: 0.72rem;">PRÓXIMO SERVICE</span>
                <strong style="color: #2563eb;">en 2.150 Km</strong>
              </div>
            </div>
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 8px 12px; border-radius: 6px; font-size: 0.75rem; color: #065f46;">
              ✓ VTV Vigente hasta 14/11/2026 • Póliza La Segunda al día • Chofer: Carlos Gómez
            </div>
          </div>
        </div>
      `
    },
    finanzas: {
      title: "💳 Finanzas, Tesorería & Cartera de eCheqs",
      desc: "Gestión financiera ágil con conciliación en tiempo real. Manejo integral de cheques físicos y eCheqs (endosos, depósitos, descuento), cajas, bancos y proyección de Cash Flow.",
      features: [
        "Cuentas corrientes unificadas de clientes y proveedores con saldo vivo",
        "Cartera digital de eCheqs y cheques físicos con trazabilidad de endosos",
        "Integración de cobranzas con QR y links de pago MercadoPago PSP",
        "Reporte dinámico de Cash Flow proyectado a 30, 60 y 90 días",
        "Conciliación bancaria automática con cruce inteligente"
      ],
      previewHtml: `
        <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
          <div style="padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; font-size: 0.85rem;">🎫 Cartera de eCheqs & Cheques Físicos</span>
            <span class="badge primary" style="font-size: 0.75rem;">12 eCheqs en Cartera</span>
          </div>
          <div style="padding: 14px 16px;">
            <table style="width: 100%; font-size: 0.8rem; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid #cbd5e1; color: #64748b; text-align: left;">
                  <th style="padding: 6px 0;">Número / Banco</th>
                  <th style="padding: 6px 0;">Vencimiento</th>
                  <th style="padding: 6px 0; text-align: right;">Importe</th>
                  <th style="padding: 6px 0; text-align: center;">Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 6px 0;"><strong>#9948210</strong> Banco Galicia C/C</td>
                  <td style="padding: 6px 0;">28/08/2026</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 700;">$ 850.000,00</td>
                  <td style="padding: 6px 0; text-align: center;"><span class="badge primary" style="font-size: 0.7rem;">En Cartera</span></td>
                </tr>
                <tr>
                  <td style="padding: 6px 0;"><strong>#4401928</strong> Banco Macro</td>
                  <td style="padding: 6px 0;">05/09/2026</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 700;">$ 1.420.000,00</td>
                  <td style="padding: 6px 0; text-align: center;"><span class="badge success" style="font-size: 0.7rem;">Depositado</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `
    },
    ventas: {
      title: "📊 Ventas & Facturación Electrónica ARCA (AFIP)",
      desc: "Facturación electrónica en segundos con homologación web service directa. Emisión de Facturas A, B, C, MiPyME, notas de crédito/débito, presupuestos con envío directo por WhatsApp y remitos.",
      features: [
        "Emisión directa de Facturas A, B, C, E y MiPyME con CAE oficial",
        "Envío directo de presupuestos y facturas por WhatsApp y Email en 1 clic",
        "Generación automática de remitos de entrega y enlace con stock",
        "Listas de precios múltiples, descuentos y comisiones de vendedores",
        "Libro IVA Ventas digital listo para ARCA (AFIP RG 4597)"
      ],
      previewHtml: `
        <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
          <div style="padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; font-size: 0.85rem;">📄 Factura Electrónica A 0004-00018942</span>
            <span class="badge success" style="font-size: 0.75rem;">CAE: 74392019482910</span>
          </div>
          <div style="padding: 14px 16px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 12px;">
              <div>
                <strong>Cliente:</strong> SAN LORENZO CEREALES S.A.<br/>
                <span style="color: #64748b; font-size: 0.75rem;">CUIT: 30-71089423-4 • Resp. Inscripto</span>
              </div>
              <div style="text-align: right;">
                <span style="font-size: 0.75rem; color: #64748b;">TOTAL FACTURADO</span>
                <div style="font-weight: 900; font-size: 1.25rem; color: #2563eb;">$ 1.815.000,00</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn secondary" style="font-size: 0.75rem; padding: 6px 12px;">📲 Compartir WhatsApp</button>
              <button class="btn secondary" style="font-size: 0.75rem; padding: 6px 12px;">📄 Descargar PDF Oficial</button>
            </div>
          </div>
        </div>
      `
    }
  };

  const moduleTabs = document.querySelectorAll(".tab-pill");
  const moduleContainer = document.getElementById("active-module-showcase");

  function renderModule(key) {
    const data = moduleData[key];
    if (!data || !moduleContainer) return;

    moduleContainer.innerHTML = `
      <div class="module-info">
        <span class="badge primary" style="margin-bottom: 12px;">Módulo Destacado 2.0</span>
        <h3>${data.title}</h3>
        <p>${data.desc}</p>
        <ul class="module-features-list">
          ${data.features.map(f => `<li><span class="check">✓</span> <span>${f}</span></li>`).join("")}
        </ul>
        <button class="btn primary btn-open-demo" data-module="${key}">
          Solicitá tu Demo de ${key.toUpperCase()} ➔
        </button>
      </div>
      <div class="module-preview-box">
        ${data.previewHtml}
      </div>
    `;

    // Re-attach click to new demo button
    const demoBtn = moduleContainer.querySelector(".btn-open-demo");
    if (demoBtn) {
      demoBtn.addEventListener("click", () => openDemoModal(key));
    }
  }

  moduleTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      moduleTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const modKey = tab.getAttribute("data-module");
      renderModule(modKey);
    });
  });

  // Render initial module
  renderModule("contabilidad");

  // 2. Demo Modal Management
  const demoModal = document.getElementById("demo-modal");
  const openDemoBtns = document.querySelectorAll(".btn-open-demo, .btn-hero-demo, .btn-nav-demo");
  const closeDemoBtn = document.getElementById("modal-close-btn");
  const demoForm = document.getElementById("demo-request-form");
  const demoSuccess = document.getElementById("demo-success-box");

  function openDemoModal(preselectedModule = "") {
    if (demoModal) {
      demoModal.classList.add("active");
      if (demoSuccess) demoSuccess.style.display = "none";
      if (demoForm) demoForm.style.display = "block";

      if (preselectedModule) {
        const checkbox = document.getElementById(`mod-${preselectedModule}`);
        if (checkbox) checkbox.checked = true;
      }
    }
  }

  function closeDemoModal() {
    if (demoModal) {
      demoModal.classList.remove("active");
    }
  }

  openDemoBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const mod = btn.getAttribute("data-module") || "";
      openDemoModal(mod);
    });
  });

  if (closeDemoBtn) {
    closeDemoBtn.addEventListener("click", closeDemoModal);
  }

  if (demoModal) {
    demoModal.addEventListener("click", (e) => {
      if (e.target === demoModal) closeDemoModal();
    });
  }

  // 3. Form Submission Handling
  if (demoForm) {
    demoForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const submitBtn = demoForm.querySelector("button[type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Enviando solicitud…";
      }

      const companyName = document.getElementById("demo-company")?.value || "";
      const cuit = document.getElementById("demo-cuit")?.value || "";
      const contactName = document.getElementById("demo-name")?.value || "";
      const email = document.getElementById("demo-email")?.value || "";
      const phone = document.getElementById("demo-phone")?.value || "";
      const users = document.getElementById("demo-users")?.value || "1-5";
      const message = document.getElementById("demo-notes")?.value || "";

      // Gather checked modules
      const checkedMods = [];
      document.querySelectorAll("input[name='modules']:checked").forEach(c => checkedMods.push(c.value));

      const payload = {
        companyName,
        cuit,
        contactFullName: contactName,
        email,
        phone,
        estimatedUsers: users,
        interestedModulesJson: JSON.stringify(checkedMods),
        message
      };

      try {
        // Try calling the public API endpoint
        await fetch("/api/v1/public/demo-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.warn("API offline or CORS, proceeding with local UX confirm:", err);
      }

      // WhatsApp direct message fallback generator
      const waText = encodeURIComponent(
        `¡Hola LEAL Control! Solicito una Demo para mi empresa *${companyName}* (CUIT: ${cuit}). Contacto: ${contactName} - Tel: ${phone}. Módulos de interés: ${checkedMods.join(", ")}.`
      );
      const waUrl = `https://wa.me/5493416000000?text=${waText}`;

      const waBtn = document.getElementById("btn-demo-whatsapp");
      if (waBtn) {
        waBtn.setAttribute("href", waUrl);
      }

      if (demoForm) demoForm.style.display = "none";
      if (demoSuccess) demoSuccess.style.display = "block";

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = "Solicitar mi Demo Gratuita";
      }
    });
  }
});
