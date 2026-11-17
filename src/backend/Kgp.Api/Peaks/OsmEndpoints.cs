using System.Text.Json;
using System.Text.Json.Serialization;
using Kgp.Domain;
using Kgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;

namespace Kgp.Api.Peaks;

/// <summary>GeoJSON FeatureCollection as in docs/api.md (M3). Coordinates are [longitude, latitude].</summary>
public sealed record FeatureCollectionDto<TProps>(IReadOnlyList<FeatureDto<TProps>> Features)
{
    [JsonPropertyOrder(-1)]
    public string Type => "FeatureCollection";
}

public sealed record FeatureDto<TProps>(GeometryDto Geometry, TProps Properties)
{
    [JsonPropertyOrder(-1)]
    public string Type => "Feature";
}

/// <summary><c>Coordinates</c> is <c>double[]</c> for a Point, <c>double[][][]</c> for a MultiLineString.</summary>
public sealed record GeometryDto(string Type, object Coordinates);

public sealed record ParkingPropertiesDto(string OsmId, string? Name, bool? Fee, int? Capacity, int DistanceMeters);

public sealed record TrailPropertiesDto(string OsmId, string? Name, string? Ref, string? Colour, string? Network);

/// <summary>Parking and trails near a peak, imported from OpenStreetMap (© OpenStreetMap contributors, ODbL).</summary>
public static class OsmEndpoints
{
    public const string GeoJsonContentType = "application/geo+json";

    /// <summary>Contract allows at most 10 parkings per peak; the import already enforces it.</summary>
    private const int MaxParkings = 10;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static IEndpointRouteBuilder MapOsmEndpoints(this IEndpointRouteBuilder app)
    {
        var peaks = app.MapGroup("/api/peaks/{slug}")
            .WithTags("Peaks")
            .AllowAnonymous()
            .CacheOutput(PeakEndpoints.CachePolicy)
            .RequireDatabaseReady();

        peaks.MapGet("/parking", async Task<Results<JsonHttpResult<FeatureCollectionDto<ParkingPropertiesDto>>, NotFound>>
            (string slug, KgpDbContext db, CancellationToken ct) =>
        {
            var peak = await FindPeakNumberAsync(db, slug, ct);
            if (peak is null)
            {
                return TypedResults.NotFound();
            }

            var rows = await db.Parkings.AsNoTracking()
                .Where(p => p.PeakNumber == peak)
                .OrderBy(p => p.DistanceMeters).ThenBy(p => p.OsmId)
                .Take(MaxParkings)
                .ToListAsync(ct);

            var features = rows.Select(p => new FeatureDto<ParkingPropertiesDto>(
                new GeometryDto("Point", Position(p.Location.Coordinate)),
                new ParkingPropertiesDto(p.OsmId, p.Name, p.Fee, p.Capacity, p.DistanceMeters))).ToList();

            return TypedResults.Json(new FeatureCollectionDto<ParkingPropertiesDto>(features), Json, GeoJsonContentType);
        })
        .WithName("GetPeakParking");

        peaks.MapGet("/trails", async Task<Results<JsonHttpResult<FeatureCollectionDto<TrailPropertiesDto>>, NotFound>>
            (string slug, KgpDbContext db, CancellationToken ct) =>
        {
            var peak = await FindPeakNumberAsync(db, slug, ct);
            if (peak is null)
            {
                return TypedResults.NotFound();
            }

            var rows = await db.Trails.AsNoTracking()
                .Where(t => t.PeakNumber == peak)
                .OrderBy(t => t.SortOrder)
                .ToListAsync(ct);

            var features = rows.Select(t => new FeatureDto<TrailPropertiesDto>(
                new GeometryDto("MultiLineString", Lines(t.Geometry)),
                new TrailPropertiesDto(t.OsmId, t.Name, t.Ref, t.Colour, t.Network))).ToList();

            return TypedResults.Json(new FeatureCollectionDto<TrailPropertiesDto>(features), Json, GeoJsonContentType);
        })
        .WithName("GetPeakTrails");

        return app;
    }

    private static async Task<int?> FindPeakNumberAsync(KgpDbContext db, string slug, CancellationToken ct) =>
        await db.Peaks.AsNoTracking().Where(p => p.Slug == slug).Select(p => (int?)p.Number).SingleOrDefaultAsync(ct);

    /// <summary>GeoJSON position: [longitude, latitude], 5 decimals (~1 m).</summary>
    private static double[] Position(Coordinate c) => [Math.Round(c.X, 5), Math.Round(c.Y, 5)];

    /// <summary>The seeder stores MultiLineStrings; accept a plain LineString too.</summary>
    private static double[][][] Lines(Geometry geometry) => geometry switch
    {
        MultiLineString multi => multi.Geometries.Select(g => g.Coordinates.Select(Position).ToArray()).ToArray(),
        LineString line => [line.Coordinates.Select(Position).ToArray()],
        _ => [],
    };
}
