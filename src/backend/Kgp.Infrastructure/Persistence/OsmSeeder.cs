using System.Security.Cryptography;
using System.Text.Json;
using Kgp.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NetTopologySuite;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO.Converters;

namespace Kgp.Infrastructure.Persistence;

/// <summary>
/// Loads parking and trails near each peak from data/osm/*.geojson (FeatureCollections whose features carry
/// <c>properties.peakSlug</c>). A file is applied only when its SHA-256 differs from the one stored in
/// <see cref="SeedState"/>; then its table is replaced as a whole (the file is the full truth), all in one transaction.
/// </summary>
/// <remarks>
/// SQL Server <c>geography</c> rejects lines with fewer than two distinct points, so coordinates are rounded to
/// 5 decimals (what the API serves), consecutive duplicates are removed and degenerate line parts are dropped
/// with a warning. A feature left without geometry, with an unknown peak or a duplicate OSM id is skipped.
/// </remarks>
public sealed class OsmSeeder(KgpDbContext db, ILogger logger)
{
    public const string ParkingFileName = "parking.geojson";
    public const string TrailsFileName = "trails.geojson";

    /// <summary>The API serves at most 5 decimals (~1 m); store the same so seed and response agree.</summary>
    private const int Decimals = 5;

    private static readonly GeometryFactory Geography = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326);

    private static readonly JsonSerializerOptions GeoJson = new()
    {
        Converters = { new GeoJsonConverterFactory(Geography) },
    };

    private static readonly string[] NetworkOrder = ["iwn", "nwn", "rwn", "lwn"];

    public async Task SeedAsync(string parkingPath, string trailsPath, CancellationToken ct)
    {
        var slugs = await db.Peaks.AsNoTracking().ToDictionaryAsync(p => p.Slug, p => p.Number, ct);
        var states = await db.SeedStates.AsNoTracking().ToDictionaryAsync(s => s.Name, s => s.ContentHash, ct);

        var parking = ReadIfChanged(parkingPath, ParkingFileName, states);
        var trails = ReadIfChanged(trailsPath, TrailsFileName, states);
        if (parking is null && trails is null)
        {
            return;
        }

        var parkings = parking is null ? null : ParseParkings(parking.Value.Features, slugs);
        var trailRows = trails is null ? null : ParseTrails(trails.Value.Features, slugs);

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            if (parking is { } p && parkings is not null)
            {
                await db.Parkings.ExecuteDeleteAsync(ct);
                db.Parkings.AddRange(parkings.Rows);
                await SetHashAsync(ParkingFileName, p.Hash, ct);
            }

            if (trails is { } t && trailRows is not null)
            {
                await db.Trails.ExecuteDeleteAsync(ct);
                db.Trails.AddRange(trailRows.Rows);
                await SetHashAsync(TrailsFileName, t.Hash, ct);
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        if (parkings is not null)
        {
            logger.LogInformation("Seeded {Count} parkings for {Peaks} peaks", parkings.Rows.Count, parkings.Peaks.Count);
        }

        if (trailRows is not null)
        {
            logger.LogInformation("Seeded {Count} trails for {Peaks} peaks", trailRows.Rows.Count, trailRows.Peaks.Count);
        }
    }

    private async Task SetHashAsync(string name, string hash, CancellationToken ct)
    {
        var state = await db.SeedStates.FindAsync([name], ct);
        if (state is null)
        {
            db.SeedStates.Add(new SeedState { Name = name, ContentHash = hash, AppliedAt = DateTimeOffset.UtcNow });
        }
        else
        {
            state.ContentHash = hash;
            state.AppliedAt = DateTimeOffset.UtcNow;
        }
    }

    private (string Hash, List<JsonElement> Features)? ReadIfChanged(string path, string name, Dictionary<string, string> states)
    {
        if (!File.Exists(path))
        {
            logger.LogWarning("OSM seed file {Path} not found; {Name} data left as is", path, name);
            return null;
        }

        var bytes = File.ReadAllBytes(path);
        var hash = Convert.ToHexStringLower(SHA256.HashData(bytes));
        if (states.TryGetValue(name, out var current) && current == hash)
        {
            logger.LogInformation("OSM seed file {Path} unchanged; skipping", path);
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(bytes);
            var features = doc.RootElement.GetProperty("features").EnumerateArray().Select(f => f.Clone()).ToList();
            return (hash, features);
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
        {
            logger.LogError(ex, "OSM seed file {Path} is not a GeoJSON FeatureCollection; skipping", path);
            return null;
        }
    }

    private sealed record Parsed<T>(List<T> Rows, HashSet<int> Peaks);

    private Parsed<Parking> ParseParkings(List<JsonElement> features, Dictionary<string, int> slugs)
    {
        var rows = new List<Parking>();
        var peaks = new HashSet<int>();
        var seen = new HashSet<(int, string)>();

        foreach (var feature in features)
        {
            if (!TryReadCommon(feature, slugs, ParkingFileName, out var peak, out var osmId, out var props, out var geometry))
            {
                continue;
            }

            peaks.Add(peak);
            if (geometry is not Point { IsEmpty: false } point || !point.IsValid)
            {
                logger.LogWarning("Parking {OsmId}: geometry is not a valid Point; skipped", osmId);
                continue;
            }

            if (!seen.Add((peak, osmId)))
            {
                logger.LogWarning("Parking {OsmId} listed twice for peak {Peak}; second copy skipped", osmId, peak);
                continue;
            }

            rows.Add(new Parking
            {
                PeakNumber = peak,
                OsmId = osmId,
                Name = GetString(props, "name"),
                Fee = props.TryGetProperty("fee", out var fee) && fee.ValueKind is JsonValueKind.True or JsonValueKind.False
                    ? fee.GetBoolean()
                    : null,
                Capacity = props.TryGetProperty("capacity", out var cap) && cap.ValueKind == JsonValueKind.Number && cap.TryGetInt32(out var c)
                    ? c
                    : null,
                DistanceMeters = props.TryGetProperty("distanceMeters", out var d) && d.ValueKind == JsonValueKind.Number
                    ? (int)Math.Round(d.GetDouble())
                    : 0,
                Location = Geography.CreatePoint(Round(point.Coordinate)),
            });
        }

        return new Parsed<Parking>(rows, peaks);
    }

    private Parsed<Trail> ParseTrails(List<JsonElement> features, Dictionary<string, int> slugs)
    {
        var rows = new List<Trail>();
        var peaks = new HashSet<int>();
        var seen = new HashSet<(int, string)>();

        foreach (var feature in features)
        {
            if (!TryReadCommon(feature, slugs, TrailsFileName, out var peak, out var osmId, out var props, out var geometry))
            {
                continue;
            }

            peaks.Add(peak);
            var lines = ToValidLines(geometry, osmId);
            if (lines is null)
            {
                logger.LogWarning("Trail {OsmId}: no valid line left; skipped", osmId);
                continue;
            }

            if (!seen.Add((peak, osmId)))
            {
                logger.LogWarning("Trail {OsmId} listed twice for peak {Peak}; second copy skipped", osmId, peak);
                continue;
            }

            rows.Add(new Trail
            {
                PeakNumber = peak,
                OsmId = osmId,
                Name = GetString(props, "name"),
                Ref = GetString(props, "ref"),
                Colour = GetString(props, "colour"),
                Network = GetString(props, "network"),
                Geometry = lines,
            });
        }

        // Contract order: network (international first, unknown last), then name (unnamed last), then OSM id.
        foreach (var group in rows.GroupBy(r => r.PeakNumber))
        {
            var i = 0;
            foreach (var trail in group
                         .OrderBy(t => NetworkRank(t.Network))
                         .ThenBy(t => t.Name is null)
                         .ThenBy(t => t.Name, StringComparer.InvariantCultureIgnoreCase)
                         .ThenBy(t => t.OsmId, StringComparer.Ordinal))
            {
                trail.SortOrder = i++;
            }
        }

        return new Parsed<Trail>(rows, peaks);
    }

    private static int NetworkRank(string? network)
    {
        var i = network is null ? -1 : Array.IndexOf(NetworkOrder, network);
        return i < 0 ? NetworkOrder.Length : i;
    }

    /// <summary>
    /// Normalizes a (Multi)LineString to a MultiLineString SQL Server geography accepts: rounded coordinates,
    /// no consecutive duplicates, every part with at least two distinct points. Null when nothing is left.
    /// </summary>
    private MultiLineString? ToValidLines(Geometry? geometry, string osmId)
    {
        LineString[] parts = geometry switch
        {
            LineString line => [line],
            MultiLineString multi => multi.Geometries.Cast<LineString>().ToArray(),
            _ => [],
        };

        if (parts.Length == 0)
        {
            logger.LogWarning("Trail {OsmId}: geometry is {Type}, expected (Multi)LineString", osmId, geometry?.GeometryType ?? "missing");
            return null;
        }

        var kept = new List<LineString>(parts.Length);
        for (var i = 0; i < parts.Length; i++)
        {
            var coords = new List<Coordinate>(parts[i].NumPoints);
            foreach (var c in parts[i].Coordinates)
            {
                var r = Round(c);
                if (coords.Count == 0 || !coords[^1].Equals2D(r))
                {
                    coords.Add(r);
                }
            }

            var line = coords.Count >= 2 ? Geography.CreateLineString(coords.ToArray()) : null;
            if (line is null || !line.IsValid)
            {
                logger.LogWarning("Trail {OsmId}: part {Part} has fewer than two distinct points; dropped", osmId, i);
                continue;
            }

            kept.Add(line);
        }

        return kept.Count == 0 ? null : Geography.CreateMultiLineString(kept.ToArray());
    }

    private bool TryReadCommon(JsonElement feature, Dictionary<string, int> slugs, string file,
        out int peak, out string osmId, out JsonElement props, out Geometry? geometry)
    {
        peak = 0;
        osmId = "";
        geometry = null;

        if (!feature.TryGetProperty("properties", out props) || props.ValueKind != JsonValueKind.Object)
        {
            logger.LogWarning("{File}: feature without properties; skipped", file);
            return false;
        }

        var slug = GetString(props, "peakSlug");
        var id = GetString(props, "osmId");
        if (id is null)
        {
            logger.LogWarning("{File}: feature without osmId; skipped", file);
            return false;
        }

        osmId = id;
        if (slug is null || !slugs.TryGetValue(slug, out peak))
        {
            logger.LogWarning("{File}: {OsmId} has unknown peakSlug {Slug}; skipped", file, id, slug);
            return false;
        }

        if (feature.TryGetProperty("geometry", out var g) && g.ValueKind == JsonValueKind.Object)
        {
            try
            {
                geometry = g.Deserialize<Geometry>(GeoJson);
            }
            catch (Exception ex) when (ex is JsonException or ArgumentException or InvalidOperationException)
            {
                logger.LogWarning(ex, "{File}: {OsmId} has unreadable geometry", file, id);
            }
        }

        return true;
    }

    private static string? GetString(JsonElement props, string name) =>
        props.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString())
            ? v.GetString()
            : null;

    private static Coordinate Round(Coordinate c) =>
        new(Math.Round(c.X, Decimals, MidpointRounding.AwayFromZero), Math.Round(c.Y, Decimals, MidpointRounding.AwayFromZero));
}
