using ImageMagick;
using Kgp.Infrastructure.Photos;

namespace Kgp.Tests;

public class PhotoProcessorTests
{
    [Fact]
    public void Detects_only_jpeg_png_and_heic_from_bytes()
    {
        Assert.Equal(MagickFormat.Jpeg, PhotoProcessor.DetectFormat([0xFF, 0xD8, 0xFF, 0xE0]));
        Assert.Equal(MagickFormat.Png, PhotoProcessor.DetectFormat([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
        Assert.Equal(MagickFormat.Heic, PhotoProcessor.DetectFormat([0, 0, 0, 0x18, .."ftypheic"u8, 0, 0, 0, 0]));
        Assert.Null(PhotoProcessor.DetectFormat("GIF89a"u8));
        Assert.Null(PhotoProcessor.DetectFormat("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"u8));
        Assert.Null(PhotoProcessor.DetectFormat([0, 0, 0, 0x18, .."ftypisom"u8]));
        Assert.Null(PhotoProcessor.DetectFormat([]));
    }

    [Fact]
    public void Strips_gps_keeps_capture_time_and_limits_size()
    {
        var photo = PhotoProcessor.TryProcess(TestImages.JpegWithGps(4000, 1000));

        Assert.NotNull(photo);
        Assert.Equal(new DateTime(2025, 8, 14, 11, 42, 10), photo.TakenAt);
        using var image = new MagickImage(photo.Jpeg);
        Assert.Null(image.GetExifProfile());
        Assert.Equal(2048u, Math.Max(image.Width, image.Height));
    }

    [Fact]
    public void Rejects_images_larger_than_12000_px_before_decoding()
    {
        // Only a header claiming 12001×10 px; ImageMagick's width limit must refuse it.
        // (Can't build it with Magick.NET: the process-wide limit would refuse that too.)
        Assert.Null(PhotoProcessor.TryProcess(PngHeader(12_001, 10)));
        Assert.Equal(12_000ul, (ulong)ResourceLimits.Width);
        Assert.Equal(12_000ul, (ulong)ResourceLimits.Height);
    }

    private static byte[] PngHeader(uint width, uint height)
    {
        var ihdr = new byte[17];
        "IHDR"u8.CopyTo(ihdr);
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(ihdr.AsSpan(4), width);
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(ihdr.AsSpan(8), height);
        ihdr[12] = 8; // bit depth; colour type 0 (grey), default compression/filter/interlace

        var png = new List<byte> { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13 };
        png.AddRange(ihdr);
        var crc = new byte[4];
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(crc, Crc32(ihdr));
        png.AddRange(crc);
        png.AddRange(new byte[] { 0, 0, 0, 0, (byte)'I', (byte)'E', (byte)'N', (byte)'D', 0xAE, 0x42, 0x60, 0x82 });
        return [.. png];
    }

    private static uint Crc32(ReadOnlySpan<byte> data)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var b in data)
        {
            crc ^= b;
            for (var k = 0; k < 8; k++)
            {
                crc = (crc & 1) != 0 ? 0xEDB88320u ^ (crc >> 1) : crc >> 1;
            }
        }

        return ~crc;
    }

    [Fact]
    public void Rejects_a_png_header_with_garbage()
    {
        Assert.Null(PhotoProcessor.TryProcess([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4]));
    }
}
