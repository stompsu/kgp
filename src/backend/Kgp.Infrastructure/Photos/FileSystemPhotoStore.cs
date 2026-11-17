namespace Kgp.Infrastructure.Photos;

/// <summary>Photos in a local folder: local development (no Storage:BlobEndpoint) and tests.</summary>
public sealed class FileSystemPhotoStore(string rootPath) : IPhotoStore
{
    private readonly string _root = Path.GetFullPath(rootPath);

    public string RootPath => _root;

    public async Task SaveAsync(string name, byte[] content, CancellationToken ct)
    {
        var path = Resolve(name);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, content, ct);
    }

    public Task<Stream?> OpenReadAsync(string name, CancellationToken ct)
    {
        var path = Resolve(name);
        return Task.FromResult<Stream?>(File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true)
            : null);
    }

    public Task DeleteAsync(string name, CancellationToken ct)
    {
        File.Delete(Resolve(name));
        return Task.CompletedTask;
    }

    /// <summary>Maps a blob-style name to a path inside the root; rejects anything that escapes it.</summary>
    public string Resolve(string name)
    {
        var path = Path.GetFullPath(Path.Combine(_root, name));
        if (!path.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            throw new ArgumentException("Invalid photo name.", nameof(name));
        }

        return path;
    }
}
