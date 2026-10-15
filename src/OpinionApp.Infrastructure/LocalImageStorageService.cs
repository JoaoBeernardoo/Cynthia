using OpinionApp.Application;

namespace OpinionApp.Infrastructure;

public sealed class LocalImageStorageService : IImageStorageService
{
    private readonly string directory;

    public LocalImageStorageService(string contentRootPath)
    {
        directory = Path.Combine(contentRootPath, "App_Data", "profile-photos");
        Directory.CreateDirectory(directory);
    }

    public async Task<string> SaveProfilePhotoAsync(
        string extension,
        Stream content,
        CancellationToken cancellationToken)
    {
        var fileName = $"{Guid.NewGuid():N}{extension}";
        var destination = GetFullPath(fileName);
        await using var output = new FileStream(
            destination, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous);
        await content.CopyToAsync(output, cancellationToken);
        return fileName;
    }

    public Task<Stream?> OpenProfilePhotoAsync(string fileName, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = GetFullPath(fileName);
        Stream? stream = File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, FileOptions.Asynchronous)
            : null;
        return Task.FromResult(stream);
    }

    public Task DeleteProfilePhotoAsync(string fileName, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = GetFullPath(fileName);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    private string GetFullPath(string fileName)
    {
        if (Path.GetFileName(fileName) != fileName || !Guid.TryParseExact(Path.GetFileNameWithoutExtension(fileName), "N", out _))
        {
            throw new ArgumentException("Invalid profile image identifier.", nameof(fileName));
        }

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (extension is not (".jpg" or ".png" or ".webp"))
        {
            throw new ArgumentException("Unsupported profile image format.", nameof(fileName));
        }

        return Path.Combine(directory, fileName);
    }
}
