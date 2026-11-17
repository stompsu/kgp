using Kgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;

namespace Kgp.Tests;

/// <summary>API backed by a throwaway SQL Server container (needs Docker), migrated and seeded once per test class.</summary>
public sealed class KgpApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly MsSqlContainer _sql = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Kgp", _sql.GetConnectionString());
        builder.UseSetting("Database:InitializeOnStartup", "false");
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
    }
}
