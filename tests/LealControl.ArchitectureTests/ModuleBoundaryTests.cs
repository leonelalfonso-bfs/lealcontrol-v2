using FluentAssertions;
using LealControl.Modules.Crm.Contracts.Customers;
using LealControl.Modules.Crm.Domain.Customers;
using NetArchTest.Rules;
using Xunit;

namespace LealControl.ArchitectureTests;

public sealed class ModuleBoundaryTests
{
    [Fact]
    public void Domain_does_not_depend_on_other_layers()
    {
        var result = Types.InAssembly(typeof(Customer).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny(
                "LealControl.Modules.Crm.Application",
                "LealControl.Modules.Crm.Infrastructure",
                "LealControl.Api",
                "Microsoft.EntityFrameworkCore",
                "Microsoft.AspNetCore")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    [Fact]
    public void Application_does_not_depend_on_infrastructure_or_host()
    {
        var result = Types.InAssembly(typeof(LealControl.Modules.Crm.Application.DependencyInjection).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny(
                "LealControl.Modules.Crm.Infrastructure",
                "LealControl.Api",
                "Microsoft.EntityFrameworkCore",
                "Npgsql")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    [Fact]
    public void Contracts_stay_dependency_free()
    {
        var result = Types.InAssembly(typeof(ICustomerDirectory).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny(
                "LealControl.Modules.Crm.Domain",
                "LealControl.Modules.Crm.Application",
                "LealControl.Modules.Crm.Infrastructure",
                "LealControl.Api")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    [Fact]
    public void Infrastructure_does_not_reference_the_host()
    {
        var result = Types.InAssembly(typeof(LealControl.Modules.Crm.Infrastructure.DependencyInjection).Assembly)
            .ShouldNot()
            .HaveDependencyOn("LealControl.Api")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    [Fact]
    public void Sales_domain_does_not_depend_on_other_layers()
    {
        var result = Types.InAssembly(typeof(LealControl.Modules.Sales.Domain.Products.Product).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny(
                "LealControl.Modules.Sales.Application",
                "LealControl.Modules.Sales.Infrastructure",
                "LealControl.Api",
                "Microsoft.EntityFrameworkCore",
                "Microsoft.AspNetCore")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    [Fact]
    public void Sales_application_does_not_depend_on_infrastructure_or_host()
    {
        var result = Types.InAssembly(typeof(LealControl.Modules.Sales.Application.DependencyInjection).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny(
                "LealControl.Modules.Sales.Infrastructure",
                "LealControl.Api",
                "Microsoft.EntityFrameworkCore",
                "Npgsql")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    [Fact]
    public void Sales_infrastructure_does_not_reference_the_host()
    {
        var result = Types.InAssembly(typeof(LealControl.Modules.Sales.Infrastructure.DependencyInjection).Assembly)
            .ShouldNot()
            .HaveDependencyOn("LealControl.Api")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    [Fact]
    public void Finance_infrastructure_does_not_reference_Accounting_Infrastructure()
    {
        var result = Types.InAssembly(typeof(LealControl.Modules.Finance.Infrastructure.FinanceDbContext).Assembly)
            .ShouldNot()
            .HaveDependencyOn("LealControl.Modules.Accounting.Infrastructure")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    [Fact]
    public void Accounting_Infrastructure_does_not_reference_Finance_or_Sales()
    {
        var result = Types.InAssembly(typeof(LealControl.Modules.Accounting.Infrastructure.AccountingDbContext).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny(
                "LealControl.Modules.Finance.Infrastructure",
                "LealControl.Modules.Sales.Infrastructure",
                "LealControl.Modules.Sales.Application",
                "LealControl.Modules.Sales.Domain")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    [Fact]
    public void Finance_and_Accounting_may_only_share_Accounting_Contracts()
    {
        var financeRefs = typeof(LealControl.Modules.Finance.Infrastructure.FinanceDbContext).Assembly
            .GetReferencedAssemblies()
            .Select(a => a.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        financeRefs.Should().Contain("LealControl.Modules.Accounting.Contracts");
        financeRefs.Should().NotContain("LealControl.Modules.Accounting.Infrastructure");

        var accountingRefs = typeof(LealControl.Modules.Accounting.Infrastructure.AccountingDbContext).Assembly
            .GetReferencedAssemblies()
            .Select(a => a.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        accountingRefs.Should().Contain("LealControl.Modules.Accounting.Contracts");
        accountingRefs.Should().NotContain("LealControl.Modules.Finance.Infrastructure");
        accountingRefs.Should().NotContain("LealControl.Modules.Sales.Infrastructure");
    }

    private static string Format(TestResult result) =>
        result.IsSuccessful
            ? string.Empty
            : string.Join(", ", result.FailingTypeNames ?? Array.Empty<string>());
}
