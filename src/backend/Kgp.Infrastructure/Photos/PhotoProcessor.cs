using System.Globalization;
using ImageMagick;

namespace Kgp.Infrastructure.Photos;

public sealed record ProcessedPhoto(byte[] Jpeg, DateTime? TakenAt, uint Width, uint Height);

/// <summary>
/// Turns an uploaded photo into the only form we store (ADR 0003): JPEG q85, ≤ 2048 px on the long edge,
/// auto-oriented, all metadata stripped (EXIF incl. GPS, XMP, IPTC, ICC, comments).
/// The original is never stored.
/// </summary>
public static class PhotoProcessor
{
    public const long MaxUploadBytes = 15 * 1024 * 1024;
    public const uint MaxLongEdge = 2048;
    public const uint MaxDecodedSide = 12_000;
    public const uint JpegQuality = 85;

    static PhotoProcessor()
    {
        // Decompression bombs: refuse to decode anything larger than this, before pixels are allocated.
        // These limits are process-wide; nothing else in the app uses ImageMagick.
        ResourceLimits.Width = MaxDecodedSide;
        ResourceLimits.Height = MaxDecodedSide;
    }

    /// <summary>
    /// Detects the format from the magic bytes. Only JPEG, PNG and HEIC/HEIF are accepted;
    /// the client's content type and file name are not trusted.
    /// </summary>
    public static MagickFormat? DetectFormat(ReadOnlySpan<byte> data)
    {
        if (data is [0xFF, 0xD8, 0xFF, ..])
        {
            return MagickFormat.Jpeg;
        }

        if (data is [0x89, (byte)'P', (byte)'N', (byte)'G', 0x0D, 0x0A, 0x1A, 0x0A, ..])
        {
            return MagickFormat.Png;
        }

        // ISO base media file: [size:4]["ftyp"][major brand:4]...
        if (data.Length >= 12 && data[4..8].SequenceEqual("ftyp"u8))
        {
            var brand = data[8..12];
            if (brand.SequenceEqual("heic"u8) || brand.SequenceEqual("heix"u8) ||
                brand.SequenceEqual("hevc"u8) || brand.SequenceEqual("hevx"u8) ||
                brand.SequenceEqual("heim"u8) || brand.SequenceEqual("heis"u8) ||
                brand.SequenceEqual("mif1"u8) || brand.SequenceEqual("msf1"u8))
            {
                return MagickFormat.Heic;
            }
        }

        return null;
    }

    /// <summary>Processes the upload, or returns null if it isn't a supported image or doesn't decode.</summary>
    public static ProcessedPhoto? TryProcess(byte[] data)
    {
        if (DetectFormat(data) is not { } format)
        {
            return null;
        }

        try
        {
            // Decode with the detected coder only, so ImageMagick never sniffs its way into other coders.
            using var image = new MagickImage(data, new MagickReadSettings { Format = format, FrameIndex = 0, FrameCount = 1 });

            var takenAt = ReadTakenAt(image);

            image.AutoOrient();
            if (Math.Max(image.Width, image.Height) > MaxLongEdge)
            {
                image.Resize(new MagickGeometry(MaxLongEdge, MaxLongEdge) { Greater = true });
            }

            // JPEG has no alpha: flatten transparent PNGs onto white rather than black.
            if (image.HasAlpha)
            {
                image.BackgroundColor = MagickColors.White;
                image.Alpha(AlphaAction.Remove);
            }

            image.Strip();
            image.Quality = JpegQuality;
            var jpeg = image.ToByteArray(MagickFormat.Jpeg);

            return new ProcessedPhoto(jpeg, takenAt, image.Width, image.Height);
        }
        catch (MagickException)
        {
            return null;
        }
    }

    /// <summary>EXIF DateTimeOriginal ("yyyy:MM:dd HH:mm:ss", camera-local, no offset), if present and valid.</summary>
    private static DateTime? ReadTakenAt(MagickImage image)
    {
        var value = image.GetExifProfile()?.GetValue(ExifTag.DateTimeOriginal)?.Value?.Trim('\0', ' ');
        return DateTime.TryParseExact(value, "yyyy:MM:dd HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.None, out var taken)
            ? taken
            : null;
    }
}
