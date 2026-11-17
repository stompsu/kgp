using System.Net;
using System.Text.Json;
using Kgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Kgp.Tests;

/// <summary>Parking and trails endpoints against the fixtures in Fixtures/osm (see docs/api.md, M3).</summary>
[Trait("Category", "Integration")]
[Collection(PeaksCollection.Name)]
public class OsmApiTests(KgpApiFactory factory)
{
    private static async Task<JsonElement> GetGeoJson(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/geo+json", response.Content.Headers.ContentType?.MediaType);

        var root = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("FeatureCollection", root.GetProperty("type").GetString());
        return root;
    }

    private static List<JsonElement> Features(JsonElement root) => root.GetProperty("features").EnumerateArray().ToList();

    private static string[] PropertyNames(JsonElement feature) =>
        feature.GetProperty("properties").EnumerateObject().Select(p => p.Name).ToArray();

    [Theory]
    [InlineData("/api/peaks/giewont/parking")]
    [InlineData("/api/peaks/giewont/trails")]
    public async Task Unknown_slug_returns_404(string url)
    {
        var response = await factory.CreateClient().GetAsync(url);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Parking_is_ordered_by_distance_with_contract_properties()
    {
        var features = Features(await GetGeoJson(factory.CreateClient(), "/api/peaks/rysy/parking"));

        Assert.Equal(["node/1", "way/2"], features.Select(f => f.GetProperty("properties").GetProperty("osmId").GetString()));
        Assert.All(features, f =>
        {
            Assert.Equal("Feature", f.GetProperty("type").GetString());
            Assert.Equal("Point", f.GetProperty("geometry").GetProperty("type").GetString());
            Assert.Equal(["osmId", "name", "fee", "capacity", "distanceMeters"], PropertyNames(f));
        });

        var unknown = features[0].GetProperty("properties");
        Assert.Equal(JsonValueKind.Null, unknown.GetProperty("name").ValueKind);
        Assert.Equal(JsonValueKind.Null, unknown.GetProperty("fee").ValueKind);
        Assert.Equal(JsonValueKind.Null, unknown.GetProperty("capacity").ValueKind);
        Assert.Equal(1200, unknown.GetProperty("distanceMeters").GetInt32());

        var palenica = features[1];
        var props = palenica.GetProperty("properties");
        Assert.Equal("Parking Palenica Białczańska", props.GetProperty("name").GetString());
        Assert.True(props.GetProperty("fee").GetBoolean());
        Assert.Equal(300, props.GetProperty("capacity").GetInt32());
        Assert.Equal(8370, props.GetProperty("distanceMeters").GetInt32());

        // [lon, lat], rounded to 5 decimals.
        var coords = palenica.GetProperty("geometry").GetProperty("coordinates").EnumerateArray().Select(c => c.GetDouble()).ToArray();
        Assert.Equal([20.10262, 49.25461], coords);
    }

    [Fact]
    public async Task Trails_are_ordered_by_network_then_name_as_MultiLineStrings()
    {
        var features = Features(await GetGeoJson(factory.CreateClient(), "/api/peaks/rysy/trails"));

        // relation/14 has no valid part left and is skipped; iwn, rwn (by name), lwn.
        Assert.Equal(["relation/12", "relation/11", "relation/13", "relation/10"],
            features.Select(f => f.GetProperty("properties").GetProperty("osmId").GetString()));
        Assert.All(features, f =>
        {
            Assert.Equal("MultiLineString", f.GetProperty("geometry").GetProperty("type").GetString());
            Assert.Equal(["osmId", "name", "ref", "colour", "network"], PropertyNames(f));
        });

        var green = features[0];
        Assert.Equal("E3", green.GetProperty("properties").GetProperty("ref").GetString());
        Assert.Equal("green", green.GetProperty("properties").GetProperty("colour").GetString());
        var lastPoint = green.GetProperty("geometry").GetProperty("coordinates")[1][1];
        Assert.Equal(20.08012, lastPoint[0].GetDouble()); // longitude first
        Assert.Equal(49.17899, lastPoint[1].GetDouble());

        // The degenerate second part is dropped; the repeated point in the first part is removed.
        var red = features[1];
        Assert.Equal(JsonValueKind.Null, red.GetProperty("properties").GetProperty("ref").ValueKind);
        var parts = red.GetProperty("geometry").GetProperty("coordinates");
        Assert.Equal(1, parts.GetArrayLength());
        Assert.Equal(3, parts[0].GetArrayLength());
        Assert.Equal(20.088, parts[0][0][0].GetDouble());
        Assert.Equal(49.179, parts[0][0][1].GetDouble());

        // A plain LineString in the file is served as a one-part MultiLineString.
        Assert.Equal(1, features[3].GetProperty("geometry").GetProperty("coordinates").GetArrayLength());
    }

    [Theory]
    [InlineData("/api/peaks/lysica/parking")]
    [InlineData("/api/peaks/lysica/trails")]
    public async Task Peak_without_data_returns_an_empty_collection(string url)
    {
        var root = await GetGeoJson(factory.CreateClient(), url);

        Assert.Empty(Features(root));
    }

    [Fact]
    public async Task Reseed_is_skipped_when_the_file_is_unchanged_and_replaces_rows_when_it_changes()
    {
        var dir = Directory.CreateTempSubdirectory("kgp-osm-");
        try
        {
            var parking = Path.Combine(dir.FullName, "parking.geojson");
            await File.WriteAllTextAsync(parking, ParkingFile("sleza", "node/100", "Parking A"));

            await InitializeWith(parking, KgpApiFactory.FixtureTrailsPath);
            Assert.Equal(["node/100"], await SlezaParkings());

            // Tamper with the row: an unchanged file must not rewrite it.
            await using (var scope = factory.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<KgpDbContext>();
                await db.Parkings.Where(p => p.OsmId == "node/100").ExecuteUpdateAsync(s => s.SetProperty(p => p.Name, "tampered"));
            }

            await InitializeWith(parking, KgpApiFactory.FixtureTrailsPath);
            await using (var scope = factory.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<KgpDbContext>();
                Assert.Equal("tampered", await db.Parkings.Where(p => p.OsmId == "node/100").Select(p => p.Name).SingleAsync());
            }

            await File.WriteAllTextAsync(parking, ParkingFile("sleza", "node/200", "Parking B"));
            await InitializeWith(parking, KgpApiFactory.FixtureTrailsPath);
            Assert.Equal(["node/200"], await SlezaParkings());

            // The file is the full truth: peaks absent from it lose their rows. (Checked in the DB, not over
            // HTTP, so an empty response doesn't land in the shared output cache.)
            await using (var scope = factory.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<KgpDbContext>();
                Assert.False(await db.Parkings.AnyAsync(p => p.Peak!.Slug == "rysy"));
            }
        }
        finally
        {
            await InitializeWith(KgpApiFactory.FixtureParkingPath, KgpApiFactory.FixtureTrailsPath);
            dir.Delete(recursive: true);
        }
    }

    [Fact]
    public async Task Missing_files_do_not_break_initialization()
    {
        var missing = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"), "nope.geojson");

        await InitializeWith(missing, missing);

        var root = await GetGeoJson(factory.CreateClient(), "/api/peaks/rysy/trails");
        Assert.Equal(4, Features(root).Count);
    }

    private async Task InitializeWith(string parkingPath, string trailsPath)
    {
        await using var app = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Database:ParkingSeedPath", parkingPath);
            b.UseSetting("Database:TrailsSeedPath", trailsPath);
        });
        await app.Services.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
    }

    private async Task<List<string>> SlezaParkings()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KgpDbContext>();
        return await db.Parkings.Where(p => p.Peak!.Slug == "sleza").Select(p => p.OsmId).ToListAsync();
    }

    private static string ParkingFile(string slug, string osmId, string name) => $$$"""
        {"type":"FeatureCollection","features":[{"type":"Feature",
          "geometry":{"type":"Point","coordinates":[16.7,50.86]},
          "properties":{"peakSlug":"{{{slug}}}","osmId":"{{{osmId}}}","name":"{{{name}}}","fee":false,"capacity":20,"distanceMeters":900}}]}
        """;
}
