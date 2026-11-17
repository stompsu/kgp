using NetTopologySuite.Geometries;

namespace Kgp.Domain;

/// <summary>A marked hiking route passing a peak, imported from OpenStreetMap (data/osm/trails.geojson). Read-only.</summary>
public sealed class Trail
{
    public int Id { get; set; }
    public int PeakNumber { get; set; }
    public Peak? Peak { get; set; }
    /// <summary>OSM object id, e.g. <c>relation/2149829</c>. Unique per peak.</summary>
    public required string OsmId { get; set; }
    public string? Name { get; set; }
    public string? Ref { get; set; }
    /// <summary>red, blue, green, yellow, black or null.</summary>
    public string? Colour { get; set; }
    /// <summary>iwn, nwn, rwn, lwn or null.</summary>
    public string? Network { get; set; }
    /// <summary>Position in the contract's order (network, then name), computed by the seeder.</summary>
    public int SortOrder { get; set; }
    /// <summary>WGS84 (SRID 4326) LineString or MultiLineString, clipped to 10 km around the summit.</summary>
    public required Geometry Geometry { get; set; }
}
