using Microsoft.AspNetCore.Identity;

namespace OpinionApp.Infrastructure;

public sealed class ApplicationUser : IdentityUser
{
    public string? Bio { get; set; }
    public string? ProfilePhotoUrl { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
