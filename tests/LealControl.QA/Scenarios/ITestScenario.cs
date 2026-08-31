using System.Threading.Tasks;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;

namespace LealControl.QA.Scenarios;

public interface ITestScenario
{
    string Name { get; }
    string Module { get; }
    Task<QaScenarioResult> ExecuteAsync(QaTestContext context);
}
