using Azure.Identity;
using Azure.Storage.Blobs;
using Kgp.Infrastructure.Persistence;
using Kgp.Infrastructure.Photos;
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

        services.AddKgpPhotoStore(configuration);

        return services;
    }

    /// <summary>Azure Blob with managed identity when Storage:BlobEndpoint is set; otherwise the local file system.</summary>
    private static void AddKgpPhotoStore(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection("Storage").Get<StorageOptions>() ?? new StorageOptions();

        if (!string.IsNullOrWhiteSpace(options.BlobEndpoint))
        {
            var container = new BlobServiceClient(new Uri(options.BlobEndpoint), new DefaultAzureCredential())
                .GetBlobContainerClient(options.ContainerName);
            services.AddSingleton<IPhotoStore>(new BlobPhotoStore(container));
        }
        else
        {
            var path = string.IsNullOrWhiteSpace(options.LocalPath)
                ? Path.Combine(Path.GetTempPath(), "kgp-photos")
                : options.LocalPath;
            services.AddSingleton<IPhotoStore>(new FileSystemPhotoStore(path));
        }
    }
}
