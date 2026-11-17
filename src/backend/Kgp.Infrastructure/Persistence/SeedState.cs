namespace Kgp.Infrastructure.Persistence;

/// <summary>Content hash of a seed file last applied, so restarts skip unchanged files.</summary>
public sealed class SeedState
{
    /// <summary>Seed file name, e.g. <c>parking.geojson</c>.</summary>
    public required string Name { get; set; }
    /// <summary>SHA-256 of the file content, hex.</summary>
    public required string ContentHash { get; set; }
    public DateTimeOffset AppliedAt { get; set; }
}
