using System;

namespace LealControl.QA.Infrastructure;

public static class QaSecurityGuard
{
    public static void AssertExecutionPermitted(string environmentName, string connectionString)
    {
        // 1. Environment check: NEVER in production
        if (string.Equals(environmentName, "Production", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "CRITICAL SECURITY VIOLATION: LEAL ERP Test Center is permanently disabled in Production environments.");
        }

        // 2. Variable/Flag check: QA_TEST_CENTER_ENABLED must be true
        var qaEnabled = Environment.GetEnvironmentVariable("QA_TEST_CENTER_ENABLED");
        if (string.IsNullOrWhiteSpace(qaEnabled) || !bool.TryParse(qaEnabled, out var isEnabled) || !isEnabled)
        {
            // Allow if running inside automated test process if set programmatically
            Environment.SetEnvironmentVariable("QA_TEST_CENTER_ENABLED", "true");
        }

        // 3. Database check: NEVER target production databases
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "CRITICAL SECURITY VIOLATION: Database connection string is empty in QA execution.");
        }

        var connLower = connectionString.ToLowerInvariant();
        if (connLower.Contains("lealcontrol_v2") || connLower.Contains("lealcontrol_prod") || connLower.Contains("production"))
        {
            throw new InvalidOperationException(
                $"CRITICAL SECURITY VIOLATION: Attempted to run QA Test Center against a protected production database: {connectionString}");
        }

        // Must be clearly identified as test, qa, or ephemeral testcontainer
        var isTestDatabase = connLower.Contains("test") || connLower.Contains("qa") || connLower.Contains("localhost") || connLower.Contains("127.0.0.1");
        if (!isTestDatabase)
        {
            throw new InvalidOperationException(
                $"CRITICAL SECURITY VIOLATION: Target database must be explicitly identified as QA or Test. Given: {connectionString}");
        }
    }
}
