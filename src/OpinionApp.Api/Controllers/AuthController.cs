using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using OpinionApp.Application;
using OpinionApp.Infrastructure;

namespace OpinionApp.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    UserManager<ApplicationUser> users,
    AppDbContext db,
    IConfiguration configuration,
    OpinionApp.Application.IEmailSender emailSender,
    OpinionApp.Application.IImageStorageService imageStorage,
    ILogger<AuthController> logger) : ControllerBase
{
    private static readonly TimeSpan RefreshLifetime = TimeSpan.FromDays(14);

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("register")]
    [RequestSizeLimit(ProfilePhotoValidator.MaximumBytes + 64 * 1024)]
    public async Task<IActionResult> Register([FromForm] RegisterRequest request, CancellationToken cancellationToken)
    {
        if (!string.Equals(request.Password, request.ConfirmPassword, StringComparison.Ordinal))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "As senhas informadas não coincidem.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        if (!DateOnly.TryParseExact(
            request.DateOfBirth, "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateOfBirth)
            || dateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Informe uma data de nascimento válida no formato dd/mm/aaaa.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        string? photoFileName = null;
        if (request.ProfilePhoto is not null)
        {
            var extension = await ProfilePhotoValidator.ValidateAsync(request.ProfilePhoto, cancellationToken);
            if (extension is null)
            {
                return BadRequest(new ProblemDetails
                {
                    Title = "A foto deve ser JPEG, PNG ou WebP e ter no máximo 5 MB.",
                    Status = StatusCodes.Status400BadRequest
                });
            }

            await using var photo = request.ProfilePhoto.OpenReadStream();
            photoFileName = await imageStorage.SaveProfilePhotoAsync(extension, photo, cancellationToken);
        }

        var user = new ApplicationUser
        {
            UserName = request.UserName.Trim(),
            Email = request.Email.Trim(),
            EmailConfirmed = false,
            DateOfBirth = dateOfBirth,
            ProfilePhotoUrl = photoFileName is null ? null : $"/api/users/profile-photos/{photoFileName}"
        };
        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            if (photoFileName is not null)
            {
                await imageStorage.DeleteProfilePhotoAsync(photoFileName, cancellationToken);
            }
            return BadRequest(new ProblemDetails
            {
                Title = "Não foi possível criar a conta. Verifique os dados informados.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        try
        {
            var token = await users.GenerateEmailConfirmationTokenAsync(user);
            var confirmationUrl = QueryHelpers.AddQueryString(
                $"{configuration["Frontend:BaseUrl"] ?? "http://localhost:4200"}/confirm-email",
                new Dictionary<string, string?> { ["email"] = user.Email, ["token"] = token });
            await emailSender.SendAsync(
                user.Email!,
                "Confirme seu e-mail",
                $"<p>Para confirmar seu e-mail, <a href=\"{System.Net.WebUtility.HtmlEncode(confirmationUrl)}\">acesse este link</a>.</p>",
                cancellationToken);
        }
        catch
        {
            var cleanup = await users.DeleteAsync(user);
            if (!cleanup.Succeeded)
            {
                logger.LogError("Could not roll back registration for user {UserId} after confirmation email failure.", user.Id);
            }
            if (photoFileName is not null)
            {
                await imageStorage.DeleteProfilePhotoAsync(photoFileName, cancellationToken);
            }
            throw;
        }

        return Accepted(new { message = "Conta criada. Verifique seu e-mail para confirmar o cadastro." });
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("confirm-email")]
    public async Task<IActionResult> ConfirmEmail(ConfirmEmailRequest request)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is null)
        {
            return BadRequest(new ProblemDetails { Title = "Link de confirmação inválido ou expirado.", Status = 400 });
        }

        var result = await users.ConfirmEmailAsync(user, request.Token);
        return result.Succeeded
            ? NoContent()
            : BadRequest(new ProblemDetails { Title = "Link de confirmação inválido ou expirado.", Status = 400 });
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("resend-confirmation")]
    public async Task<IActionResult> ResendConfirmation(EmailRequest request, CancellationToken cancellationToken)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is not null && !user.EmailConfirmed)
        {
            var token = await users.GenerateEmailConfirmationTokenAsync(user);
            var link = QueryHelpers.AddQueryString(
                $"{configuration["Frontend:BaseUrl"] ?? "http://localhost:4200"}/confirm-email",
                new Dictionary<string, string?> { ["email"] = user.Email, ["token"] = token });
            await emailSender.SendAsync(
                user.Email!,
                "Confirme seu e-mail",
                $"<p><a href=\"{System.Net.WebUtility.HtmlEncode(link)}\">Confirmar e-mail</a></p>",
                cancellationToken);
        }

        return Accepted(new { message = "Se a conta puder receber uma confirmação, enviaremos um novo e-mail." });
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is null || await users.IsLockedOutAsync(user))
        {
            return Unauthorized(new ProblemDetails { Title = "E-mail ou senha inválidos.", Status = 401 });
        }

        if (!await users.CheckPasswordAsync(user, request.Password))
        {
            await users.AccessFailedAsync(user);
            return Unauthorized(new ProblemDetails { Title = "E-mail ou senha inválidos.", Status = 401 });
        }

        await users.ResetAccessFailedCountAsync(user);
        if (!user.EmailConfirmed)
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new ProblemDetails { Title = "Confirme seu e-mail antes de entrar.", Status = 403 });
        }

        var (accessToken, refreshToken) = await CreateSessionAsync(user);
        SetRefreshCookie(refreshToken);
        return Ok(new
        {
            accessToken,
            expiresIn = configuration.GetValue("Jwt:AccessTokenMinutes", 15) * 60,
            user = new { id = user.Id, userName = user.UserName, profilePhotoUrl = user.ProfilePhotoUrl, bio = user.Bio }
        });
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("session")]
    public async Task<IActionResult> RestoreSession()
    {
        if (!Request.Cookies.ContainsKey("opinion_refresh"))
        {
            return Ok(new { authenticated = false });
        }

        return await Refresh();
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh()
    {
        if (!Request.Cookies.TryGetValue("opinion_refresh", out var rawToken))
        {
            return Unauthorized();
        }

        var token = await db.RefreshTokens.SingleOrDefaultAsync(item => item.TokenHash == HashToken(rawToken));
        if (token is null)
        {
            return Unauthorized();
        }

        if (token.RevokedAt is not null)
        {
            var activeTokens = await db.RefreshTokens
                .Where(item => item.UserId == token.UserId && item.RevokedAt == null)
                .ToListAsync();
            foreach (var active in activeTokens)
            {
                active.RevokedAt = DateTime.UtcNow;
            }
            await db.SaveChangesAsync();
            DeleteRefreshCookie();
            return Unauthorized();
        }

        if (token.ExpiresAt <= DateTime.UtcNow)
        {
            token.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            DeleteRefreshCookie();
            return Unauthorized();
        }

        var user = await users.FindByIdAsync(token.UserId);
        if (user is null || !user.EmailConfirmed)
        {
            return Unauthorized();
        }

        token.RevokedAt = DateTime.UtcNow;
        var (accessToken, newRawToken) = await CreateSessionAsync(user);
        var replacement = await db.RefreshTokens.SingleAsync(item => item.TokenHash == HashToken(newRawToken));
        token.ReplacedByTokenId = replacement.Id;
        await db.SaveChangesAsync();
        SetRefreshCookie(newRawToken);
        return Ok(new
        {
            accessToken,
            expiresIn = configuration.GetValue("Jwt:AccessTokenMinutes", 15) * 60,
            user = new { id = user.Id, userName = user.UserName, profilePhotoUrl = user.ProfilePhotoUrl, bio = user.Bio }
        });
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        if (Request.Cookies.TryGetValue("opinion_refresh", out var rawToken))
        {
            var token = await db.RefreshTokens.SingleOrDefaultAsync(item => item.TokenHash == HashToken(rawToken));
            if (token is not null && token.RevokedAt is null)
            {
                token.RevokedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
        }

        DeleteRefreshCookie();
        return NoContent();
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(EmailRequest request, CancellationToken cancellationToken)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is not null && user.EmailConfirmed)
        {
            var token = await users.GeneratePasswordResetTokenAsync(user);
            var link = QueryHelpers.AddQueryString(
                $"{configuration["Frontend:BaseUrl"] ?? "http://localhost:4200"}/reset-password",
                new Dictionary<string, string?> { ["email"] = user.Email, ["token"] = token });
            await emailSender.SendAsync(
                user.Email!,
                "Redefina sua senha",
                $"<p><a href=\"{System.Net.WebUtility.HtmlEncode(link)}\">Redefinir senha</a></p>",
                cancellationToken);
        }

        return Accepted(new { message = "Se a conta existir, enviaremos instruções para redefinir a senha." });
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is null)
        {
            return BadRequest(new ProblemDetails { Title = "Link inválido ou expirado.", Status = 400 });
        }

        var result = await users.ResetPasswordAsync(user, request.Token, request.Password);
        return result.Succeeded
            ? NoContent()
            : BadRequest(new ValidationProblemDetails(
                result.Errors.ToDictionary(error => error.Code, error => new[] { error.Description })));
    }

    private async Task<(string AccessToken, string RefreshToken)> CreateSessionAsync(ApplicationUser user)
    {
        var minutes = configuration.GetValue("Jwt:AccessTokenMinutes", 15);
        var expiresAt = DateTime.UtcNow.AddMinutes(minutes);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Jwt:SigningKey"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Name, user.UserName ?? string.Empty),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
        var jwt = new JwtSecurityToken(
            configuration["Jwt:Issuer"],
            configuration["Jwt:Audience"],
            claims,
            expires: expiresAt,
            signingCredentials: credentials);
        var accessToken = new JwtSecurityTokenHandler().WriteToken(jwt);

        var rawToken = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(64));
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = HashToken(rawToken),
            ExpiresAt = DateTime.UtcNow.Add(RefreshLifetime)
        });
        await db.SaveChangesAsync();
        return (accessToken, rawToken);
    }

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private void SetRefreshCookie(string value) => Response.Cookies.Append("opinion_refresh", value, new CookieOptions
    {
        HttpOnly = true,
        Secure = Request.IsHttps,
        SameSite = SameSiteMode.Strict,
        Path = "/api/auth",
        Expires = DateTimeOffset.UtcNow.Add(RefreshLifetime)
    });

    private void DeleteRefreshCookie() => Response.Cookies.Delete("opinion_refresh", new CookieOptions
    {
        HttpOnly = true,
        Secure = Request.IsHttps,
        SameSite = SameSiteMode.Strict,
        Path = "/api/auth"
    });
}

public sealed record RegisterRequest(
[Required, StringLength(30, MinimumLength = 3), RegularExpression("^[a-zA-Z0-9_.]+$")] string UserName,
[Required, EmailAddress, StringLength(254)] string Email,
[Required, StringLength(128, MinimumLength = 10)] string Password,
[Required, StringLength(128, MinimumLength = 10)] string ConfirmPassword,
[Required, RegularExpression(@"^\d{2}/\d{2}/\d{4}$")] string DateOfBirth,
IFormFile? ProfilePhoto
);

public sealed record LoginRequest([property: Required, EmailAddress] string Email, [property: Required] string Password);
public sealed record ConfirmEmailRequest([property: Required, EmailAddress] string Email, [property: Required] string Token);
public sealed record EmailRequest([property: Required, EmailAddress] string Email);
public sealed record ResetPasswordRequest(
    [property: Required, EmailAddress] string Email,
    [property: Required] string Token,
    [property: Required, StringLength(128, MinimumLength = 10)] string Password);
