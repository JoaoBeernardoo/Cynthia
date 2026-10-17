using OpinionApp.Application;

namespace OpinionApp.Infrastructure;

public sealed class LocalImageStorageService : IImageStorageService
{
    private readonly string profilePhotoDirectory;
    private readonly string postPhotoDirectory;

    public LocalImageStorageService(string contentRootPath)
    {
        var imageDirectory = Path.Combine(contentRootPath, "App_Data");
        profilePhotoDirectory = Path.Combine(imageDirectory, "profile-photos");
        postPhotoDirectory = Path.Combine(imageDirectory, "post-photos");
        Directory.CreateDirectory(profilePhotoDirectory);
        Directory.CreateDirectory(postPhotoDirectory);
    }

    public async Task<string> SaveProfilePhotoAsync(
        string extension,
        Stream content,
        CancellationToken cancellationToken)
    {
        var fileName = $"{Guid.NewGuid():N}{extension}";
        var destination = GetFullPath(profilePhotoDirectory, fileName);
        await using var output = new FileStream(
            destination, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous);
        await content.CopyToAsync(output, cancellationToken);
        return fileName;
    }

    public Task<Stream?> OpenProfilePhotoAsync(string fileName, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = GetFullPath(profilePhotoDirectory, fileName);
        Stream? stream = File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, FileOptions.Asynchronous)
            : null;
        return Task.FromResult(stream);
    }

    public Task DeleteProfilePhotoAsync(string fileName, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = GetFullPath(profilePhotoDirectory, fileName);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    public async Task<string> SavePostPhotoAsync(
        string extension,
        Stream content,
        CancellationToken cancellationToken)
    {
        var fileName = $"{Guid.NewGuid():N}{extension}";
        var destination = GetFullPath(postPhotoDirectory, fileName);
        await using var output = new FileStream(
            destination, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous);
        await content.CopyToAsync(output, cancellationToken);
        return $"/api/posts/photos/{fileName}";
    }

    public Task<Stream?> OpenPostPhotoAsync(string fileName, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = GetFullPath(postPhotoDirectory, fileName);
        Stream? stream = File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, FileOptions.Asynchronous)
            : null;
        return Task.FromResult(stream);
    }

    public Task DeletePostPhotoAsync(string photoUrl, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        const string routePrefix = "/api/posts/photos/";
        if (!photoUrl.StartsWith(routePrefix, StringComparison.Ordinal))
        {
            throw new ArgumentException("Invalid post photo URL.", nameof(photoUrl));
        }
        var fileName = photoUrl[routePrefix.Length..];
        var path = GetFullPath(postPhotoDirectory, fileName);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    private static string GetFullPath(string directory, string fileName)
    {
        if (Path.GetFileName(fileName) != fileName || !Guid.TryParseExact(Path.GetFileNameWithoutExtension(fileName), "N", out _))
        {
            throw new ArgumentException("Invalid image identifier.", nameof(fileName));
        }

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (extension is not (".jpg" or ".png" or ".webp"))
        {
            throw new ArgumentException("Unsupported profile image format.", nameof(fileName));
        }

        return Path.Combine(directory, fileName);
    }
}
