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

    private static string Format(TestResult result) =>
        result.IsSuccessful
            ? string.Empty
            : string.Join(", ", result.FailingTypeNames ?? Array.Empty<string>());
}
