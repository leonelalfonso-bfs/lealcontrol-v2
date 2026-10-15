namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

/// <summary>
/// Plantilla del CCT 660/13 (UECARA): categorías, zonas, escala de septiembre de 2026 y reglas. Son datos
/// publicados del acuerdo del 22/09/2026 (Anexo I) que la empresa verifica contra el acuerdo homologado y su
/// recibo; después se editan como cualquier convenio.
/// </summary>
public static class UecaraTemplate
{
    public const string Code = "660/13";
    private const string ScaleSource = "UECARA acuerdo 22/09/2026, Anexo I (valores publicados: verificar con el acuerdo homologado)";
    private static readonly DateTime September2026 = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);

    private const string G1 = "I - Capataces de obra";
    private const string G2 = "II - Administrativos";
    private const string G3 = "III - Técnicos";
    private const string G4 = "IV - Sistemas informáticos";
    private const string G5 = "V - Maestranza y servicios";

    /// <summary>Categoría, grupo, básico zona I y básico zonas II a V (septiembre de 2026).</summary>
    private static readonly (string Group, string Name, decimal ZoneI, decimal ZonesII_V)[] Scale =
    [
        (G1, "Capataz de obra", 1897792m, 2231055m),
        (G1, "Capataz de tarea, fase o especialidad", 1719341m, 2035731m),
        (G1, "Capataz de segunda", 1557500m, 1865125m),
        (G2, "Analista administrativo", 1585612m, 1756682m),
        (G2, "Auxiliar administrativo", 1462200m, 1624878m),
        (G2, "Ayudante administrativo", 1338523m, 1486936m),
        (G2, "Ayudante administrativo de segunda", 1238223m, 1305918m),
        (G3, "Analista técnico", 1667408m, 1921118m),
        (G3, "Auxiliar técnico", 1523537m, 1783286m),
        (G3, "Ayudante técnico", 1380000m, 1641402m),
        (G3, "Ayudante técnico de segunda", 1239435m, 1454778m),
        (G4, "Analista de sistemas", 1668075m, 1921659m),
        (G4, "Técnico de sistemas de primera", 1524203m, 1783826m),
        (G4, "Técnico de sistemas de segunda", 1240100m, 1455319m),
        (G5, "Maestranza de primera", 1017283m, 1039895m),
        (G5, "Maestranza de segunda", 917497m, 923092m)
    ];

    public static CollectiveAgreement Install(HumanResourcesDbContext db, Guid tenantId)
    {
        var agreement = new CollectiveAgreement
        {
            Id = Guid.NewGuid(), TenantId = tenantId, Code = Code, Name = "Empleados de la construcción y afines",
            Union = "UECARA", HourDivisor = 200m, Zones = "I,II,III,IV,V", CreatedAtUtc = DateTime.UtcNow,
            Notes = "Zona I: NOA, NEA, Entre Ríos y La Rioja. Zona II: CABA, Buenos Aires, Santa Fe, Córdoba, Cuyo. " +
                    "Zona III: La Pampa, Neuquén, Río Negro. Zona IV: Chubut, Santa Cruz. Zona V: Tierra del Fuego. " +
                    "El adicional por traslado de más de 100 km se carga como regla si corresponde."
        };
        db.CollectiveAgreements.Add(agreement);

        var order = 0;
        foreach (var (group, name, zoneI, zonesII_V) in Scale)
        {
            var category = new AgreementCategory { Id = Guid.NewGuid(), TenantId = tenantId, AgreementId = agreement.Id, Group = group, Name = name, SortOrder = ++order };
            db.AgreementCategories.Add(category);
            foreach (var zone in agreement.ZoneList())
                db.AgreementScales.Add(new AgreementScale
                {
                    Id = Guid.NewGuid(), TenantId = tenantId, AgreementId = agreement.Id, CategoryId = category.Id, Zone = zone,
                    ValidFrom = September2026, Basic = zone == "I" ? zoneI : zonesII_V, Source = ScaleSource
                });
        }

        void Rule(string type, string code, string name, string basis, decimal value, string appliesTo = "All", string zones = "",
            string groups = "", string? flag = null, bool nextMonth = false, bool remunerative = true, DateTime? from = null) =>
            db.AgreementRules.Add(new AgreementRule
            {
                Id = Guid.NewGuid(), TenantId = tenantId, AgreementId = agreement.Id, Type = type, Code = code, Name = name, Basis = basis,
                Value = value, AppliesTo = appliesTo, Zones = zones, Groups = groups, RequiresFlag = flag, SeniorityFromNextMonth = nextMonth,
                Remunerative = type == AgreementRuleTypes.Addition && remunerative, ValidFrom = from ?? September2026
            });

        const string add = AgreementRuleTypes.Addition, ded = AgreementRuleTypes.EmployeeDeduction;
        Rule(add, "ANTIG", "Antigüedad (art. 33)", AgreementRuleBases.FixedPerSeniorityYear, 13844m, nextMonth: true);
        Rule(add, "ZONA3", "Adicional zona desfavorable III", AgreementRuleBases.PercentOfBasic, 11.5m, zones: "III");
        Rule(add, "ZONA4", "Adicional zona desfavorable IV", AgreementRuleBases.PercentOfBasic, 60m, zones: "IV", groups: G1);
        Rule(add, "ZONA4", "Adicional zona desfavorable IV", AgreementRuleBases.PercentOfBasic, 70m, zones: "IV", groups: $"{G3},{G4}");
        Rule(add, "ZONA4", "Adicional zona desfavorable IV", AgreementRuleBases.PercentOfBasic, 80m, zones: "IV", groups: $"{G2},{G5}");
        Rule(add, "ZONA5", "Adicional zona desfavorable V", AgreementRuleBases.PercentOfBasic, 100m, zones: "V");
        Rule(add, "TITA", "Título nivel A (universitario o terciario)", AgreementRuleBases.Fixed, 75742m, flag: "titulo-a");
        Rule(add, "TITB", "Título nivel B (secundario técnico)", AgreementRuleBases.Fixed, 64592m, flag: "titulo-b");
        Rule(add, "TITC", "Título nivel C (otros secundarios)", AgreementRuleBases.Fixed, 51732m, flag: "titulo-c");
        Rule(add, "FCAJA", "Fallo de caja", AgreementRuleBases.Fixed, 73143m, flag: "fallo-caja");
        Rule(add, "ASIST", "Asistencia perfecta", AgreementRuleBases.PercentOfBasic, 10m, flag: "asistencia-perfecta");
        Rule(ded, "CUOTA", "Cuota sindical UECARA (art. 39)", AgreementRuleBases.PercentOfGross, 2m, appliesTo: "UnionMembers");
        Rule(ded, "SOLID", "Aporte solidario UECARA", AgreementRuleBases.PercentOfGross, 1m, appliesTo: "NonMembers");
        Rule(ded, "SOLEX", "Aporte solidario extraordinario (acuerdo 06/04/2026, cl. 5)", AgreementRuleBases.PercentOfGross, 1.5m,
            appliesTo: "NonMembers", from: new DateTime(2026, 4, 1, 0, 0, 0, DateTimeKind.Utc));
        return agreement;
    }
}
