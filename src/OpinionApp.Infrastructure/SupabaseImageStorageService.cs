using Amazon.S3;
using Amazon.S3.Model;
using OpinionApp.Application;

namespace OpinionApp.Infrastructure;

public sealed class SupabaseStorageOptions
{
    public string Endpoint { get; set; } = "";
    public string Bucket { get; set; } = "";
    public string Region { get; set; } = "us-east-1";
    public string AccessKey { get; set; } = "";
    public string SecretKey { get; set; } = "";

    public bool HasAnyCredential =>
        !string.IsNullOrWhiteSpace(Endpoint)
        || !string.IsNullOrWhiteSpace(Bucket)
        || !string.IsNullOrWhiteSpace(AccessKey)
        || !string.IsNullOrWhiteSpace(SecretKey);

    public bool IsComplete =>
        !string.IsNullOrWhiteSpace(Endpoint)
        && !string.IsNullOrWhiteSpace(Bucket)
        && !string.IsNullOrWhiteSpace(Region)
        && !string.IsNullOrWhiteSpace(AccessKey)
        && !string.IsNullOrWhiteSpace(SecretKey);
}

public sealed class SupabaseImageStorageService : IImageStorageService, IDisposable
{
    private readonly AmazonS3Client client;
    private readonly string bucket;
    private readonly Uri publicBucketUri;

    public SupabaseImageStorageService(SupabaseStorageOptions options)
    {
        if (!Uri.TryCreate(options.Endpoint, UriKind.Absolute, out var endpoint)
            || endpoint.Scheme != Uri.UriSchemeHttps
            || !endpoint.AbsolutePath.TrimEnd('/').EndsWith("/storage/v1/s3", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "SupabaseStorage:Endpoint must be the HTTPS Supabase S3 endpoint ending in /storage/v1/s3.");
        }

        bucket = options.Bucket;
        var publicPath = $"/storage/v1/object/public/{Uri.EscapeDataString(bucket)}/";
        var publicUriBuilder = new UriBuilder(endpoint) { Path = publicPath, Query = "", Fragment = "" };
        const string storageHostSuffix = ".storage.supabase.co";
        if (endpoint.Host.EndsWith(storageHostSuffix, StringComparison.OrdinalIgnoreCase))
        {
            publicUriBuilder.Host = endpoint.Host[..^storageHostSuffix.Length] + ".supabase.co";
        }
        publicBucketUri = publicUriBuilder.Uri;
        client = new AmazonS3Client(
            options.AccessKey,
            options.SecretKey,
            new AmazonS3Config
            {
                ServiceURL = endpoint.ToString().TrimEnd('/'),
                ForcePathStyle = true,
                AuthenticationRegion = options.Region
            });
    }

    public async Task<string> SaveProfilePhotoAsync(
        string extension,
        Stream content,
        CancellationToken cancellationToken)
    {
        var fileName = $"{Guid.NewGuid():N}{extension}";
        await SaveAsync($"profile-photos/{fileName}", content, cancellationToken);
        return fileName;
    }

    public async Task<Stream?> OpenProfilePhotoAsync(string fileName, CancellationToken cancellationToken) =>
        await OpenAsync($"profile-photos/{ValidateFileName(fileName)}", cancellationToken);

    public async Task DeleteProfilePhotoAsync(string fileName, CancellationToken cancellationToken) =>
        await client.DeleteObjectAsync(bucket, $"profile-photos/{ValidateFileName(fileName)}", cancellationToken);

    public async Task<string> SavePostPhotoAsync(
        string extension,
        Stream content,
        CancellationToken cancellationToken)
    {
        var fileName = $"{Guid.NewGuid():N}{extension}";
        await SaveAsync($"post-photos/{fileName}", content, cancellationToken);
        return new Uri(publicBucketUri, $"post-photos/{fileName}").ToString();
    }

    public async Task<Stream?> OpenPostPhotoAsync(string fileName, CancellationToken cancellationToken) =>
        await OpenAsync($"post-photos/{ValidateFileName(fileName)}", cancellationToken);

    public async Task DeletePostPhotoAsync(string photoUrl, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(photoUrl, UriKind.Absolute, out var imageUri)
            || !string.Equals(imageUri.GetLeftPart(UriPartial.Authority), publicBucketUri.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase)
            || !imageUri.AbsolutePath.StartsWith(publicBucketUri.AbsolutePath, StringComparison.Ordinal))
        {
            throw new ArgumentException("Invalid post photo URL.", nameof(photoUrl));
        }

        var fileName = Uri.UnescapeDataString(imageUri.AbsolutePath[publicBucketUri.AbsolutePath.Length..]);
        await client.DeleteObjectAsync(bucket, $"post-photos/{ValidateFileName(fileName)}", cancellationToken);
    }

    public void Dispose() => client.Dispose();

    private async Task SaveAsync(string key, Stream content, CancellationToken cancellationToken)
    {
        await client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = bucket,
            Key = key,
            InputStream = content,
            ContentType = ContentTypeFromExtension(Path.GetExtension(key))
        }, cancellationToken);
    }

    private async Task<Stream?> OpenAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            var response = await client.GetObjectAsync(bucket, key, cancellationToken);
            return response.ResponseStream;
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    private static string ValidateFileName(string fileName)
    {
        if (Path.GetFileName(fileName) != fileName
            || !Guid.TryParseExact(Path.GetFileNameWithoutExtension(fileName), "N", out _)
            || Path.GetExtension(fileName).ToLowerInvariant() is not (".jpg" or ".png" or ".webp"))
        {
            throw new ArgumentException("Invalid image identifier.", nameof(fileName));
        }

        return fileName;
    }

    private static string ContentTypeFromExtension(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        _ => throw new ArgumentException("Unsupported image format.", nameof(extension))
    };
}
