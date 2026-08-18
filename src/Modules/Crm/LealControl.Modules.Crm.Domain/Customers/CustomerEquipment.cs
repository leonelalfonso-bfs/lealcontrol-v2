using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;

namespace LealControl.Modules.Crm.Domain.Customers;

public sealed class CustomerEquipment : Entity<EquipmentId>
{
    private CustomerEquipment()
    {
    }

    private CustomerEquipment(
        EquipmentId id,
        string internalCode,
        string equipmentType,
        string brand,
        string model,
        string serialNumber,
        string? maxCapacity,
        string? divisionScale,
        LocationId? locationId,
        string status,
        DateTime? lastCalibrationDate,
        int? calibrationIntervalMonths,
        string? notes,
        Dictionary<string, string>? customAttributes)
        : base(id)
    {
        InternalCode = internalCode;
        EquipmentType = equipmentType;
        Brand = brand;
        Model = model;
        SerialNumber = serialNumber;
        MaxCapacity = maxCapacity;
        DivisionScale = divisionScale;
        LocationId = locationId;
        Status = status;
        LastCalibrationDate = lastCalibrationDate;
        CalibrationIntervalMonths = calibrationIntervalMonths;
        NextCalibrationDueDate = CalculateNextDueDate(lastCalibrationDate, calibrationIntervalMonths);
        Notes = notes;
        CustomAttributes = customAttributes ?? [];
    }

    public string InternalCode { get; private set; } = string.Empty;
    public string EquipmentType { get; private set; } = string.Empty;
    public string Brand { get; private set; } = string.Empty;
    public string Model { get; private set; } = string.Empty;
    public string SerialNumber { get; private set; } = string.Empty;
    public string? MaxCapacity { get; private set; }
    public string? DivisionScale { get; private set; }
    public LocationId? LocationId { get; private set; }
    public string Status { get; private set; } = "Active";
    public DateTime? LastCalibrationDate { get; private set; }
    public int? CalibrationIntervalMonths { get; private set; }
    public DateTime? NextCalibrationDueDate { get; private set; }
    public string? Notes { get; private set; }
    public Dictionary<string, string> CustomAttributes { get; private set; } = [];

    internal static Result<CustomerEquipment> Create(
        string internalCode,
        string equipmentType,
        string brand,
        string model,
        string serialNumber,
        string? maxCapacity,
        string? divisionScale,
        LocationId? locationId,
        string status,
        DateTime? lastCalibrationDate,
        int? calibrationIntervalMonths,
        string? notes,
        Dictionary<string, string>? customAttributes = null)
    {
        if (string.IsNullOrWhiteSpace(internalCode))
        {
            return Result<CustomerEquipment>.Failure(CrmErrors.EquipmentCodeRequired);
        }

        if (string.IsNullOrWhiteSpace(equipmentType))
        {
            return Result<CustomerEquipment>.Failure(CrmErrors.EquipmentTypeRequired);
        }

        return Result<CustomerEquipment>.Success(new CustomerEquipment(
            EquipmentId.New(),
            internalCode.Trim(),
            equipmentType.Trim(),
            brand?.Trim() ?? string.Empty,
            model?.Trim() ?? string.Empty,
            serialNumber?.Trim() ?? string.Empty,
            NormalizeString(maxCapacity),
            NormalizeString(divisionScale),
            locationId,
            string.IsNullOrWhiteSpace(status) ? "Active" : status.Trim(),
            lastCalibrationDate,
            calibrationIntervalMonths,
            NormalizeString(notes),
            customAttributes));
    }

    internal Result Update(
        string internalCode,
        string equipmentType,
        string brand,
        string model,
        string serialNumber,
        string? maxCapacity,
        string? divisionScale,
        LocationId? locationId,
        string status,
        DateTime? lastCalibrationDate,
        int? calibrationIntervalMonths,
        string? notes,
        Dictionary<string, string>? customAttributes = null)
    {
        if (string.IsNullOrWhiteSpace(internalCode))
        {
            return Result.Failure(CrmErrors.EquipmentCodeRequired);
        }

        if (string.IsNullOrWhiteSpace(equipmentType))
        {
            return Result.Failure(CrmErrors.EquipmentTypeRequired);
        }

        InternalCode = internalCode.Trim();
        EquipmentType = equipmentType.Trim();
        Brand = brand?.Trim() ?? string.Empty;
        Model = model?.Trim() ?? string.Empty;
        SerialNumber = serialNumber?.Trim() ?? string.Empty;
        MaxCapacity = NormalizeString(maxCapacity);
        DivisionScale = NormalizeString(divisionScale);
        LocationId = locationId;
        Status = string.IsNullOrWhiteSpace(status) ? "Active" : status.Trim();
        LastCalibrationDate = lastCalibrationDate;
        CalibrationIntervalMonths = calibrationIntervalMonths;
        NextCalibrationDueDate = CalculateNextDueDate(lastCalibrationDate, calibrationIntervalMonths);
        Notes = NormalizeString(notes);
        if (customAttributes is not null)
        {
            CustomAttributes = customAttributes;
        }

        return Result.Success();
    }

    private static DateTime? CalculateNextDueDate(DateTime? lastDate, int? months)
    {
        if (lastDate is null || months is null or <= 0)
        {
            return null;
        }
        return lastDate.Value.AddMonths(months.Value);
    }

    private static string? NormalizeString(string? val) =>
        string.IsNullOrWhiteSpace(val) ? null : val.Trim();
}
