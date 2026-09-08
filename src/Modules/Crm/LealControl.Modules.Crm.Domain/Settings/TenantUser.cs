using System;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Crm.Domain.Settings;

public sealed class TenantUser : Entity<Guid>
{
    private TenantUser()
    {
    }

    public TenantUser(
        Guid id,
        TenantId tenantId,
        string fullName,
        string email,
        string role,
        bool isActive,
        DateTime createdAtUtc,
        string? passwordHash = null,
        string? allowedModulesJson = null,
        bool isTechnicalDirector = false)
        : base(id)
    {
        TenantId = tenantId;
        FullName = fullName;
        Email = email;
        Role = role;
        IsActive = isActive;
        CreatedAtUtc = createdAtUtc;
        PasswordHash = passwordHash ?? string.Empty;
        AllowedModulesJson = allowedModulesJson ?? @"[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]";
        IsTechnicalDirector = isTechnicalDirector;
    }

    public TenantId TenantId { get; private set; }

    public string FullName { get; private set; } = string.Empty;

    public string Email { get; private set; } = string.Empty;

    public string Role { get; private set; } = "Comercial";

    public string? PasswordHash { get; private set; }

    public bool IsActive { get; private set; } = true;

    /// <summary>Director Técnico nominado (PG06). Firma autorizaciones e informes.</summary>
    public bool IsTechnicalDirector { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime? LastLoginUtc { get; private set; }

    public string AllowedModulesJson { get; private set; } = @"[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]";

    public void SetPassword(string password)
    {
        if (!string.IsNullOrWhiteSpace(password))
        {
            PasswordHash = PasswordSecurity.HashPassword(password);
        }
    }

    public void SetAllowedModules(string json)
    {
        AllowedModulesJson = string.IsNullOrWhiteSpace(json) ? "[]" : json;
    }

    public void SetTechnicalDirector(bool value) => IsTechnicalDirector = value;

    public void Update(string fullName, string role, bool isActive, string? allowedModulesJson = null, string? password = null, bool? isTechnicalDirector = null)
    {
        FullName = fullName.Trim();
        Role = role;
        IsActive = isActive;
        if (allowedModulesJson != null)
        {
            SetAllowedModules(allowedModulesJson);
        }
        if (isTechnicalDirector.HasValue)
        {
            SetTechnicalDirector(isTechnicalDirector.Value);
        }
        if (!string.IsNullOrWhiteSpace(password))
        {
            SetPassword(password);
        }
    }

    public bool VerifyPassword(string password)
    {
        if (string.IsNullOrEmpty(PasswordHash))
        {
            return false;
        }

        return PasswordSecurity.VerifyPassword(password, PasswordHash);
    }

    public void RecordLogin()
    {
        LastLoginUtc = DateTime.UtcNow;
    }

    public static TenantUser Create(
        TenantId tenantId,
        string fullName,
        string email,
        string role,
        string? initialPassword = null,
        string? allowedModulesJson = null)
    {
        var user = new TenantUser(
            Guid.NewGuid(),
            tenantId,
            fullName.Trim(),
            email.Trim().ToLowerInvariant(),
            string.IsNullOrWhiteSpace(role) ? "Comercial" : role.Trim(),
            true,
            DateTime.UtcNow,
            allowedModulesJson: allowedModulesJson);

        if (!string.IsNullOrWhiteSpace(initialPassword))
        {
            user.SetPassword(initialPassword);
        }

        return user;
    }
}

public static class PasswordSecurity
{
    public static string HashPassword(string password)
    {
        byte[] salt = System.Security.Cryptography.RandomNumberGenerator.GetBytes(16);
        byte[] hash = System.Security.Cryptography.Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            iterations: 100_000,
            hashAlgorithm: System.Security.Cryptography.HashAlgorithmName.SHA256,
            outputLength: 32);

        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public static bool VerifyPassword(string password, string storedHash)
    {
        if (string.IsNullOrWhiteSpace(storedHash))
            return false;

        if (storedHash.Contains('.'))
        {
            var parts = storedHash.Split('.');
            if (parts.Length != 2) return false;

            try
            {
                byte[] salt = Convert.FromBase64String(parts[0]);
                byte[] expectedHash = Convert.FromBase64String(parts[1]);

                byte[] actualHash = System.Security.Cryptography.Rfc2898DeriveBytes.Pbkdf2(
                    password,
                    salt,
                    iterations: 100_000,
                    hashAlgorithm: System.Security.Cryptography.HashAlgorithmName.SHA256,
                    outputLength: 32);

                return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
            }
            catch
            {
                return false;
            }
        }

        try
        {
            using var sha256 = System.Security.Cryptography.SHA256.Create();
            var bytes = System.Text.Encoding.UTF8.GetBytes(password + "LealControlSalt2026");
            var legacyHash = Convert.ToBase64String(sha256.ComputeHash(bytes));
            var a = System.Text.Encoding.UTF8.GetBytes(legacyHash);
            var b = System.Text.Encoding.UTF8.GetBytes(storedHash);
            if (a.Length != b.Length) return false;
            return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(a, b);
        }
        catch
        {
            return false;
        }
    }
}
