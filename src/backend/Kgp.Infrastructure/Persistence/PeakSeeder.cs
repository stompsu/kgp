using System.Text.Json;
using Kgp.Domain;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite;
using NetTopologySuite.Geometries;

namespace Kgp.Infrastructure.Persistence;

/// <summary>Upserts the official peak list from data/peaks.json, keyed by KGP number.</summary>
public static class PeakSeeder
{
    private static readonly GeometryFactory Geography = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<Peak> Load(string path)
    {
        using var stream = File.OpenRead(path);
        var file = JsonSerializer.Deserialize<PeaksFile>(stream, Json)
                   ?? throw new InvalidOperationException($"Empty peaks file: {path}");

        return file.Peaks.Select(p => new Peak
        {
            Number = p.Number,
            Slug = p.Slug,
            Name = p.Name,
            Range = p.Range,
            HeightMeters = p.HeightMeters,
            Location = p is { Latitude: { } lat, Longitude: { } lon }
                ? Geography.CreatePoint(new Coordinate(lon, lat))
                : null,
            NotesPl = p.Notes?.Pl,
            NotesEn = p.Notes?.En,
            Sources = p.Sources ?? [],
        }).ToList();
    }

    public static async Task SeedAsync(KgpDbContext db, string path, CancellationToken ct)
    {
        var incoming = Load(path);
        var existing = await db.Peaks.ToDictionaryAsync(p => p.Number, ct);

        foreach (var peak in incoming)
        {
            if (existing.TryGetValue(peak.Number, out var current))
            {
                current.Slug = peak.Slug;
                current.Name = peak.Name;
                current.Range = peak.Range;
                current.HeightMeters = peak.HeightMeters;
                current.Location = peak.Location;
                current.NotesPl = peak.NotesPl;
                current.NotesEn = peak.NotesEn;
                current.Sources = peak.Sources;
            }
            else
            {
                db.Peaks.Add(peak);
            }
        }

        await db.SaveChangesAsync(ct);
    }

    private sealed record PeaksFile(List<PeakRow> Peaks);

    private sealed record PeakRow(
        int Number, string Slug, string Name, string Range, int HeightMeters,
        double? Latitude, double? Longitude, LocalizedText? Notes, List<string>? Sources);

    private sealed record LocalizedText(string Pl, string En);
}
