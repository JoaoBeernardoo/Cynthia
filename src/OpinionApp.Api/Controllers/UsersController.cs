using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpinionApp.Application;
using OpinionApp.Infrastructure;

namespace OpinionApp.Api.Controllers;

[ApiController]
[Route("api/users")]
public sealed class UsersController(
    AppDbContext db,
    UserManager<ApplicationUser> users,
    IImageStorageService imageStorage) : ControllerBase
{
    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return NotFound();
        return Ok(new
        {
            id = user.Id,
            userName = user.UserName,
            user.Email,
            emailConfirmed = user.EmailConfirmed,
            profilePhotoUrl = user.ProfilePhotoUrl,
            bio = user.Bio,
            dateOfBirth = user.DateOfBirth,
            user.CreatedAt,
            postCount = await db.Posts.CountAsync(post => post.AuthorId == user.Id)
        });
    }

    [AllowAnonymous]
    [HttpGet("profile-photos/{fileName}")]
    public async Task<IActionResult> ProfilePhoto(string fileName, CancellationToken cancellationToken)
    {
        var stream = await imageStorage.OpenProfilePhotoAsync(fileName, cancellationToken);
        if (stream is null) return NotFound();
        var contentType = Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".jpg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "application/octet-stream"
        };
        return File(stream, contentType);
    }

    [Authorize]
    [HttpPost("me/profile-photo")]
    [RequestSizeLimit(ProfilePhotoValidator.MaximumBytes + 16 * 1024)]
    public async Task<IActionResult> UploadProfilePhoto([FromForm] IFormFile photo, CancellationToken cancellationToken)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return NotFound();
        if (!user.EmailConfirmed) return Forbid();
        var extension = await ProfilePhotoValidator.ValidateAsync(photo, cancellationToken);
        if (extension is null)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "A foto deve ser JPEG, PNG ou WebP e ter no máximo 5 MB.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        await using var content = photo.OpenReadStream();
        var fileName = await imageStorage.SaveProfilePhotoAsync(extension, content, cancellationToken);
        user.ProfilePhotoUrl = $"/api/users/profile-photos/{fileName}";
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            await imageStorage.DeleteProfilePhotoAsync(fileName, cancellationToken);
            return BadRequest(new ProblemDetails
            {
                Title = "Não foi possível atualizar a foto do perfil.",
                Status = StatusCodes.Status400BadRequest
            });
        }
        return Ok(new { profilePhotoUrl = user.ProfilePhotoUrl });
    }

    [Authorize]
    [HttpPut("me")]
    public async Task<IActionResult> UpdateMe(UpdateProfileRequest request)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return NotFound();
        if (!user.EmailConfirmed) return Forbid();

        if (!string.Equals(user.UserName, request.UserName.Trim(), StringComparison.Ordinal))
        {
            var result = await users.SetUserNameAsync(user, request.UserName.Trim());
            if (!result.Succeeded)
            {
                return BadRequest(new ValidationProblemDetails(
                    result.Errors.ToDictionary(error => error.Code, error => new[] { error.Description })));
            }
        }
        user.Bio = request.Bio?.Trim();
        user.ProfilePhotoUrl = request.ProfilePhotoUrl?.Trim();
        var updateResult = await users.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Não foi possível atualizar o perfil.",
                Status = StatusCodes.Status400BadRequest
            });
        }
        return NoContent();
    }

    [AllowAnonymous]
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery, StringLength(100, MinimumLength = 1)] string q,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var query = q.Trim();
        var result = await db.Users.AsNoTracking()
            .Where(user => user.EmailConfirmed && user.UserName != null && EF.Functions.ILike(user.UserName, $"%{query}%"))
            .OrderBy(user => user.UserName)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(user => new
            {
                user.Id, user.UserName, user.ProfilePhotoUrl, user.Bio,
                PostCount = db.Posts.Count(post => post.AuthorId == user.Id)
            }).ToListAsync();
        return Ok(result);
    }

    [AllowAnonymous]
    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id)
    {
        var user = await db.Users.AsNoTracking()
            .Where(item => item.Id == id && item.EmailConfirmed)
            .Select(item => new
            {
                item.Id, item.UserName, item.ProfilePhotoUrl, item.Bio, item.CreatedAt,
                PostCount = db.Posts.Count(post => post.AuthorId == item.Id)
            }).SingleOrDefaultAsync();
        return user is null ? NotFound() : Ok(user);
    }

    [AllowAnonymous]
    [HttpGet("{id}/posts")]
    public async Task<IActionResult> Posts(string id, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        if (!await db.Users.AnyAsync(user => user.Id == id && user.EmailConfirmed)) return NotFound();
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var posts = await db.Posts.AsNoTracking().Where(post => post.AuthorId == id)
            .OrderByDescending(post => post.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(post => new
            {
                post.Id, post.Content, post.ImageUrl, post.Rating, post.CreatedAt, post.AuthorId,
                AuthorName = db.Users.Where(user => user.Id == post.AuthorId).Select(user => user.UserName).FirstOrDefault(),
                Place = post.Place == null ? null : new { post.Place.Id, post.Place.Name, post.Place.Category, post.Place.City },
                LikeCount = post.Likes.Count,
                CommentCount = db.Comments.Count(comment => comment.PostId == post.Id)
            }).ToListAsync();
        return Ok(posts);
    }
}

public sealed record UpdateProfileRequest(
    [Required, StringLength(30, MinimumLength = 3), RegularExpression("^[a-zA-Z0-9_.]+$")] string UserName,
    [StringLength(300)] string? Bio,
    [StringLength(500), Url] string? ProfilePhotoUrl);
