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
    }
}

/// <summary>
/// Runs the initializer in the background so the API starts serving /health immediately.
/// The serverless database may take up to a minute to resume from auto-pause.
/// </summary>
internal sealed class DatabaseInitializerService(DatabaseInitializer initializer, IOptions<DatabaseOptions> options, ILogger<DatabaseInitializerService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.InitializeOnStartup)
        {
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
    }
}
