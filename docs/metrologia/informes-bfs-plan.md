# Informes de calibración BFS en Lealcontrol (plan, 29/10/2026)

Origen: paquete "Informes BFS" del dueño (OneDrive, Servicio Técnico), con generadores Node/docx para camioneras,
plantas de hormigón y pesómetros, y los criterios técnicos verificados contra la Res. 2307/80, la Res. SIC 25/2025 y
EURAMET cg-18. Los datos reales de clientes del paquete no se suben al repositorio.

**Decisiones del dueño:**
- La salida es un PDF desde el sistema, con el estilo del paquete, y no se edita a mano: si hay un error, se corrigen los datos y se reemite.
- Se empieza por camioneras.
- Los datos se cargan en campo, desde la tablet, y se revisan en la oficina.
- Se habla de **informe** de calibración, no de "certificado".

**Etapas de camioneras:**
1. **Cálculo en el servidor** (hecho): `TruckScaleEvaluator`, portado de `camionera.js`. Calcula:
   - el E.M.T. en servicio por tramos y la capacidad mínima por norma;
   - los requisitos de cada norma: "No ensayado" si falta el dato y "No aplica" para la movilidad digital con la 25/2025;
   - la sustitución (3.7.3) y la excentricidad por apoyos o por tercios;
   - la conclusión, siempre calculada;
   - los avisos: patrón vencido, masa de patrones insuficiente, escalones que no suman y lecturas incoherentes.

   Endpoint: `POST /api/v1/metrology/truck-scale/evaluate`.
2. **Carga:** el informe de camionera queda guardado en el informe de calibración existente, como un tipo nuevo. Así se conservan la numeración, la reemisión y los vínculos con Calidad (PG12, PG16 y PG17). Además:
   - los datos del instrumento salen del equipo del cliente y los patrones del maestro de pesas, con los vencidos bloqueados;
   - la pantalla sirve para el celular en campo, con el cálculo en vivo;
   - la numeración es única por servicio e instrumento.
3. **Impresión:** el PDF con el formato aprobado:
   - encabezado con logo, empresa y recuadro del número;
   - franja con las fechas y el resultado;
   - secciones numeradas;
   - croquis de excentricidad;
   - conclusión en recuadro y firma;
   - marca de agua;
   - anexo con el procedimiento y las referencias.

   El logo, la firma y la marca de agua se suben en la configuración de la empresa: no se versionan.

**Después:** las plantas de hormigón (boca con 4 instrumentos, CIRSOC 201, agua informativa) y los pesómetros (BW500, anexo de fotos), sobre el mismo esquema.
