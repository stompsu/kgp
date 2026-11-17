using System.Security.Claims;
using Kgp.Api.Auth;
using Kgp.Domain;
using Kgp.Infrastructure.Persistence;
using Kgp.Infrastructure.Photos;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kgp.Api.Conquests;

public sealed record ConquestRequest(DateOnly? ConqueredOn, string? Notes);

public sealed record ConquestDto(
    string PeakSlug,
    int PeakNumber,
    DateOnly ConqueredOn,
    string? Notes,
    bool HasPhoto,
    DateTime? PhotoTakenAt,
    DateTime UpdatedAt)
{
    public static ConquestDto From(Conquest c, string peakSlug) => new(
        peakSlug,
        c.PeakNumber,
        c.ConqueredOn,
        c.Notes,
        c.PhotoBlobName is not null,
        c.PhotoTakenAt is { } taken ? DateTime.SpecifyKind(taken, DateTimeKind.Unspecified) : null,
        c.UpdatedAt.UtcDateTime); // DateTimeKind.Utc serializes with a trailing "Z"
}

/// <summary>
/// The signed-in user's conquests (docs/api.md, M2). Every query filters by the caller's <c>oid</c>:
/// another user's conquest is indistinguishable from a missing one (404, never 403).
/// </summary>
public static class ConquestEndpoints
{
    /// <summary>Multipart overhead on top of the 15 MB file limit.</summary>
    private const long MaxPhotoRequestBytes = PhotoProcessor.MaxUploadBytes + 64 * 1024;

    public static IEndpointRouteBuilder MapConquestEndpoints(this IEndpointRouteBuilder app)
    {
        var conquests = app.MapGroup("/api/me/conquests")
            .WithTags("Conquests")
            .RequireAuthorization(AuthSetup.ConquestsPolicy)
            .CacheOutput(policy => policy.NoCache());

        conquests.MapGet("/", ListAsync).WithName("ListConquests");
        conquests.MapPut("/{slug}", UpsertAsync).WithName("PutConquest");
        conquests.MapDelete("/{slug}", DeleteAsync).WithName("DeleteConquest");

        conquests.MapPut("/{slug}/photo", PutPhotoAsync)
            .WithName("PutConquestPhoto")
            .Accepts<IFormFile>("multipart/form-data")
            .WithMetadata(new RequestSizeLimitAttribute(MaxPhotoRequestBytes))
            .WithFormOptions(multipartBodyLengthLimit: MaxPhotoRequestBytes)
            // Bearer-token API: no cookies, so no CSRF.
            .DisableAntiforgery();
        conquests.MapGet("/{slug}/photo", GetPhotoAsync).WithName("GetConquestPhoto");
        conquests.MapDelete("/{slug}/photo", DeletePhotoAsync).WithName("DeleteConquestPhoto");

        return app;
    }

    private static IQueryable<Conquest> OwnedBy(this KgpDbContext db, ClaimsPrincipal user)
    {
        var userId = user.GetUserId();
        return db.Conquests.Where(c => c.UserId == userId);
    }

    private static Task<Conquest?> FindAsync(KgpDbContext db, ClaimsPrincipal user, string slug, CancellationToken ct) =>
        db.OwnedBy(user).SingleOrDefaultAsync(c => c.Peak!.Slug == slug, ct);

    private static async Task<Ok<List<ConquestDto>>> ListAsync(ClaimsPrincipal user, KgpDbContext db, CancellationToken ct)
    {
        var rows = await db.OwnedBy(user)
            .AsNoTracking()
            .OrderBy(c => c.PeakNumber)
            .Select(c => new { Conquest = c, c.Peak!.Slug })
            .ToListAsync(ct);

        return TypedResults.Ok(rows.Select(r => ConquestDto.From(r.Conquest, r.Slug)).ToList());
    }

    private static async Task<Results<Created<ConquestDto>, Ok<ConquestDto>, NotFound, ValidationProblem>> UpsertAsync(
        string slug, ConquestRequest request, ClaimsPrincipal user, KgpDbContext db, TimeProvider time, CancellationToken ct)
    {
        var peak = await db.Peaks.AsNoTracking().SingleOrDefaultAsync(p => p.Slug == slug, ct);
        if (peak is null)
        {
            return TypedResults.NotFound();
        }

        var notes = ConquestRules.NormalizeNotes(request.Notes);
        var errors = ConquestRules.Validate(request.ConqueredOn, notes, ConquestRules.TodayInPoland(time));
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var now = time.GetUtcNow();
        var conquest = await db.OwnedBy(user).SingleOrDefaultAsync(c => c.PeakNumber == peak.Number, ct);
        var created = conquest is null;
        if (conquest is null)
        {
            conquest = new Conquest
            {
                Id = Guid.NewGuid(),
                UserId = user.GetUserId(),
                PeakNumber = peak.Number,
                CreatedAt = now,
            };
            db.Conquests.Add(conquest);
        }

        conquest.ConqueredOn = request.ConqueredOn!.Value;
        conquest.Notes = notes;
        conquest.UpdatedAt = now;
        await db.SaveChangesAsync(ct);

        var dto = ConquestDto.From(conquest, peak.Slug);
        return created ? TypedResults.Created($"/api/me/conquests/{peak.Slug}", dto) : TypedResults.Ok(dto);
    }

    private static async Task<Results<NoContent, NotFound>> DeleteAsync(
        string slug, ClaimsPrincipal user, KgpDbContext db, IPhotoStore photos, CancellationToken ct)
    {
        var conquest = await FindAsync(db, user, slug, ct);
        if (conquest is null)
        {
            return TypedResults.NotFound();
        }

        // Photo first (privacy): if this fails the record survives and the user can retry.
        if (conquest.PhotoBlobName is { } blob)
        {
            await photos.DeleteAsync(blob, ct);
        }

        db.Conquests.Remove(conquest);
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    private static async Task<IResult> PutPhotoAsync(
        string slug, HttpRequest request, ClaimsPrincipal user, KgpDbContext db, IPhotoStore photos,
        TimeProvider time, ILoggerFactory loggers, CancellationToken ct)
    {
        var conquest = await FindAsync(db, user, slug, ct);
        if (conquest is null)
        {
            return TypedResults.NotFound();
        }

        if (!request.HasFormContentType)
        {
            return UnsupportedPhoto();
        }

        if (request.ContentLength > MaxPhotoRequestBytes)
        {
            return PhotoTooLarge();
        }

        IFormCollection form;
        try
        {
            form = await request.ReadFormAsync(ct);
        }
        catch (BadHttpRequestException ex) when (ex.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return PhotoTooLarge();
        }
        catch (InvalidDataException)
        {
            // FormOptions limits (multipart body length) surface as InvalidDataException.
            return PhotoTooLarge();
        }

        if (form.Files.GetFile("file") is not { } file)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["file"] = ["Brak pliku w polu „file”. / No file in the \"file\" field."],
            });
        }

        if (file.Length > PhotoProcessor.MaxUploadBytes)
        {
            return PhotoTooLarge();
        }

        byte[] data;
        await using (var stream = file.OpenReadStream())
        {
            data = new byte[file.Length];
            await stream.ReadExactlyAsync(data, ct);
        }

        if (PhotoProcessor.TryProcess(data) is not { } photo)
        {
            return UnsupportedPhoto();
        }

        var newBlob = $"{conquest.UserId}/{conquest.PeakNumber}/{Guid.NewGuid()}.jpg";
        await photos.SaveAsync(newBlob, photo.Jpeg, ct);

        var oldBlob = conquest.PhotoBlobName;
        conquest.PhotoBlobName = newBlob;
        conquest.PhotoTakenAt = photo.TakenAt;
        conquest.UpdatedAt = time.GetUtcNow();
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await photos.DeleteAsync(newBlob, CancellationToken.None);
            throw;
        }

        // Only after the record points at the new photo, so a failure never leaves it without one.
        if (oldBlob is not null)
        {
            try
            {
                await photos.DeleteAsync(oldBlob, CancellationToken.None);
            }
            catch (Exception ex)
            {
                loggers.CreateLogger(typeof(ConquestEndpoints)).LogError(ex, "Could not delete replaced photo {Blob}", oldBlob);
            }
        }

        return TypedResults.Ok(ConquestDto.From(conquest, slug));
    }

    private static async Task<IResult> GetPhotoAsync(
        string slug, ClaimsPrincipal user, KgpDbContext db, IPhotoStore photos, HttpResponse response, CancellationToken ct)
    {
        var blob = await db.OwnedBy(user)
            .Where(c => c.Peak!.Slug == slug)
            .Select(c => c.PhotoBlobName)
            .SingleOrDefaultAsync(ct);
        if (blob is null || await photos.OpenReadAsync(blob, ct) is not { } stream)
        {
            return TypedResults.NotFound();
        }

        response.Headers.CacheControl = "private, max-age=3600";
        return TypedResults.Stream(stream, "image/jpeg");
    }

    private static async Task<Results<NoContent, NotFound>> DeletePhotoAsync(
        string slug, ClaimsPrincipal user, KgpDbContext db, IPhotoStore photos, TimeProvider time, CancellationToken ct)
    {
        var conquest = await FindAsync(db, user, slug, ct);
        if (conquest?.PhotoBlobName is not { } blob)
        {
            return TypedResults.NotFound();
        }

        await photos.DeleteAsync(blob, ct);
        conquest.PhotoBlobName = null;
        conquest.PhotoTakenAt = null;
        conquest.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    private static ProblemHttpResult PhotoTooLarge() => TypedResults.Problem(
        statusCode: StatusCodes.Status413PayloadTooLarge,
        title: "Zdjęcie jest za duże (maks. 15 MB). / The photo is too large (max 15 MB).");

    private static ProblemHttpResult UnsupportedPhoto() => TypedResults.Problem(
        statusCode: StatusCodes.Status415UnsupportedMediaType,
        title: "Obsługiwane formaty: JPEG, PNG, HEIC. / Supported formats: JPEG, PNG, HEIC.");
}
