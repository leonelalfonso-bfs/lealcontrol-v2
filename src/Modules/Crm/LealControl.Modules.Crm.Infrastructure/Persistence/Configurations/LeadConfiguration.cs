using System.Text.Json;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Activities;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;
using LealControl.Modules.Crm.Domain.Opportunities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Crm.Infrastructure.Persistence.Configurations;

internal sealed class LeadConfiguration : IEntityTypeConfiguration<Lead>
{
    public void Configure(EntityTypeBuilder<Lead> builder)
    {
        builder.ToTable("leads");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasConversion(id => id.Value, value => new LeadId(value));
        builder.Property(x => x.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.ContactName).HasMaxLength(160);
        builder.Property(x => x.Description).HasMaxLength(4000);
        builder.Property(x => x.Source).HasConversion<string>().HasMaxLength(30);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.ConvertedCustomerId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new CustomerId(value.Value) : null);

        builder.OwnsOne(x => x.Email, email =>
        {
            email.Property(e => e.Value).HasColumnName("email").HasMaxLength(200);
        });

        builder.OwnsOne(x => x.Phone, phone =>
        {
            phone.Property(p => p.Value).HasColumnName("phone").HasMaxLength(20);
        });

        builder.HasIndex(x => new { x.TenantId, x.Status });
    }
}

internal sealed class OpportunityConfiguration : IEntityTypeConfiguration<Opportunity>
{
    public void Configure(EntityTypeBuilder<Opportunity> builder)
    {
        builder.ToTable("opportunities");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasConversion(id => id.Value, value => new OpportunityId(value));
        builder.Property(x => x.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(x => x.Title).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Stage).HasConversion<string>().HasMaxLength(30);
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.Currency).HasMaxLength(3);
        builder.Property(x => x.LostReason).HasMaxLength(400);
        builder.Property(x => x.OwnerName).HasMaxLength(120);
        builder.Property(x => x.Priority)
            .HasConversion(
                v => v.ToString(),
                v => ParsePriority(v))
            .HasMaxLength(20);
        builder.Property(x => x.Probability).HasColumnName("Probability");
        builder.Property(x => x.RottingDays).HasColumnName("RottingDays");
        builder.Property(x => x.ExpectedCloseDate).HasColumnName("ExpectedCloseDate");
        var dictComparer = new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<Dictionary<string, string>>(
            (c1, c2) => (c1 == null && c2 == null) || (c1 != null && c2 != null && c1.OrderBy(e => e.Key).SequenceEqual(c2.OrderBy(e => e.Key))),
            c => c == null ? 0 : c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), (v.Value ?? "").GetHashCode())),
            c => c == null ? new Dictionary<string, string>() : new Dictionary<string, string>(c));

        builder.Property(x => x.CustomFields)
            .HasColumnName("CustomFields")
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v ?? new Dictionary<string, string>(), (JsonSerializerOptions?)null),
                v => string.IsNullOrWhiteSpace(v) ? new Dictionary<string, string>() : JsonSerializer.Deserialize<Dictionary<string, string>>(v, (JsonSerializerOptions?)null) ?? new Dictionary<string, string>())
            .Metadata.SetValueComparer(dictComparer);

        // No mapear xmin: en tenants legacy chocaba system xid vs columna usuario y rompía listados.

        builder.Property(x => x.CustomerId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new CustomerId(value.Value) : null);
        builder.Property(x => x.LeadId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new LeadId(value.Value) : null);

        // Npgsql mapea List<string> ↔ text[] nativo; un HasConversion rompía el SELECT (500).
        var tagsComparer = new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<string>>(
            (c1, c2) => (c1 == null && c2 == null) || (c1 != null && c2 != null && c1.SequenceEqual(c2)),
            c => c == null ? 0 : c.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
            c => c == null ? new List<string>() : c.ToList());

        builder.Property<List<string>>("_tags")
            .HasField("_tags")
            .HasColumnName("tags")
            .HasColumnType("text[]")
            .HasDefaultValueSql("'{}'::text[]")
            .Metadata.SetValueComparer(tagsComparer);

        builder.Ignore(x => x.Tags);
        builder.Ignore(x => x.IsClosed);
        builder.HasIndex(x => new { x.TenantId, x.Stage });
        builder.HasIndex(x => new { x.TenantId, x.Priority });
    }

    private static OpportunityPriority ParsePriority(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && Enum.TryParse<OpportunityPriority>(value, true, out var parsed)
            ? parsed
            : OpportunityPriority.Normal;
}

internal sealed class ActivityConfiguration : IEntityTypeConfiguration<Activity>
{
    public void Configure(EntityTypeBuilder<Activity> builder)
    {
        builder.ToTable("activities");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasConversion(id => id.Value, value => new ActivityId(value));
        builder.Property(x => x.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(30);
        builder.Property(x => x.Description).HasMaxLength(4000).IsRequired();
        builder.Property(x => x.DueDate).HasColumnName("DueDate");
        builder.Property(x => x.IsDone)
            .HasColumnName("IsDone")
            .HasDefaultValue(false);
        builder.Property(x => x.CompletedAtUtc).HasColumnName("CompletedAtUtc");
        builder.Property(x => x.CustomerId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new CustomerId(value.Value) : null);
        builder.Property(x => x.LeadId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new LeadId(value.Value) : null);
        builder.Property(x => x.OpportunityId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new OpportunityId(value.Value) : null);

        builder.HasIndex(x => new { x.TenantId, x.CustomerId, x.OccurredAtUtc });
        builder.HasIndex(x => new { x.TenantId, x.OpportunityId, x.IsDone, x.DueDate });
    }
}
