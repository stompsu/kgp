using System.Net;
using System.Net.Http.Json;
using Kgp.Api.Peaks;
using Microsoft.Extensions.DependencyInjection;

namespace Kgp.Tests;

/// <summary>Read-only peak data (peaks, parking, trails) shares one SQL container; SQL Server is slow to start.</summary>
[CollectionDefinition(Name)]
public sealed class PeaksCollection : ICollectionFixture<KgpApiFactory>
{
    public const string Name = "Peaks API";
}

[Trait("Category", "Integration")]
[Collection(PeaksCollection.Name)]
public class PeaksApiTests(KgpApiFactory factory)
{
    [Fact]
    public async Task List_returns_28_peaks_ordered_by_number_with_coordinates()
    {
        var peaks = await factory.CreateClient().GetFromJsonAsync<List<PeakDto>>("/api/peaks");

        Assert.NotNull(peaks);
        Assert.Equal(Enumerable.Range(1, 28), peaks.Select(p => p.Number));
        Assert.All(peaks, p => Assert.True(p.Latitude is not null && p.Longitude is not null, p.Slug));
    }

    [Fact]
    public async Task Get_by_slug_returns_the_peak()
    {
        var rysy = await factory.CreateClient().GetFromJsonAsync<PeakDto>("/api/peaks/rysy");

        Assert.NotNull(rysy);
        Assert.Equal("Rysy", rysy.Name);
        Assert.Equal("Tatry", rysy.Range);
        Assert.Equal(2499, rysy.HeightMeters);
        Assert.Equal(49.17958, rysy.Latitude!.Value, precision: 5);
        Assert.Equal(20.08811, rysy.Longitude!.Value, precision: 5);
        Assert.Null(rysy.Notes);
    }

    [Fact]
    public async Task Disputed_peak_has_notes_in_both_languages()
    {
        var skopiec = await factory.CreateClient().GetFromJsonAsync<PeakDto>("/api/peaks/skopiec");

        Assert.Contains("Okole", skopiec!.Notes!.Pl);
        Assert.Contains("Okole", skopiec.Notes.En);
    }

    [Fact]
    public async Task Get_unknown_slug_returns_404()
    {
        var response = await factory.CreateClient().GetAsync("/api/peaks/giewont");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Seeding_twice_does_not_duplicate_peaks()
    {
        await factory.Services.GetRequiredService<Kgp.Infrastructure.Persistence.DatabaseInitializer>()
            .InitializeAsync(CancellationToken.None);

        var peaks = await factory.CreateClient().GetFromJsonAsync<List<PeakDto>>("/api/peaks");
        Assert.Equal(28, peaks!.Count);
    }
}
