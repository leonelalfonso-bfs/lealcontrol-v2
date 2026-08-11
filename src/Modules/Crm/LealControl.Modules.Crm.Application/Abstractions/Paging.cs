namespace LealControl.Modules.Crm.Application.Abstractions;

public sealed record PageRequest(int Page = 1, int PageSize = 25)
{
    public int Skip => Math.Max(Page - 1, 0) * PageSize;

    public int Take => Math.Clamp(PageSize, 1, 100);

    public int NormalizedPage => Math.Max(Page, 1);
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);
