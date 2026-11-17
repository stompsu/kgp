using NetTopologySuite.Geometries;

namespace Kgp.Domain;

/// <summary>A parking near a peak, imported from OpenStreetMap (data/osm/parking.geojson). Read-only.</summary>
public sealed class Parking
{
    public int Id { get; set; }
    public int PeakNumber { get; set; }
    public Peak? Peak { get; set; }
    /// <summary>OSM object id, e.g. <c>way/123456</c>. Unique per peak.</summary>
    public required string OsmId { get; set; }
    public string? Name { get; set; }
    /// <summary>true/false from the OSM <c>fee</c> tag; null = unknown.</summary>
    public bool? Fee { get; set; }
    /// <summary>Null = unknown.</summary>
    public int? Capacity { get; set; }
    /// <summary>Straight-line distance to the summit, not a walking distance.</summary>
    public int DistanceMeters { get; set; }
    /// <summary>WGS84 (SRID 4326); areas are represented by their centre.</summary>
    public required Point Location { get; set; }
}
