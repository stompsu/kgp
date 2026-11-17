using Kgp.Infrastructure.Persistence;
using Kgp.Infrastructure.Photos;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;

namespace Kgp.Tests;

/// <summary>
/// API backed by a throwaway SQL Server container (needs Docker), migrated and seeded once per fixture.
/// Photos go to a temp folder; bearer tokens are replaced by <see cref="TestAuthHandler"/> (X-Test-User header).
/// </summary>
public sealed class KgpApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly MsSqlContainer _sql = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();

    /// <summary>Small OSM fixtures (rysy, sleza; lysica has none) instead of the real data/osm files.</summary>
    public static string FixtureParkingPath { get; } = Path.Combine(AppContext.BaseDirectory, "Fixtures", "osm", "parking.geojson");
    public static string FixtureTrailsPath { get; } = Path.Combine(AppContext.BaseDirectory, "Fixtures", "osm", "trails.geojson");

    public string PhotoPath { get; } = Path.Combine(Path.GetTempPath(), "kgp-tests-photos", Guid.NewGuid().ToString("N"));

    /// <summary>Connection string to another database on the same container (created by migrations on first use).</summary>
    public string ConnectionStringFor(string database) =>
        new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(_sql.GetConnectionString()) { InitialCatalog = database }.ConnectionString;

    public FileSystemPhotoStore PhotoStore => (FileSystemPhotoStore)Services.GetRequiredService<IPhotoStore>();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Kgp", _sql.GetConnectionString());
        builder.UseSetting("Database:InitializeOnStartup", "false");
        builder.UseSetting("Database:ParkingSeedPath", FixtureParkingPath);
        builder.UseSetting("Database:TrailsSeedPath", FixtureTrailsPath);
        builder.UseSetting("Storage:BlobEndpoint", "");
        builder.UseSetting("Storage:LocalPath", PhotoPath);
        builder.ConfigureTestServices(TestAuthHandler.Register);
    }

    /// <summary>A client that authenticates as <paramref name="userId"/> with the Conquests.ReadWrite scope.</summary>
    public HttpClient CreateClientFor(Guid userId, string scope = "Conquests.ReadWrite")
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.UserHeader, userId.ToString());
        client.DefaultRequestHeaders.Add(TestAuthHandler.ScopeHeader, scope);
        return client;
    }

    public async Task InitializeAsync()
    {
        await _sql.StartAsync();
        await Services.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _sql.DisposeAsync();
        if (Directory.Exists(PhotoPath))
        {
            Directory.Delete(PhotoPath, recursive: true);
        }
    }
}
