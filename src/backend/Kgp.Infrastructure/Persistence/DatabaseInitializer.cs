using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Kgp.Infrastructure.Persistence;

public sealed class DatabaseOptions
{
    /// <summary>Apply migrations and seed peaks when the app starts.</summary>
    public bool InitializeOnStartup { get; set; } = true;
    /// <summary>Path to peaks.json; defaults to data/peaks.json next to the app.</summary>
    public string PeaksSeedPath { get; set; } = Path.Combine(AppContext.BaseDirectory, "data", "peaks.json");
    /// <summary>Path to the OSM parking FeatureCollection; defaults to data/osm/parking.geojson next to the app.</summary>
    public string ParkingSeedPath { get; set; } = Path.Combine(AppContext.BaseDirectory, "data", "osm", OsmSeeder.ParkingFileName);
    /// <summary>Path to the OSM trails FeatureCollection; defaults to data/osm/trails.geojson next to the app.</summary>
    public string TrailsSeedPath { get; set; } = Path.Combine(AppContext.BaseDirectory, "data", "osm", OsmSeeder.TrailsFileName);
}

public sealed class DatabaseInitializer(IServiceScopeFactory scopes, IOptions<DatabaseOptions> options, ILogger<DatabaseInitializer> logger)
{
    public async Task InitializeAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KgpDbContext>();

        logger.LogInformation("Applying database migrations");
        await db.Database.MigrateAsync(ct);

        logger.LogInformation("Seeding peaks from {Path}", options.Value.PeaksSeedPath);
        await PeakSeeder.SeedAsync(db, options.Value.PeaksSeedPath, ct);

        // Missing or unchanged files are skipped; a bad OSM file must not keep the peaks from being served.
        await new OsmSeeder(db, logger).SeedAsync(options.Value.ParkingSeedPath, options.Value.TrailsSeedPath, ct);
    }
}

/// <summary>
/// Set once startup initialization has finished (or is turned off). Until then the database may still be
/// migrating or seeding, so read endpoints answer 503 instead of returning (and caching) empty results.
/// </summary>
public sealed class DatabaseReadiness
{
    private volatile bool ready;
    public bool IsReady => ready;
    public void MarkReady() => ready = true;
}

/// <summary>
/// Runs the initializer in the background so the API starts serving /health immediately.
/// The serverless database may take up to a minute to resume from auto-pause.
/// </summary>
internal sealed class DatabaseInitializerService(
    DatabaseInitializer initializer, DatabaseReadiness readiness, IOptions<DatabaseOptions> options, ILogger<DatabaseInitializerService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.InitializeOnStartup)
        {
            readiness.MarkReady();
            return;
        }

        try
        {
            await initializer.InitializeAsync(stoppingToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Database initialization failed");
        }
        finally
        {
            // Also after a failure: a failed migration answers 500 (never cached) and a failed OSM seed
            // rolls back to the previous rows, so serving is no worse than waiting forever.
            readiness.MarkReady();
        }
    }
}
