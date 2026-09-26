using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public interface ICommunicationsTenantCatalog
{
    Task<IReadOnlyList<Guid>> ListEnabledTenantIdsAsync(CancellationToken cancellationToken = default);
}
