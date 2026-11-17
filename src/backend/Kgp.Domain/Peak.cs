using NetTopologySuite.Geometries;

namespace Kgp.Domain;

/// <summary>One of the 28 Korona Gór Polski peaks. Seeded from /data/peaks.json; not edited by users.</summary>
public sealed class Peak
{
    /// <summary>Official KGP number (01–28, ascending by height). Primary key.</summary>
    public int Number { get; set; }
    public required string Slug { get; set; }
    public required string Name { get; set; }
    public required string Range { get; set; }
    /// <summary>Height in metres a.s.l. as given by kgp.info.pl.</summary>
    public int HeightMeters { get; set; }
    /// <summary>Summit position, WGS84 (SRID 4326). X = longitude, Y = latitude.</summary>
    public Point? Location { get; set; }
    /// <summary>Known disputes about the peak (e.g. a higher summit elsewhere in the range), in Polish.</summary>
    public string? NotesPl { get; set; }
    /// <summary>Same as <see cref="NotesPl"/>, in English.</summary>
    public string? NotesEn { get; set; }
    public List<string> Sources { get; set; } = [];
}
