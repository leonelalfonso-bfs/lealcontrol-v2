using LealControl.BuildingBlocks.Results;
using Microsoft.AspNetCore.Http;

namespace LealControl.Modules.Finance.Infrastructure;

internal static class FinanceResultExtensions
{
    public static IResult ToCreatedOrBadRequest<T>(this Result<T> result, Func<T, string> location) =>
        result.IsFailure
            ? Results.BadRequest(result.Error.Message)
            : Results.Created(location(result.Value), result.Value);
}
