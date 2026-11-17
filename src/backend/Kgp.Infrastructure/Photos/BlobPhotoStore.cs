using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Kgp.Infrastructure.Photos;

/// <summary>
/// Photos in the private <c>conquest-photos</c> container, accessed with the app's managed identity
/// (DefaultAzureCredential picks the user-assigned identity from AZURE_CLIENT_ID). No keys, no SAS.
/// The container is created by infra (infra/modules/storage.bicep).
/// </summary>
public sealed class BlobPhotoStore(BlobContainerClient container) : IPhotoStore
{
    public async Task SaveAsync(string name, byte[] content, CancellationToken ct) =>
        await container.GetBlobClient(name).UploadAsync(
            new BinaryData(content),
            new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = "image/jpeg" } },
            ct);

    public async Task<Stream?> OpenReadAsync(string name, CancellationToken ct)
    {
        try
        {
            var download = await container.GetBlobClient(name).DownloadStreamingAsync(cancellationToken: ct);
            return download.Value.Content;
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task DeleteAsync(string name, CancellationToken ct) =>
        await container.GetBlobClient(name).DeleteIfExistsAsync(DeleteSnapshotsOption.IncludeSnapshots, cancellationToken: ct);
}
