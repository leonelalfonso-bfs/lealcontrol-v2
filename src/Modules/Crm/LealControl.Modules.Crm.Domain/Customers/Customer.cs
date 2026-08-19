using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Shared;
using LealControl.Modules.Crm.Domain.ValueObjects;

namespace LealControl.Modules.Crm.Domain.Customers;

public sealed class Customer : AggregateRoot<CustomerId>
{
    private readonly List<CustomerLocation> _locations = [];
    private readonly List<CustomerContact> _contacts = [];
    private readonly List<CustomerFiscalRate> _fiscalRates = [];
    private readonly List<CustomerEquipment> _equipments = [];

    private Customer()
    {
    }

    private Customer(
        CustomerId id,
        TenantId tenantId,
        string legalName,
        string? tradeName,
        PartyDocument document,
        TaxCondition taxCondition,
        IibbRegime iibbRegime,
        bool isCustomer,
        bool isSupplier,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        LegalName = legalName;
        TradeName = tradeName;
        Document = document;
        TaxCondition = taxCondition;
        IibbRegime = iibbRegime;
        IsCustomer = isCustomer;
        IsSupplier = isSupplier;
        Status = CustomerStatus.Active;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string LegalName { get; private set; } = string.Empty;

    public string? TradeName { get; private set; }

    public PartyDocument Document { get; private set; } = null!;

    public TaxCondition TaxCondition { get; private set; }

    public IibbRegime IibbRegime { get; private set; }

    public CustomerStatus Status { get; private set; }

    public bool IsCustomer { get; private set; }

    public bool IsSupplier { get; private set; }

    public EmailAddress? Email { get; private set; }

    public PhoneNumber? Phone { get; private set; }

    public PhoneNumber? WhatsApp { get; private set; }

    public PostalAddress? FiscalAddress { get; private set; }

    public decimal? CreditLimit { get; private set; }

    public int? PaymentTermsDays { get; private set; }

    public Guid? SellerId { get; private set; }

    public string? Notes { get; private set; }

    public bool IsLargeCompany { get; private set; }

    public decimal? FceThreshold { get; private set; }

    public DateTime? FceCheckedAtUtc { get; private set; }

    public string? CreditRating { get; private set; }

    public int? BcraWorstSituation { get; private set; }

    public decimal? BcraTotalDebt { get; private set; }

    public int? BcraRejectedChequesCount { get; private set; }

    public DateTime? BcraLastCheckedAtUtc { get; private set; }

    public string? CreditRecommendation { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public DateTime? DeletedAtUtc { get; private set; }

    public bool IsDeleted => DeletedAtUtc is not null;

    public void UpdateBcraCreditReport(
        string? creditRating,
        int? worstSituation,
        decimal? totalDebt,
        int? rejectedChequesCount,
        string? recommendation,
        DateTime checkedAtUtc)
    {
        CreditRating = creditRating;
        BcraWorstSituation = worstSituation;
        BcraTotalDebt = totalDebt;
        BcraRejectedChequesCount = rejectedChequesCount;
        CreditRecommendation = recommendation;
        BcraLastCheckedAtUtc = checkedAtUtc;
        UpdatedAtUtc = checkedAtUtc;
    }

    public IReadOnlyCollection<CustomerLocation> Locations => _locations.AsReadOnly();

    public IReadOnlyCollection<CustomerContact> Contacts => _contacts.AsReadOnly();

    public IReadOnlyCollection<CustomerFiscalRate> FiscalRates => _fiscalRates.AsReadOnly();

    public IReadOnlyCollection<CustomerEquipment> Equipments => _equipments.AsReadOnly();

    public static Result<Customer> Register(CustomerRegistration registration)
    {
        if (string.IsNullOrWhiteSpace(registration.LegalName))
        {
            return Result<Customer>.Failure(CrmErrors.LegalNameRequired);
        }

        if (registration.CreditLimit is < 0)
        {
            return Result<Customer>.Failure(CrmErrors.InvalidCreditLimit);
        }

        var customer = new Customer(
            CustomerId.New(),
            registration.TenantId,
            registration.LegalName.Trim(),
            NormalizeOptional(registration.TradeName),
            registration.Document,
            registration.TaxCondition,
            registration.IibbRegime,
            registration.IsCustomer,
            registration.IsSupplier,
            registration.UtcNow);

        customer.Email = registration.Email;
        customer.Phone = registration.Phone;
        customer.WhatsApp = registration.WhatsApp;
        customer.FiscalAddress = registration.FiscalAddress;
        customer.CreditLimit = registration.CreditLimit;
        customer.PaymentTermsDays = registration.PaymentTermsDays;
        customer.SellerId = registration.SellerId;
        customer.Notes = NormalizeOptional(registration.Notes);

        customer.Raise(new CustomerRegisteredDomainEvent(
            customer.Id,
            customer.TenantId,
            customer.LegalName,
            customer.Document.Type,
            customer.Document.Number,
            customer.UtcStamp()));

        return Result<Customer>.Success(customer);
    }

    public Result UpdateProfile(CustomerProfileUpdate update)
    {
        if (string.IsNullOrWhiteSpace(update.LegalName))
        {
            return Result.Failure(CrmErrors.LegalNameRequired);
        }

        if (update.CreditLimit is < 0)
        {
            return Result.Failure(CrmErrors.InvalidCreditLimit);
        }

        LegalName = update.LegalName.Trim();
        TradeName = NormalizeOptional(update.TradeName);
        Document = update.Document;
        TaxCondition = update.TaxCondition;
        IibbRegime = update.IibbRegime;
        IsCustomer = update.IsCustomer;
        IsSupplier = update.IsSupplier;
        Email = update.Email;
        Phone = update.Phone;
        WhatsApp = update.WhatsApp;
        FiscalAddress = update.FiscalAddress;
        CreditLimit = update.CreditLimit;
        PaymentTermsDays = update.PaymentTermsDays;
        SellerId = update.SellerId;
        Notes = NormalizeOptional(update.Notes);
        Touch(update.UtcNow);
        return Result.Success();
    }

    public Result Activate(DateTime utcNow)
    {
        Status = CustomerStatus.Active;
        Touch(utcNow);
        return Result.Success();
    }

    public Result Deactivate(DateTime utcNow)
    {
        Status = CustomerStatus.Inactive;
        Touch(utcNow);
        Raise(new CustomerDeactivatedDomainEvent(Id, TenantId, utcNow));
        return Result.Success();
    }

    public Result SoftDelete(DateTime utcNow)
    {
        DeletedAtUtc = utcNow;
        Status = CustomerStatus.Inactive;
        Touch(utcNow);
        return Result.Success();
    }

    public Result AddLocation(string name, PostalAddress address, PhoneNumber? phone, string? notes, DateTime utcNow)
    {
        var location = CustomerLocation.Create(name, address, phone, notes);
        if (location.IsFailure)
        {
            return Result.Failure(location.Error);
        }

        _locations.Add(location.Value);
        Touch(utcNow);
        return Result.Success();
    }

    public Result UpdateLocation(
        LocationId locationId,
        string name,
        PostalAddress address,
        PhoneNumber? phone,
        string? notes,
        DateTime utcNow)
    {
        var location = _locations.SingleOrDefault(x => x.Id == locationId);
        if (location is null)
        {
            return Result.Failure(CrmErrors.LocationNotFound);
        }

        var updated = location.Update(name, address, phone, notes);
        if (updated.IsFailure)
        {
            return updated;
        }

        Touch(utcNow);
        return Result.Success();
    }

    public Result RemoveLocation(LocationId locationId, DateTime utcNow)
    {
        var location = _locations.SingleOrDefault(x => x.Id == locationId);
        if (location is null)
        {
            return Result.Failure(CrmErrors.LocationNotFound);
        }

        _locations.Remove(location);
        foreach (var contact in _contacts.Where(c => c.LocationId == locationId))
        {
            contact.Update(
                contact.Name,
                contact.Role,
                null,
                contact.Email,
                contact.Phone,
                contact.WhatsApp,
                contact.IsPrimary,
                contact.Notes);
        }

        Touch(utcNow);
        return Result.Success();
    }

    public Result AddContact(
        string name,
        ContactRole role,
        LocationId? locationId,
        EmailAddress? email,
        PhoneNumber? phone,
        PhoneNumber? whatsApp,
        bool isPrimary,
        string? notes,
        DateTime utcNow)
    {
        if (locationId is not null && _locations.All(l => l.Id != locationId))
        {
            return Result.Failure(CrmErrors.LocationNotFound);
        }

        var contact = CustomerContact.Create(name, role, locationId, email, phone, whatsApp, isPrimary, notes);
        if (contact.IsFailure)
        {
            return Result.Failure(contact.Error);
        }

        if (isPrimary)
        {
            ClearPrimaryContacts();
        }

        _contacts.Add(contact.Value);
        Touch(utcNow);
        return Result.Success();
    }

    public Result UpdateContact(
        ContactId contactId,
        string name,
        ContactRole role,
        LocationId? locationId,
        EmailAddress? email,
        PhoneNumber? phone,
        PhoneNumber? whatsApp,
        bool isPrimary,
        string? notes,
        DateTime utcNow)
    {
        var contact = _contacts.SingleOrDefault(x => x.Id == contactId);
        if (contact is null)
        {
            return Result.Failure(CrmErrors.ContactNotFound);
        }

        if (locationId is not null && _locations.All(l => l.Id != locationId))
        {
            return Result.Failure(CrmErrors.LocationNotFound);
        }

        if (isPrimary)
        {
            ClearPrimaryContacts();
        }

        var updated = contact.Update(name, role, locationId, email, phone, whatsApp, isPrimary, notes);
        if (updated.IsFailure)
        {
            return updated;
        }

        Touch(utcNow);
        return Result.Success();
    }

    public Result RemoveContact(ContactId contactId, DateTime utcNow)
    {
        var contact = _contacts.SingleOrDefault(x => x.Id == contactId);
        if (contact is null)
        {
            return Result.Failure(CrmErrors.ContactNotFound);
        }

        _contacts.Remove(contact);
        Touch(utcNow);
        return Result.Success();
    }

    public Result UpsertFiscalRate(
        FiscalJurisdiction jurisdiction,
        decimal perceptionRate,
        decimal retentionRate,
        bool hasPerceptionExclusion,
        DateOnly? perceptionExclusionExpiresOn,
        bool hasRetentionExclusion,
        DateOnly? retentionExclusionExpiresOn,
        string? exclusionCertificateNumber,
        DateTime utcNow)
    {
        var existing = _fiscalRates.SingleOrDefault(x => x.Jurisdiction == jurisdiction);
        if (existing is null)
        {
            var created = CustomerFiscalRate.Create(
                jurisdiction,
                perceptionRate,
                retentionRate,
                hasPerceptionExclusion,
                perceptionExclusionExpiresOn,
                hasRetentionExclusion,
                retentionExclusionExpiresOn,
                exclusionCertificateNumber);

            if (created.IsFailure)
            {
                return Result.Failure(created.Error);
            }

            _fiscalRates.Add(created.Value);
        }
        else
        {
            var updated = existing.Update(
                perceptionRate,
                retentionRate,
                hasPerceptionExclusion,
                perceptionExclusionExpiresOn,
                hasRetentionExclusion,
                retentionExclusionExpiresOn,
                exclusionCertificateNumber);

            if (updated.IsFailure)
            {
                return updated;
            }
        }

        Touch(utcNow);
        return Result.Success();
    }

    public Result RecordFceCheck(bool isLargeCompany, decimal? threshold, DateTime utcNow)
    {
        IsLargeCompany = isLargeCompany;
        FceThreshold = threshold;
        FceCheckedAtUtc = utcNow;
        Touch(utcNow);
        return Result.Success();
    }

    public Result<EquipmentId> AddEquipment(
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
        DateTime utcNow,
        Dictionary<string, string>? customAttributes = null)
    {
        if (locationId.HasValue && !_locations.Any(l => l.Id == locationId.Value))
        {
            return Result<EquipmentId>.Failure(CrmErrors.LocationNotFound);
        }

        var equipmentResult = CustomerEquipment.Create(
            internalCode,
            equipmentType,
            brand,
            model,
            serialNumber,
            maxCapacity,
            divisionScale,
            locationId,
            status,
            lastCalibrationDate,
            calibrationIntervalMonths,
            notes,
            customAttributes);

        if (equipmentResult.IsFailure)
        {
            return Result<EquipmentId>.Failure(equipmentResult.Error);
        }

        _equipments.Add(equipmentResult.Value);
        Touch(utcNow);
        return Result<EquipmentId>.Success(equipmentResult.Value.Id);
    }

    public Result UpdateEquipment(
        EquipmentId equipmentId,
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
        DateTime utcNow,
        Dictionary<string, string>? customAttributes = null)
    {
        var equipment = _equipments.FirstOrDefault(e => e.Id == equipmentId);
        if (equipment is null)
        {
            return Result.Failure(CrmErrors.EquipmentNotFound);
        }

        if (locationId.HasValue && !_locations.Any(l => l.Id == locationId.Value))
        {
            return Result.Failure(CrmErrors.LocationNotFound);
        }

        var updateResult = equipment.Update(
            internalCode,
            equipmentType,
            brand,
            model,
            serialNumber,
            maxCapacity,
            divisionScale,
            locationId,
            status,
            lastCalibrationDate,
            calibrationIntervalMonths,
            notes,
            customAttributes);

        if (updateResult.IsFailure)
        {
            return updateResult;
        }

        Touch(utcNow);
        return Result.Success();
    }

    public Result RemoveEquipment(EquipmentId equipmentId, DateTime utcNow)
    {
        var equipment = _equipments.FirstOrDefault(e => e.Id == equipmentId);
        if (equipment is null)
        {
            return Result.Failure(CrmErrors.EquipmentNotFound);
        }

        _equipments.Remove(equipment);
        Touch(utcNow);
        return Result.Success();
    }

    private void ClearPrimaryContacts()
    {
        foreach (var contact in _contacts)
        {
            contact.MarkPrimary(false);
        }
    }

    private void Touch(DateTime utcNow) => UpdatedAtUtc = utcNow;

    private DateTime UtcStamp() => UpdatedAtUtc;

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed record CustomerRegistration(
    TenantId TenantId,
    string LegalName,
    string? TradeName,
    PartyDocument Document,
    TaxCondition TaxCondition,
    IibbRegime IibbRegime,
    bool IsCustomer,
    bool IsSupplier,
    EmailAddress? Email,
    PhoneNumber? Phone,
    PhoneNumber? WhatsApp,
    PostalAddress? FiscalAddress,
    decimal? CreditLimit,
    int? PaymentTermsDays,
    Guid? SellerId,
    string? Notes,
    DateTime UtcNow);

public sealed record CustomerProfileUpdate(
    string LegalName,
    string? TradeName,
    PartyDocument Document,
    TaxCondition TaxCondition,
    IibbRegime IibbRegime,
    bool IsCustomer,
    bool IsSupplier,
    EmailAddress? Email,
    PhoneNumber? Phone,
    PhoneNumber? WhatsApp,
    PostalAddress? FiscalAddress,
    decimal? CreditLimit,
    int? PaymentTermsDays,
    Guid? SellerId,
    string? Notes,
    DateTime UtcNow);
