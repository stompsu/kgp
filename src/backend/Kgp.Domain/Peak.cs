namespace Kgp.Domain;

/// <summary>One of the 28 Korona Gór Polski peaks. Populated from /data/peaks.json.</summary>
public sealed record Peak(
    int Number,
    string Slug,
    string Name,
    string Range,
    int HeightMeters,
    double? Latitude,
    double? Longitude);
