namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

/// <summary>Una liquidación mensual (nota 68, S3). Borrador mientras se cargan novedades; cerrada, queda fija.</summary>
public sealed class PayrollRun
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public int Year { get; set; }
    public int Month { get; set; }
    /// <summary>Número de liquidación del período (el Libro de Sueldos Digital lo pide ascendente).</summary>
    public int Number { get; set; } = 1;
    public string Kind { get; set; } = PayrollRunKinds.Monthly;
    public DateTime PaymentDate { get; set; }
    public string Status { get; set; } = PayrollRunStatuses.Draft;
    // Art. 140 LCT: el recibo informa el último depósito de aportes (período, fecha y banco).
    public string? LastDepositPeriod { get; set; }
    public DateTime? LastDepositDate { get; set; }
    public string? LastDepositBank { get; set; }
    public DateTime? CalculatedAtUtc { get; set; }
    public DateTime? ClosedAtUtc { get; set; }
    public string? ClosedBy { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public static class PayrollRunKinds
{
    public const string Monthly = "Monthly";
}

public static class PayrollRunStatuses
{
    public const string Draft = "Draft";
    public const string Closed = "Closed";
}

/// <summary>Novedad del mes de un colaborador: horas extra, ausencias, licencias, adelantos, embargos, otros.</summary>
public sealed class PayrollNovelty
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid RunId { get; set; }
    public Guid EmployeeId { get; set; }
    public string Kind { get; set; } = "";
    /// <summary>Horas o días, según el tipo.</summary>
    public decimal Quantity { get; set; }
    /// <summary>Importe, para los tipos en pesos.</summary>
    public decimal Amount { get; set; }
    public string? Description { get; set; }
}

public static class PayrollNoveltyKinds
{
    public const string Overtime50 = "Overtime50";               // horas al 50 %
    public const string Overtime100 = "Overtime100";             // horas al 100 %
    public const string Absence = "Absence";                     // días de inasistencia injustificada
    public const string UnpaidLeave = "UnpaidLeave";             // días de licencia sin goce
    public const string PaidLeave = "PaidLeave";                 // días de licencia paga (enfermedad, especiales): no descuenta
    public const string NoPerfectAttendance = "NoPerfectAttendance"; // pierde la asistencia perfecta sin descontar días
    public const string Advance = "Advance";                     // $ adelanto que se descuenta
    public const string Garnishment = "Garnishment";             // $ embargo judicial
    public const string OtherRemunerative = "OtherRemunerative"; // $
    public const string OtherNonRemunerative = "OtherNonRemunerative"; // $
    public const string OtherDeduction = "OtherDeduction";       // $

    public static readonly string[] Hours = [Overtime50, Overtime100];
    public static readonly string[] Days = [Absence, UnpaidLeave, PaidLeave];
    public static readonly string[] Amounts = [Advance, Garnishment, OtherRemunerative, OtherNonRemunerative, OtherDeduction];
    public static readonly string[] All = [.. Hours, .. Days, NoPerfectAttendance, .. Amounts];
}

/// <summary>Recibo de un colaborador en una liquidación, con los datos del legajo al momento de liquidar.</summary>
public sealed class Payslip
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid RunId { get; set; }
    public Guid EmployeeId { get; set; }
    public string EmployeeName { get; set; } = "";
    public string Cuil { get; set; } = "";
    public string FileNumber { get; set; } = "";
    public string Agreement { get; set; } = "";
    public string Category { get; set; } = "";
    public DateTime HireDate { get; set; }
    public decimal AssignedSalary { get; set; }
    public decimal DaysWorked { get; set; }
    public decimal Remunerative { get; set; }
    public decimal NonRemunerative { get; set; }
    public decimal Deductions { get; set; }
    public decimal Net { get; set; }
    /// <summary>Base de aportes (con los topes de ANSES) y de contribuciones.</summary>
    public decimal ContributionsBase { get; set; }
    public decimal EmployeeContributionsBase { get; set; }
    // Desglose de lo que va al F.931 y a terceros, para el asiento y el Libro de Sueldos.
    public decimal EmployeeSocialSecurity { get; set; }
    public decimal UnionDeductions { get; set; }
    public decimal Advances { get; set; }
    public decimal Garnishments { get; set; }
    public decimal OtherDeductions { get; set; }
    public decimal EmployerSocialSecurity { get; set; }
    public decimal Fal { get; set; }
    public decimal EmployerHealth { get; set; }
    public decimal Art { get; set; }
    public decimal LifeInsurance { get; set; }
    public decimal AgreementContributions { get; set; }
    public string? Warnings { get; set; }
    /// <summary>Hash SHA-256 del recibo al cerrar la liquidación: cualquier cambio posterior se detecta.</summary>
    public string? ContentHash { get; set; }
    public DateTime? SignedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public List<PayslipLine> Lines { get; set; } = [];

    public decimal EmployerCost => Remunerative + NonRemunerative + EmployerSocialSecurity + Fal + EmployerHealth + Art + LifeInsurance + AgreementContributions;
}

public sealed class PayslipLine
{
    public Guid Id { get; set; }
    public Guid PayslipId { get; set; }
    public int Order { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>Remunerative, NonRemunerative, Deduction o Employer (contribución, no va al recibo).</summary>
    public string Kind { get; set; } = "";
    public decimal Quantity { get; set; }
    public decimal Amount { get; set; }
    public string? Detail { get; set; }
}

public static class PayslipLineKinds
{
    public const string Remunerative = "Remunerative";
    public const string NonRemunerative = "NonRemunerative";
    public const string Deduction = "Deduction";
    public const string Employer = "Employer";
}
