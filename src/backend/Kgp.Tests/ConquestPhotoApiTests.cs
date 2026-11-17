using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ImageMagick;
using Kgp.Api.Conquests;

namespace Kgp.Tests;

[Trait("Category", "Integration")]
[Collection(ConquestsCollection.Name)]
public class ConquestPhotoApiTests(KgpApiFactory factory)
{
    internal static Task<HttpResponseMessage> PutPhoto(HttpClient client, string slug, byte[] data, string fileName = "photo.jpg", string contentType = "image/jpeg")
    {
        var file = new ByteArrayContent(data);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        var form = new MultipartFormDataContent { { file, "file", fileName } };
        return client.PutAsync($"/api/me/conquests/{slug}/photo", form);
    }

    private async Task<HttpClient> ClientWithConquest(string slug = "rysy")
    {
        var client = factory.CreateClientFor(Guid.NewGuid());
        var response = await ConquestsApiTests.PutConquest(client, slug, new { conqueredOn = "2025-08-14" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return client;
    }

    private string StoredFile(Guid userId, int peakNumber) =>
        Assert.Single(Directory.GetFiles(Path.Combine(factory.PhotoStore.RootPath, userId.ToString(), peakNumber.ToString())));

    [Fact]
    public async Task Upload_strips_metadata_auto_orients_and_resizes()
    {
        var userId = Guid.NewGuid();
        var client = factory.CreateClientFor(userId);
        await ConquestsApiTests.PutConquest(client, "rysy", new { conqueredOn = "2025-08-14" });

        var response = await PutPhoto(client, "rysy", TestImages.JpegWithGps());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = (await response.Content.ReadFromJsonAsync<ConquestDto>())!;
        Assert.True(dto.HasPhoto);
        Assert.Equal(new DateTime(2025, 8, 14, 11, 42, 10), dto.PhotoTakenAt);
        Assert.Contains("\"photoTakenAt\":\"2025-08-14T11:42:10\"", await response.Content.ReadAsStringAsync());

        // What is stored: the only copy that exists.
        var stored = await File.ReadAllBytesAsync(StoredFile(userId, 28));
        using (var image = new MagickImage(stored))
        {
            Assert.Equal(MagickFormat.Jpeg, image.Format);
            Assert.Null(image.GetExifProfile());
            Assert.Null(image.GetXmpProfile());
            Assert.Null(image.GetIptcProfile());
            // 3000×2000 rotated 90° by EXIF orientation → portrait, long edge 2048.
            Assert.Equal(2048u, image.Height);
            Assert.InRange(image.Width, 1364u, 1366u);
        }

        Assert.DoesNotContain("GPS", System.Text.Encoding.ASCII.GetString(stored));

        // What is served: the same bytes, private caching.
        var photo = await client.GetAsync("/api/me/conquests/rysy/photo");
        Assert.Equal(HttpStatusCode.OK, photo.StatusCode);
        Assert.Equal("image/jpeg", photo.Content.Headers.ContentType?.MediaType);
        Assert.True(photo.Headers.CacheControl?.Private);
        Assert.Equal(TimeSpan.FromHours(1), photo.Headers.CacheControl?.MaxAge);
        Assert.False(photo.Headers.CacheControl?.Public);
        Assert.Equal(stored, await photo.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Small_images_are_not_upscaled_and_png_becomes_jpeg()
    {
        var userId = Guid.NewGuid();
        var client = factory.CreateClientFor(userId);
        await ConquestsApiTests.PutConquest(client, "sniezka", new { conqueredOn = "2025-08-14" });

        var response = await PutPhoto(client, "sniezka", TestImages.PngWithAlpha(), "photo.png", "image/png");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null((await response.Content.ReadFromJsonAsync<ConquestDto>())!.PhotoTakenAt);
        using var image = new MagickImage(StoredFile(userId, 26));
        Assert.Equal(MagickFormat.Jpeg, image.Format);
        Assert.Equal(300u, image.Width);
        Assert.Equal(200u, image.Height);
    }

    [Fact]
    public async Task Over_15_MB_returns_413()
    {
        var client = await ClientWithConquest();
        var data = new byte[15 * 1024 * 1024 + 1];
        data[0] = 0xFF; data[1] = 0xD8; data[2] = 0xFF;

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await PutPhoto(client, "rysy", data)).StatusCode);

        var tooBig = new byte[20 * 1024 * 1024];
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await PutPhoto(client, "rysy", tooBig)).StatusCode);
    }

    [Fact]
    public async Task Text_file_named_jpg_returns_415()
    {
        var client = await ClientWithConquest();

        var response = await PutPhoto(client, "rysy", "To nie jest zdjęcie."u8.ToArray());

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        var list = await client.GetFromJsonAsync<List<ConquestDto>>("/api/me/conquests");
        Assert.False(list!.Single().HasPhoto);
    }

    [Fact]
    public async Task Truncated_jpeg_returns_415()
    {
        var client = await ClientWithConquest();

        var response = await PutPhoto(client, "rysy", TestImages.JpegWithGps(400, 300)[..200]);

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
    }

    [Fact]
    public async Task Photo_without_a_conquest_returns_404()
    {
        var client = factory.CreateClientFor(Guid.NewGuid());

        Assert.Equal(HttpStatusCode.NotFound, (await PutPhoto(client, "rysy", TestImages.JpegWithGps(400, 300))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PutPhoto(client, "giewont", TestImages.JpegWithGps(400, 300))).StatusCode);
    }

    [Fact]
    public async Task New_upload_replaces_and_deletes_the_old_photo()
    {
        var userId = Guid.NewGuid();
        var client = factory.CreateClientFor(userId);
        await ConquestsApiTests.PutConquest(client, "rysy", new { conqueredOn = "2025-08-14" });

        await PutPhoto(client, "rysy", TestImages.JpegWithGps(400, 300));
        var first = StoredFile(userId, 28);
        await PutPhoto(client, "rysy", TestImages.JpegWithGps(500, 300));
        var second = StoredFile(userId, 28);

        Assert.NotEqual(first, second);
        Assert.False(File.Exists(first));
    }

    [Fact]
    public async Task Deleting_the_photo_keeps_the_conquest()
    {
        var userId = Guid.NewGuid();
        var client = factory.CreateClientFor(userId);
        await ConquestsApiTests.PutConquest(client, "rysy", new { conqueredOn = "2025-08-14" });
        await PutPhoto(client, "rysy", TestImages.JpegWithGps(400, 300));
        var file = StoredFile(userId, 28);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/me/conquests/rysy/photo")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync("/api/me/conquests/rysy/photo")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/me/conquests/rysy/photo")).StatusCode);

        Assert.False(File.Exists(file));
        var conquest = (await client.GetFromJsonAsync<List<ConquestDto>>("/api/me/conquests"))!.Single();
        Assert.False(conquest.HasPhoto);
        Assert.Null(conquest.PhotoTakenAt);
    }

    [Fact]
    public async Task Deleting_the_conquest_deletes_its_photo()
    {
        var userId = Guid.NewGuid();
        var client = factory.CreateClientFor(userId);
        await ConquestsApiTests.PutConquest(client, "rysy", new { conqueredOn = "2025-08-14" });
        await PutPhoto(client, "rysy", TestImages.JpegWithGps(400, 300));
        var file = StoredFile(userId, 28);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/me/conquests/rysy")).StatusCode);

        Assert.False(File.Exists(file));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/me/conquests/rysy/photo")).StatusCode);
    }
}
