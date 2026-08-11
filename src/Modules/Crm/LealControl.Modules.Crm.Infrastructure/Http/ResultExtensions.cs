using LealControl.BuildingBlocks.Results;
using Microsoft.AspNetCore.Http;

namespace LealControl.Modules.Crm.Infrastructure.Http;

internal static class ResultExtensions
{
    public static IResult ToHttp(this Result result) =>
        result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);

    public static IResult ToHttp<T>(this Result<T> result, int successStatus = StatusCodes.Status200OK) =>
        result.IsSuccess
            ? Results.Json(result.Value, statusCode: successStatus)
            : ToProblem(result.Error);

    public static IResult ToCreated<T>(this Result<T> result, string location) =>
        result.IsSuccess
            ? Results.Created(location, result.Value)
            : ToProblem(result.Error);

    private static IResult ToProblem(Error error)
    {
        var status = error.Code switch
        {
            var code when code.Contains("NotFound", StringComparison.Ordinal) => StatusCodes.Status404NotFound,
            var code when code.Contains("Duplicate", StringComparison.Ordinal)
                || code.Contains("Conflict", StringComparison.Ordinal)
                || code.Contains("Already", StringComparison.Ordinal)
                || code.Contains("Closed", StringComparison.Ordinal)
                || code.Contains("Archived", StringComparison.Ordinal)
                || code.Contains("Inactive", StringComparison.Ordinal) => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };

        return Results.Problem(
            title: error.Code,
            detail: error.Message,
            statusCode: status);
    }
}
