using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Kgp.Api.Conquests;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Kgp.Tests;

[CollectionDefinition(Name)]
public sealed class ConquestsCollection : ICollectionFixture<KgpApiFactory>
{
    public const string Name = "Conquests API";
}

[Trait("Category", "Integration")]
[Collection(ConquestsCollection.Name)]
public class ConquestsApiTests(KgpApiFactory factory)
{
    private static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

    internal static Task<HttpResponseMessage> PutConquest(HttpClient client, string slug, object body) =>
        client.PutAsJsonAsync($"/api/me/conquests/{slug}", body);

    [Fact]
    public async Task Without_a_user_every_endpoint_returns_401()
    {
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/me/conquests")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await PutConquest(client, "rysy", new { conqueredOn = "2025-08-14" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.DeleteAsync("/api/me/conquests/rysy")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/me/conquests/rysy/photo")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.DeleteAsync("/api/me/conquests/rysy/photo")).StatusCode);
    }

    [Fact]
    public async Task Without_the_scope_returns_403()
    {
        var client = factory.CreateClientFor(Guid.NewGuid(), scope: "openid profile");

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/me/conquests")).StatusCode);
    }

    [Fact]
    public async Task Create_update_list_delete()
    {
        var client = factory.CreateClientFor(Guid.NewGuid());

        var created = await PutConquest(client, "rysy", new { conqueredOn = "2025-08-14", notes = "  Od Morskiego Oka.  " });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var dto = (await created.Content.ReadFromJsonAsync<ConquestDto>())!;
        Assert.Equal("rysy", dto.PeakSlug);
        Assert.Equal(28, dto.PeakNumber);
        Assert.Equal(new DateOnly(2025, 8, 14), dto.ConqueredOn);
        Assert.Equal("Od Morskiego Oka.", dto.Notes);
        Assert.False(dto.HasPhoto);
        Assert.Null(dto.PhotoTakenAt);

        // JSON shape per docs/api.md: camelCase, date-only, UTC with Z.
        var json = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("2025-08-14", json.GetProperty("conqueredOn").GetString());
        Assert.EndsWith("Z", json.GetProperty("updatedAt").GetString());
        Assert.Equal(JsonValueKind.Null, json.GetProperty("photoTakenAt").ValueKind);

        var updated = await PutConquest(client, "rysy", new { conqueredOn = "2025-08-15", notes = "" });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var updatedDto = (await updated.Content.ReadFromJsonAsync<ConquestDto>())!;
        Assert.Equal(new DateOnly(2025, 8, 15), updatedDto.ConqueredOn);
        Assert.Null(updatedDto.Notes);
        Assert.True(updatedDto.UpdatedAt >= dto.UpdatedAt);

        Assert.Equal(HttpStatusCode.Created, (await PutConquest(client, "sniezka", new { conqueredOn = "2024-06-01" })).StatusCode);

        var list = await client.GetFromJsonAsync<List<ConquestDto>>("/api/me/conquests");
        Assert.Equal(["sniezka", "rysy"], list!.Select(c => c.PeakSlug)); // by peak number: 26, 28

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/me/conquests/rysy")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync("/api/me/conquests/rysy")).StatusCode);

        list = await client.GetFromJsonAsync<List<ConquestDto>>("/api/me/conquests");
        Assert.Equal(["sniezka"], list!.Select(c => c.PeakSlug));
    }

    [Fact]
    public async Task List_responses_are_not_output_cached()
    {
        var client = factory.CreateClientFor(Guid.NewGuid());

        Assert.Empty((await client.GetFromJsonAsync<List<ConquestDto>>("/api/me/conquests"))!);
        await PutConquest(client, "rysy", new { conqueredOn = "2025-08-14" });
        Assert.Single((await client.GetFromJsonAsync<List<ConquestDto>>("/api/me/conquests"))!);
    }

    [Fact]
    public async Task Future_date_is_a_validation_problem()
    {
        var client = factory.CreateClientFor(Guid.NewGuid());

        var response = await PutConquest(client, "rysy", new { conqueredOn = Today.AddDays(2).ToString("yyyy-MM-dd") });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var errors = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("errors");
        Assert.True(errors.TryGetProperty("conqueredOn", out _));
    }

    [Fact]
    public async Task Missing_date_and_too_long_notes_are_validation_problems()
    {
        var client = factory.CreateClientFor(Guid.NewGuid());

        var response = await PutConquest(client, "rysy", new { notes = new string('x', 2001) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("errors");
        Assert.True(errors.TryGetProperty("conqueredOn", out _));
        Assert.True(errors.TryGetProperty("notes", out _));
        Assert.Empty((await client.GetFromJsonAsync<List<ConquestDto>>("/api/me/conquests"))!);
    }

    [Fact]
    public async Task Unknown_slug_returns_404()
    {
        var client = factory.CreateClientFor(Guid.NewGuid());

        Assert.Equal(HttpStatusCode.NotFound, (await PutConquest(client, "giewont", new { conqueredOn = "2025-08-14" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync("/api/me/conquests/giewont")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/me/conquests/giewont/photo")).StatusCode);
    }

    [Fact]
    public async Task Another_user_cannot_read_change_or_delete_a_conquest()
    {
        var alice = factory.CreateClientFor(Guid.NewGuid());
        var bob = factory.CreateClientFor(Guid.NewGuid());

        Assert.Equal(HttpStatusCode.Created, (await PutConquest(alice, "rysy", new { conqueredOn = "2025-08-14", notes = "Alice" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ConquestPhotoApiTests.PutPhoto(alice, "rysy", TestImages.JpegWithGps(800, 600))).StatusCode);
        var before = await alice.GetFromJsonAsync<List<ConquestDto>>("/api/me/conquests");

        Assert.Empty((await bob.GetFromJsonAsync<List<ConquestDto>>("/api/me/conquests"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync("/api/me/conquests/rysy/photo")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ConquestPhotoApiTests.PutPhoto(bob, "rysy", TestImages.JpegWithGps(800, 600))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync("/api/me/conquests/rysy/photo")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync("/api/me/conquests/rysy")).StatusCode);

        // Bob's PUT is an upsert of *his own* conquest of the peak; it never touches Alice's.
        var bobs = await PutConquest(bob, "rysy", new { conqueredOn = "2020-01-01", notes = "Bob" });
        Assert.Equal(HttpStatusCode.Created, bobs.StatusCode);
        Assert.False((await bobs.Content.ReadFromJsonAsync<ConquestDto>())!.HasPhoto);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync("/api/me/conquests/rysy/photo")).StatusCode);

        var after = await alice.GetFromJsonAsync<List<ConquestDto>>("/api/me/conquests");
        Assert.Equal(before, after);
        Assert.NotNull(after);
        Assert.Equal("Alice", after.Single().Notes);
        Assert.True(after.Single().HasPhoto);
        Assert.Equal(HttpStatusCode.OK, (await alice.GetAsync("/api/me/conquests/rysy/photo")).StatusCode);
    }

    [Fact]
    public async Task When_sign_in_is_not_configured_a_bearer_token_gets_401()
    {
        // Plain app, no test auth: Auth:Authority is empty as in appsettings.json.
        using var app = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(b => b.UseSetting("Database:InitializeOnStartup", "false"));
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "eyJhbGciOiJub25lIn0.eyJvaWQiOiJ4In0.");

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/me/conquests")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }
}
