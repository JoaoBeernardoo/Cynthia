using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpinionApp.Domain;
using OpinionApp.Infrastructure;

namespace OpinionApp.Api.Controllers;

[ApiController]
[Route("api/posts")]
public sealed class PostsController(
    AppDbContext db,
    UserManager<ApplicationUser> users,
    OpinionApp.Application.IImageStorageService imageStorage) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> Feed([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var items = await db.Posts.AsNoTracking()
            .OrderByDescending(post => post.CreatedAt).ThenByDescending(post => post.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(post => new
            {
                post.Id,
                post.Content,
                post.ImageUrl,
                post.Rating,
                post.CreatedAt,
                AuthorId = post.AuthorId,
                AuthorName = db.Users.Where(user => user.Id == post.AuthorId).Select(user => user.UserName).FirstOrDefault(),
                AuthorPhoto = db.Users.Where(user => user.Id == post.AuthorId).Select(user => user.ProfilePhotoUrl).FirstOrDefault(),
                Place = post.Place == null ? null : new
                {
                    post.Place.Id,
                    post.Place.Name,
                    post.Place.Category,
                    post.Place.City
                },
                LikeCount = post.Likes.Count,
                LikedByMe = userId != null && post.Likes.Any(like => like.UserId == userId),
                CommentCount = db.Comments.Count(comment => comment.PostId == post.Id)
            })
            .ToListAsync();
        return Ok(items);
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var post = await db.Posts.AsNoTracking()
            .Where(item => item.Id == id)
            .Select(item => new
            {
                item.Id, item.Content, item.ImageUrl, item.Rating, item.CreatedAt,
                AuthorId = item.AuthorId,
                AuthorName = db.Users.Where(user => user.Id == item.AuthorId).Select(user => user.UserName).FirstOrDefault(),
                AuthorPhoto = db.Users.Where(user => user.Id == item.AuthorId).Select(user => user.ProfilePhotoUrl).FirstOrDefault(),
                Place = item.Place == null ? null : new { item.Place.Id, item.Place.Name, item.Place.Category, item.Place.City },
                LikeCount = item.Likes.Count,
                LikedByMe = userId != null && item.Likes.Any(like => like.UserId == userId),
                CommentCount = db.Comments.Count(comment => comment.PostId == item.Id)
            })
            .SingleOrDefaultAsync();
        return post is null ? NotFound() : Ok(post);
    }

    [Authorize]
    [HttpPost]
    public Task<IActionResult> Create(CreatePostRequest request, CancellationToken cancellationToken) =>
        CreateAsync(request, null, cancellationToken);

    [Authorize]
    [HttpPost("with-image")]
    [RequestSizeLimit(ProfilePhotoValidator.MaximumBytes + 64 * 1024)]
    public Task<IActionResult> CreateWithImage(
        [FromForm] CreatePostWithImageRequest request,
        CancellationToken cancellationToken) =>
        CreateAsync(new CreatePostRequest(request.Content, request.PlaceId, request.Rating), request.Photo, cancellationToken);

    [AllowAnonymous]
    [HttpGet("photos/{fileName}")]
    public async Task<IActionResult> PostPhoto(string fileName, CancellationToken cancellationToken)
    {
        var stream = await imageStorage.OpenPostPhotoAsync(fileName, cancellationToken);
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

    private async Task<IActionResult> CreateAsync(
        CreatePostRequest request,
        IFormFile? photo,
        CancellationToken cancellationToken)
    {
        var user = await users.GetUserAsync(User);
        if (user is null || !user.EmailConfirmed)
        {
            return Forbid();
        }
        if (request.Rating is < 1 or > 5)
        {
            return BadRequest(new ProblemDetails { Title = "A nota deve estar entre 1 e 5.", Status = 400 });
        }
        if (request.PlaceId is not null && !await db.Places.AnyAsync(place => place.Id == request.PlaceId))
        {
            return NotFound(new ProblemDetails { Title = "Local não encontrado.", Status = 404 });
        }

        string? imageUrl = null;
        if (photo is not null)
        {
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
            imageUrl = await imageStorage.SavePostPhotoAsync(extension, content, cancellationToken);
        }

        var post = new OpinionPost
        {
            AuthorId = user.Id,
            PlaceId = request.PlaceId,
            Content = request.Content.Trim(),
            ImageUrl = imageUrl,
            Rating = request.Rating
        };
        db.Posts.Add(post);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            if (imageUrl is not null)
            {
                await imageStorage.DeletePostPhotoAsync(imageUrl, cancellationToken);
            }
            throw;
        }
        return CreatedAtAction(nameof(Get), new { id = post.Id }, new { post.Id, post.Content, post.ImageUrl, post.CreatedAt });
    }

    [Authorize]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdatePostRequest request)
    {
        var userId = users.GetUserId(User);
        var post = await db.Posts.SingleOrDefaultAsync(item => item.Id == id);
        if (post is null)
        {
            return NotFound();
        }
        if (post.AuthorId != userId)
        {
            return Forbid();
        }
        if (request.Rating is < 1 or > 5)
        {
            return BadRequest(new ProblemDetails { Title = "A nota deve estar entre 1 e 5.", Status = 400 });
        }

        post.Content = request.Content.Trim();
        post.Rating = request.Rating;
        post.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = users.GetUserId(User);
        var post = await db.Posts.SingleOrDefaultAsync(item => item.Id == id);
        if (post is null)
        {
            return NotFound();
        }
        if (post.AuthorId != userId)
        {
            return Forbid();
        }

        post.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize]
    [HttpPut("{id:guid}/like")]
    public async Task<IActionResult> Like(Guid id)
    {
        var userId = users.GetUserId(User)!;
        if (!await db.Posts.AnyAsync(post => post.Id == id))
        {
            return NotFound();
        }
        if (!await db.Likes.AnyAsync(like => like.PostId == id && like.UserId == userId))
        {
            db.Likes.Add(new PostLike { PostId = id, UserId = userId });
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    [Authorize]
    [HttpDelete("{id:guid}/like")]
    public async Task<IActionResult> Unlike(Guid id)
    {
        var userId = users.GetUserId(User)!;
        var like = await db.Likes.SingleOrDefaultAsync(item => item.PostId == id && item.UserId == userId);
        if (like is not null)
        {
            db.Likes.Remove(like);
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}/comments")]
    public async Task<IActionResult> Comments(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 30)
    {
        if (!await db.Posts.AnyAsync(post => post.Id == id))
        {
            return NotFound();
        }
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var comments = await db.Comments.AsNoTracking().Where(comment => comment.PostId == id)
            .OrderBy(comment => comment.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(comment => new
            {
                comment.Id, comment.Content, comment.CreatedAt, comment.AuthorId,
                AuthorName = db.Users.Where(user => user.Id == comment.AuthorId).Select(user => user.UserName).FirstOrDefault()
            }).ToListAsync();
        return Ok(comments);
    }

    [Authorize]
    [HttpPost("{id:guid}/comments")]
    public async Task<IActionResult> AddComment(Guid id, CreateCommentRequest request)
    {
        var user = await users.GetUserAsync(User);
        if (user is null || !user.EmailConfirmed)
        {
            return Forbid();
        }
        if (!await db.Posts.AnyAsync(post => post.Id == id))
        {
            return NotFound();
        }
        var comment = new PostComment { PostId = id, AuthorId = user.Id, Content = request.Content.Trim() };
        db.Comments.Add(comment);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Comments), new { id }, new { comment.Id, comment.Content, comment.CreatedAt });
    }
}

public sealed record CreatePostRequest(
    [Required, StringLength(2000, MinimumLength = 2)] string Content,
    Guid? PlaceId,
    [Range(1, 5)] int? Rating);
public sealed record CreatePostWithImageRequest(
    [Required, StringLength(2000, MinimumLength = 2)] string Content,
    Guid? PlaceId,
    [Range(1, 5)] int? Rating,
    [Required] IFormFile Photo);
public sealed record UpdatePostRequest(
    [Required, StringLength(2000, MinimumLength = 2)] string Content,
    [Range(1, 5)] int? Rating);
public sealed record CreateCommentRequest([Required, StringLength(1000, MinimumLength = 1)] string Content);
