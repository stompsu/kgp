using System.Net;
using Kgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Kgp.Tests;

[Trait("Category", "Integration")]
[Collection(PeaksCollection.Name)]
public class ReadinessTests(KgpApiFactory factory)
{
    [Theory]
    [InlineData("/api/peaks")]
    [InlineData("/api/peaks/rysy/trails")]
    public async Task Peak_data_answers_503_until_initialized_and_the_503_is_not_cached(string url)
    {
        var readiness = new DatabaseReadiness();
        await using var app = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services =>
        {
            // Not ready, and no startup initializer to mark it ready: the state while seeding runs.
            services.AddSingleton(readiness);
            services.RemoveAll<IHostedService>(d => d.ImplementationType?.Name == "DatabaseInitializerService");
        }));
        var client = app.CreateClient();

        var starting = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, starting.StatusCode);
        Assert.Equal("5", starting.Headers.RetryAfter?.ToString());

        readiness.MarkReady();

        var ready = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
    }
}

internal static class ServiceCollectionTestExtensions
{
    public static void RemoveAll<T>(this IServiceCollection services, Func<ServiceDescriptor, bool> match)
    {
        foreach (var d in services.Where(d => d.ServiceType == typeof(T) && match(d)).ToList())
        {
            services.Remove(d);
        }
    }
}
