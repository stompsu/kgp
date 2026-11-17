using System.Text.Json;
using Kgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Kgp.Tests;

/// <summary>
/// Seeds the real data/osm files into SQL Server, which is what catches geometries <c>geography</c> rejects.
/// Uses its own database on the shared container. Passes vacuously while the files don't exist yet.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PeaksCollection.Name)]
public class OsmRealDataSeedTests(KgpApiFactory factory)
{
    private static readonly string Dir = Path.Combine(AppContext.BaseDirectory, "data", "osm");

    [Fact]
    public async Task Real_files_seed_into_geography_and_keep_almost_every_feature()
    {
        var parking = Path.Combine(Dir, OsmSeeder.ParkingFileName);
        var trails = Path.Combine(Dir, OsmSeeder.TrailsFileName);
        if (!File.Exists(parking) || !File.Exists(trails))
        {
            return; // Not generated yet.
        }

        await using var app = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:Kgp", factory.ConnectionStringFor("kgp_real_osm"));
            b.UseSetting("Database:ParkingSeedPath", parking);
            b.UseSetting("Database:TrailsSeedPath", trails);
        });
        await app.Services.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KgpDbContext>();

        Assert.Equal(CountFeatures(parking), await db.Parkings.CountAsync());
        // A trail may lose its last part to rounding (degenerate after clipping); never more than a handful.
        var trailCount = CountFeatures(trails);
        Assert.InRange(await db.Trails.CountAsync(), trailCount - 3, trailCount);
        Assert.Equal(0, await db.Database.SqlQueryRaw<int>(
            "SELECT COUNT(*) AS Value FROM Trails WHERE Geometry.STIsValid() = 0").SingleAsync());
    }

    private static int CountFeatures(string path)
    {
        using var doc = JsonDocument.Parse(File.ReadAllBytes(path));
        return doc.RootElement.GetProperty("features").GetArrayLength();
    }
}
