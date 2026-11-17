using Kgp.Domain;
using Kgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Kgp.Api.Peaks;

public sealed record PeakDto(
    int Number,
    string Slug,
    string Name,
    string Range,
    int HeightMeters,
    double? Latitude,
    double? Longitude,
    LocalizedTextDto? Notes,
    IReadOnlyList<string> Sources)
{
    public static PeakDto From(Peak p) => new(
        p.Number, p.Slug, p.Name, p.Range, p.HeightMeters,
        p.Location?.Y, p.Location?.X,
        p is { NotesPl: { } pl, NotesEn: { } en } ? new LocalizedTextDto(pl, en) : null,
        p.Sources);
}

public sealed record LocalizedTextDto(string Pl, string En);

public static class PeakEndpoints
{
    /// <summary>The peak list changes only on deploy, so cache it and let the serverless DB stay paused.</summary>
    public const string CachePolicy = "peaks";

    public static IEndpointRouteBuilder MapPeakEndpoints(this IEndpointRouteBuilder app)
    {
        var peaks = app.MapGroup("/api/peaks")
            .WithTags("Peaks")
            .AllowAnonymous()
            .CacheOutput(CachePolicy)
            .RequireDatabaseReady();

        peaks.MapGet("/", async (KgpDbContext db, CancellationToken ct) =>
        {
            var list = await db.Peaks.AsNoTracking().OrderBy(p => p.Number).ToListAsync(ct);
            return TypedResults.Ok(list.Select(PeakDto.From).ToList());
        })
        .WithName("ListPeaks");

        peaks.MapGet("/{slug}", async Task<Results<Ok<PeakDto>, NotFound>> (string slug, KgpDbContext db, CancellationToken ct) =>
        {
            var peak = await db.Peaks.AsNoTracking().SingleOrDefaultAsync(p => p.Slug == slug, ct);
            return peak is null ? TypedResults.NotFound() : TypedResults.Ok(PeakDto.From(peak));
        })
        .WithName("GetPeak");

        return app;
    }
}
