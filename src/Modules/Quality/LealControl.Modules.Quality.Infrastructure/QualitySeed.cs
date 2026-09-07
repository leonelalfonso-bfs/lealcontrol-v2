using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Quality.Infrastructure;

public static class QualitySeed
{
    public static async Task EnsureCatalogAsync(QualityDbContext db, TenantId tenantId, CancellationToken ct = default)
    {
        var existing = await db.Documents.AsNoTracking()
            .AnyAsync(d => d.TenantId == tenantId && d.Code == "MC01", ct);
        if (existing)
        {
            return;
        }

        var docs = new List<QualityDocument>();
        var versions = new List<QualityDocumentVersion>();

        void AddDoc(
            string code,
            string displayCode,
            string type,
            string title,
            Guid? parentId,
            int sortOrder,
            string? recordKind = null,
            string? linkedModule = null,
            string status = QualityDocumentStatuses.Current,
            int reviewMonths = 24,
            string clauses = "",
            string? externalSource = null,
            string? externalUrl = null)
        {
            var id = Guid.NewGuid();
            var versionId = Guid.NewGuid();
            docs.Add(new QualityDocument(id)
            {
                TenantId = tenantId,
                Code = code,
                DisplayCode = displayCode,
                Type = type,
                Title = title,
                ParentId = parentId,
                SortOrder = sortOrder,
                Status = status,
                CurrentVersionId = versionId,
                ReviewPeriodMonths = reviewMonths,
                NextReviewDate = DateTime.UtcNow.AddMonths(reviewMonths),
                Iso17025Clauses = clauses,
                RecordKind = recordKind,
                LinkedModule = linkedModule,
                ExternalSource = externalSource,
                ExternalUrl = externalUrl,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            });

            versions.Add(new QualityDocumentVersion(versionId)
            {
                TenantId = tenantId,
                DocumentId = id,
                Version = 1,
                Status = status == QualityDocumentStatuses.Draft ? QualityDocumentStatuses.Draft : QualityDocumentStatuses.Current,
                ChangeSummary = "Origen — carga inicial SGC INMELA",
                ElaboratedBy = "Laura Delissi",
                ElaboratedAt = new DateTime(2026, 7, 10, 0, 0, 0, DateTimeKind.Utc),
                ReviewedBy = "Leonel Alfonso",
                ReviewedAt = new DateTime(2026, 7, 10, 0, 0, 0, DateTimeKind.Utc),
                ApprovedBy = "Javier Coppini",
                ApprovedAt = new DateTime(2026, 7, 10, 0, 0, 0, DateTimeKind.Utc),
                EffectiveFrom = new DateTime(2026, 7, 10, 0, 0, 0, DateTimeKind.Utc),
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        Guid IdOf(string code) => docs.First(d => d.Code == code).Id;

        // Manual
        AddDoc("MC01", "MC01", QualityDocumentTypes.Manual, "Manual de calidad", null, 1, clauses: "4.1,4.2,5,8.1,8.2");
        AddDoc("MC01-R01", "MC01 R1", QualityDocumentTypes.RecordTemplate, "Compromiso de confidencialidad e imparcialidad interno",
            null, 2, QualityRecordKinds.Attachment, clauses: "4.1,4.2");
        AddDoc("MC01-R02", "MC01 R2", QualityDocumentTypes.RecordTemplate, "Compromiso de confidencialidad e imparcialidad externo",
            null, 3, QualityRecordKinds.Attachment, clauses: "4.1,4.2");
        AddDoc("MC01-R03", "MC01-R03", QualityDocumentTypes.RecordTemplate, "Seguimiento de objetivos e indicadores",
            null, 4, QualityRecordKinds.Structured, clauses: "8.2");
        AddDoc("MC01-R05", "MC01 R05", QualityDocumentTypes.RecordTemplate, "Nota institucional",
            null, 5, QualityRecordKinds.Attachment, status: QualityDocumentStatuses.Draft);

        // Fix parents for MC records
        var mc01Id = IdOf("MC01");
        foreach (var code in new[] { "MC01-R01", "MC01-R02", "MC01-R03", "MC01-R05" })
        {
            docs.First(d => d.Code == code).ParentId = mc01Id;
        }

        var procedures = new (string Code, string Title, string Clauses)[]
        {
            ("PG01", "Gestión de documentos", "8.3"),
            ("PG02", "Control de registros", "7.5,8.4"),
            ("PG03", "Gestión de quejas", "7.9"),
            ("PG04", "Auditorías internas", "8.8"),
            ("PG05", "Compras", "6.6"),
            ("PG06", "Gestión de personal", "6.2"),
            ("PG07", "Gestión de No Conformidades, riesgos y oportunidades de mejora", "7.10,8.5,8.6,8.7"),
            ("PG08", "Revisión por la dirección", "8.9"),
            ("PG09", "Informes de Ensayo", "7.8"),
            ("PG10", "Evaluación de la Incertidumbre", "7.6"),
            ("PG11", "Validación del método de ensayo", "7.2"),
            ("PG12", "Ensayos para la verificación de Instrumentos de Pesar", "7.2"),
            ("PG13", "Manipulación del ítem de ensayo", "7.4"),
            ("PG14", "Equipamiento", "6.4"),
            ("PG15", "Aseguramiento de la validez de los resultados", "7.7"),
            ("PG16", "Instalaciones y condiciones ambientales", "6.3"),
            ("PG17", "Trazabilidad Metrológica", "6.5"),
        };

        var order = 10;
        foreach (var (code, title, clauses) in procedures)
        {
            var status = code is "PG05" or "PG09" ? QualityDocumentStatuses.Draft : QualityDocumentStatuses.Current;
            AddDoc(code, code.Insert(2, " "), QualityDocumentTypes.Procedure, title, null, order++, status: status, clauses: clauses);
        }

        void AddRecord(string parentCode, string code, string display, string title, string kind, string? linked = null, string status = QualityDocumentStatuses.Current)
        {
            AddDoc(code, display, QualityDocumentTypes.RecordTemplate, title, IdOf(parentCode), order++, kind, linked, status);
        }

        AddRecord("PG01", "PG01-R01", "PG01-R01", "Lista de documentos", QualityRecordKinds.Generated);
        AddRecord("PG01", "PG01-R02", "PG01-R02", "Lista de documentos externos", QualityRecordKinds.Generated);
        AddRecord("PG03", "PG03-R01", "PG03-R01", "Seguimiento de quejas", QualityRecordKinds.Structured);
        AddRecord("PG04", "PG04-R01", "PG04-R01", "Programa de auditorías", QualityRecordKinds.Attachment);
        AddRecord("PG04", "PG04-R02", "PG04-R02", "Plan de auditoría", QualityRecordKinds.Attachment);
        AddRecord("PG04", "PG04-R03", "PG04-R03", "Informe de auditoría", QualityRecordKinds.Attachment);
        AddRecord("PG04", "PG04-R04", "PG04-R04", "Lista de verificación ISO/IEC 17025", QualityRecordKinds.Attachment);
        AddRecord("PG05", "PG05-R01", "PG05-R01", "Evaluación inicial de proveedores", QualityRecordKinds.Structured, status: QualityDocumentStatuses.Draft);
        AddRecord("PG05", "PG05-R02", "PG05-R02", "Listado de proveedores habilitados", QualityRecordKinds.Structured, status: QualityDocumentStatuses.Draft);
        AddRecord("PG05", "PG05-R03", "PG05-R03", "Evaluación del desempeño de proveedores", QualityRecordKinds.Structured, status: QualityDocumentStatuses.Draft);
        AddRecord("PG06", "PG06-R01", "PG06-R01", "Programa de capacitaciones", QualityRecordKinds.Structured);
        AddRecord("PG06", "PG06-R02", "PG06-R02", "Entrenamiento y autorización del personal", QualityRecordKinds.Structured);
        AddRecord("PG06", "PG06-R03", "PG06-R03", "Seguimiento de las competencias técnicas y personales", QualityRecordKinds.Structured);
        AddRecord("PG06", "PG06-R04", "PG06-R04", "Asignación de funciones y reemplazos", QualityRecordKinds.Structured);
        AddRecord("PG07", "PG07-R01", "PG07-R1", "Registro y seguimiento de NC, R y OP", QualityRecordKinds.Structured);
        AddRecord("PG08", "PG08-R01", "PG08-R01", "Informe de revisión por la dirección", QualityRecordKinds.Attachment);
        AddRecord("PG09", "PG09-R01", "PG09 R1", "Informe de Ensayos", QualityRecordKinds.Linked, "metrology", QualityDocumentStatuses.Draft);
        AddRecord("PG09", "PG09-R02", "PG09 R2", "Modificación al Informe de Ensayos", QualityRecordKinds.Linked, "metrology", QualityDocumentStatuses.Draft);
        AddRecord("PG09", "PG09-R03", "PG09 R3", "Encuesta de satisfacción", QualityRecordKinds.Structured, status: QualityDocumentStatuses.Draft);
        AddRecord("PG11", "PG11-R01", "PG11 R1", "Informe de validación del método", QualityRecordKinds.Attachment);
        AddRecord("PG14", "PG14-R01", "PG14-R1", "Hoja de vida del equipo", QualityRecordKinds.Structured);
        AddRecord("PG14", "PG14-R02", "PG14-R2", "Etiqueta de equipo calibrado", QualityRecordKinds.Attachment);
        AddRecord("PG14", "PG14-R03", "PG14-R3", "Programa de calibraciones", QualityRecordKinds.Generated, "metrology");
        AddRecord("PG14", "PG14-R04", "PG14-R4", "Listado de equipos", QualityRecordKinds.Generated, "metrology");
        AddRecord("PG14", "PG14-R05", "PG14-R5", "Verificación intermedia", QualityRecordKinds.Structured);
        AddRecord("PG14", "PG14-R06", "PG14-R6", "Programa de mantenimiento preventivo", QualityRecordKinds.Structured);

        var instructions = new (string Code, string Title)[]
        {
            ("IT01", "Balanzas de Alta Capacidad Cargas Rodantes"),
            ("IT02", "Balanzas de Media Capacidad"),
            ("IT03", "Balanzas de Baja Capacidad y de Venta al Público"),
            ("IT04", "Balanzas tipo tolva"),
            ("IT07", "Validación de planillas de cálculos"),
        };

        foreach (var (code, title) in instructions)
        {
            var status = code == "IT07" ? QualityDocumentStatuses.Current : QualityDocumentStatuses.Draft;
            AddDoc(code, code.Insert(2, " "), QualityDocumentTypes.Instruction, title, null, order++, status: status, clauses: "7.2");
            if (code != "IT07")
            {
                var parent = IdOf(code);
                AddDoc($"{code}-R01", $"{code.Insert(2, " ")} R1", QualityDocumentTypes.RecordTemplate, "Identificación",
                    parent, order++, QualityRecordKinds.Linked, "metrology", status);
                AddDoc($"{code}-R02", $"{code.Insert(2, " ")} R2", QualityDocumentTypes.RecordTemplate, "Ensayos",
                    parent, order++, QualityRecordKinds.Linked, "metrology", status);
                AddDoc($"{code}-R03", $"{code.Insert(2, " ")} R3", QualityDocumentTypes.RecordTemplate, "Precintos",
                    parent, order++, QualityRecordKinds.Linked, "metrology", status);
            }
        }

        // Externals (review anual)
        var externals = new (string Code, string Title, string Source)[]
        {
            ("EXT-ISO17025", "IRAM-ISO/IEC 17025:2017", "IRAM / ISO"),
            ("EXT-LEY19511", "Ley Nº 19511 — Metrología", "Argentina"),
            ("EXT-DEC960", "Decreto Nº 960/2017", "Argentina"),
            ("EXT-RES2307", "Resolución Nº 2307/1980 — Balanzas", "Argentina"),
            ("EXT-RES25", "Resolución Nº 25/2025 — Instrumentos de Pesar", "Argentina"),
            ("EXT-RES456", "Resolución Nº 456/1983 — Pesas", "Argentina"),
            ("EXT-RES276", "Resolución Nº 276/2024 — OAA", "Argentina"),
            ("EXT-RES67", "Resolución Nº 67/2025 — Operaciones de control metrológico", "Argentina"),
            ("EXT-OIMLR76", "OIML R76-1:2006", "OIML"),
            ("EXT-CELE08", "OAA CE-LE-08 — Política y criterios sobre trazabilidad", "OAA"),
            ("EXT-CGLE01", "OAA CG-LE-01 — Criterios generales de acreditación", "OAA"),
        };

        foreach (var (code, title, source) in externals)
        {
            AddDoc(code, title, QualityDocumentTypes.External, title, null, order++,
                reviewMonths: 12, externalSource: source, status: QualityDocumentStatuses.Current);
        }

        db.Documents.AddRange(docs);
        db.DocumentVersions.AddRange(versions);

        // Relations for key norms
        Guid Ext(string code) => IdOf(code);
        db.DocumentRelations.AddRange(
            new QualityDocumentRelation(Guid.NewGuid())
            {
                TenantId = tenantId,
                FromDocumentId = Ext("EXT-RES25"),
                ToDocumentId = Ext("EXT-RES2307"),
                RelationType = QualityRelationTypes.Deroga,
                Notes = "Régimen transitorio vigente según art. 6 Res. 25/2025",
                CreatedAtUtc = DateTime.UtcNow
            },
            new QualityDocumentRelation(Guid.NewGuid())
            {
                TenantId = tenantId,
                FromDocumentId = Ext("EXT-RES25"),
                ToDocumentId = Ext("EXT-OIMLR76"),
                RelationType = QualityRelationTypes.Referencia,
                CreatedAtUtc = DateTime.UtcNow
            });

        await db.SaveChangesAsync(ct);
    }
}
