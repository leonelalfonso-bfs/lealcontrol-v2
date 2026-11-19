using System;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Purchases;

/// <summary>
/// Rubro de compra o gasto (Producto/Gasto del Libro IVA Compras), por ejemplo "PAP · Papelería y art. de
/// oficina". Cada línea de una factura de compra puede llevar uno; el libro los muestra como "[PAP] NOMBRE".
/// </summary>
public sealed class ExpenseCategory : Entity<Guid>
{
    private ExpenseCategory()
    {
    }

    private ExpenseCategory(Guid id, TenantId tenantId, string code, string name) : base(id)
    {
        TenantId = tenantId;
        Code = code;
        Name = name;
        IsActive = true;
    }

    public TenantId TenantId { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public bool IsActive { get; private set; }

    public static ExpenseCategory Create(TenantId tenantId, string code, string name) =>
        new(Guid.NewGuid(), tenantId, Normalize(code), name.Trim());

    public void Update(string code, string name, bool isActive)
    {
        Code = Normalize(code);
        Name = name.Trim();
        IsActive = isActive;
    }

    /// <summary>"[COD] NOMBRE", como lo muestra el Libro IVA Compras.</summary>
    public string Label => $"[{Code}] {Name.ToUpperInvariant()}";

    private static string Normalize(string code) => code.Trim().ToUpperInvariant();
}
