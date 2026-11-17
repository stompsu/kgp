using Kgp.Infrastructure.Persistence;

namespace Kgp.Tests;

/// <summary>Guards the canonical data/peaks.json against accidental edits.</summary>
public class PeakSeedFileTests
{
    private static readonly string SeedPath = Path.Combine(AppContext.BaseDirectory, "data", "peaks.json");

    [Fact]
    public void Contains_all_28_official_peaks_numbered_1_to_28()
    {
        var peaks = PeakSeeder.Load(SeedPath);

        Assert.Equal(Enumerable.Range(1, 28), peaks.Select(p => p.Number).Order());
        Assert.Equal(28, peaks.Select(p => p.Slug).Distinct().Count());
    }

    [Fact]
    public void Every_peak_has_coordinates_in_southern_Poland_with_an_OSM_source()
    {
        foreach (var peak in PeakSeeder.Load(SeedPath))
        {
            Assert.NotNull(peak.Location);
            Assert.InRange(peak.Location!.Y, 49.0, 51.3);  // latitude
            Assert.InRange(peak.Location.X, 14.1, 24.2);   // longitude
            Assert.Equal(4326, peak.Location.SRID);
            Assert.Contains(peak.Sources, s => s.StartsWith("https://www.openstreetmap.org/"));
            Assert.Contains("https://kgp.info.pl/wykaz-szczytow/", peak.Sources);
        }
    }

    [Fact]
    public void Peaks_are_numbered_by_ascending_height()
    {
        var heights = PeakSeeder.Load(SeedPath).OrderBy(p => p.Number).Select(p => p.HeightMeters).ToList();

        Assert.Equal(heights.Order(), heights);
    }
}
