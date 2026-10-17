using OpinionApp.Infrastructure;

namespace OpinionApp.Api;

internal static class SupportIdentity
{
    private const string DefaultEmail = "ccynthiaapps@gmail.com";
    public const string DisplayName = "Cynthia Suporte";

    public static string GetEmail(IConfiguration configuration) =>
        string.IsNullOrWhiteSpace(configuration["Support:Email"])
            ? DefaultEmail
            : configuration["Support:Email"]!.Trim();

    public static bool IsSupport(ApplicationUser? user, string supportEmail) =>
        user is { EmailConfirmed: true, Email: not null } &&
        string.Equals(user.Email, supportEmail, StringComparison.OrdinalIgnoreCase);

    public static string GetDisplayName(ApplicationUser user, string supportEmail) =>
        IsSupport(user, supportEmail) ? DisplayName : user.UserName ?? "Pessoa da comunidade";
}
