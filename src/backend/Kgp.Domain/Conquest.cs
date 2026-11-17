namespace Kgp.Domain;

/// <summary>
/// A user's conquest of one KGP peak. One per user and peak (ADR 0003): editing replaces the record.
/// The user is the token's <c>oid</c>; there is no user table.
/// </summary>
public sealed class Conquest
{
    public Guid Id { get; set; }
    /// <summary>The Entra External ID <c>oid</c> of the owner. Every query must filter by it.</summary>
    public Guid UserId { get; set; }
    public int PeakNumber { get; set; }
    public Peak? Peak { get; set; }
    public DateOnly ConqueredOn { get; set; }
    /// <summary>At most <see cref="ConquestRules.NotesMaxLength"/> characters, trimmed; never empty (null instead).</summary>
    public string? Notes { get; set; }
    /// <summary>Name of the processed JPEG in the photo store (<c>{userId}/{peakNumber}/{guid}.jpg</c>), or null.</summary>
    public string? PhotoBlobName { get; set; }
    /// <summary>The photo's EXIF DateTimeOriginal: camera-local time, no offset (<see cref="DateTimeKind.Unspecified"/>).</summary>
    public DateTime? PhotoTakenAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
