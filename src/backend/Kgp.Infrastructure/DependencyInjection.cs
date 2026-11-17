using Kgp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Kgp.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddKgpInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<KgpDbContext>(options =>
            options.UseSqlServer(configuration.GetConnectionString("Kgp"), sql =>
            {
                sql.UseNetTopologySuite();
                // Serverless Azure SQL resumes from auto-pause in up to ~1 minute.
                sql.EnableRetryOnFailure(maxRetryCount: 6, maxRetryDelay: TimeSpan.FromSeconds(20), errorNumbersToAdd: null);
            }));

        services.Configure<DatabaseOptions>(configuration.GetSection("Database"));
        services.AddSingleton<DatabaseInitializer>();
        services.AddHostedService<DatabaseInitializerService>();

        return services;
    }
}
