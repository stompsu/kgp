using ImageMagick;

namespace Kgp.Tests;

/// <summary>Test photos generated in code, so no binaries are committed.</summary>
public static class TestImages
{
    public const string TakenAtExif = "2025:08:14 11:42:10";

    /// <summary>A JPEG with GPS coordinates (Rysy), a capture time, and an EXIF orientation of 90° clockwise.</summary>
    public static byte[] JpegWithGps(uint width = 3000, uint height = 2000)
    {
        using var image = new MagickImage(MagickColors.SkyBlue, width, height);
        image.Orientation = Orientation.RightTop;

        var exif = new ExifProfile();
        exif.SetValue(ExifTag.GPSLatitudeRef, "N");
        exif.SetValue(ExifTag.GPSLatitude, [new Rational(49, 1), new Rational(10, 1), new Rational(4646, 100)]);
        exif.SetValue(ExifTag.GPSLongitudeRef, "E");
        exif.SetValue(ExifTag.GPSLongitude, [new Rational(20, 1), new Rational(5, 1), new Rational(1720, 100)]);
        exif.SetValue(ExifTag.DateTimeOriginal, TakenAtExif);
        exif.SetValue(ExifTag.Orientation, (ushort)6);
        image.SetProfile(exif);

        return image.ToByteArray(MagickFormat.Jpeg);
    }

    /// <summary>A small PNG with transparency.</summary>
    public static byte[] PngWithAlpha()
    {
        using var image = new MagickImage(MagickColors.Transparent, 300, 200);
        return image.ToByteArray(MagickFormat.Png);
    }
}
