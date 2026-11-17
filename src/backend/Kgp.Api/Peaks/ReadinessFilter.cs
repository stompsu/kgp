using Kgp.Infrastructure.Persistence;

namespace Kgp.Api.Peaks;

public static class ReadinessFilter
{
    /// <summary>
    /// Answers 503 with Retry-After while startup migration and seeding are still running. The output cache
    /// stores only 200s, so a half-seeded (empty) answer can't stick around for the cache's hour.
    /// </summary>
    public static TBuilder RequireDatabaseReady<TBuilder>(this TBuilder builder) where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(async (context, next) =>
        {
            if (context.HttpContext.RequestServices.GetRequiredService<DatabaseReadiness>().IsReady)
            {
                return await next(context);
            }

            context.HttpContext.Response.Headers.RetryAfter = "5";
            return TypedResults.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "The database is starting up. Try again in a few seconds.");
        });
}
