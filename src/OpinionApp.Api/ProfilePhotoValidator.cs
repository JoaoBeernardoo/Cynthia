namespace OpinionApp.Api;

internal static class ProfilePhotoValidator
{
    public const long MaximumBytes = 5 * 1024 * 1024;

    public static async Task<string?> ValidateAsync(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 or > MaximumBytes)
        {
            return null;
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (extension == ".jpeg") extension = ".jpg";
        await using var stream = file.OpenReadStream();
        var header = new byte[12];
        var count = await stream.ReadAsync(header, cancellationToken);
        var detectedExtension = count >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF
            ? ".jpg"
            : count >= 8 && header.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })
                ? ".png"
                : count >= 12 && header.AsSpan(0, 4).SequenceEqual("RIFF"u8)
                    && header.AsSpan(8, 4).SequenceEqual("WEBP"u8)
                    ? ".webp"
                    : null;
        var expectedContentType = detectedExtension switch
        {
            ".jpg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => null
        };

        return detectedExtension == extension
            && string.Equals(file.ContentType, expectedContentType, StringComparison.OrdinalIgnoreCase)
            ? detectedExtension
            : null;
    }
}
