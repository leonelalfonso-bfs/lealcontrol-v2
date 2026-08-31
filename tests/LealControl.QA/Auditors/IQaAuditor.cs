using System.Threading.Tasks;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;

namespace LealControl.QA.Auditors;

public interface IQaAuditor
{
    string Name { get; }
    string Module { get; }
}
