using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpinionApp.Api;
using OpinionApp.Domain;
using OpinionApp.Infrastructure;

namespace OpinionApp.Api.Controllers;

[ApiController]
[Route("api/suggestions")]
public sealed class SuggestionsController(
    AppDbContext db,
    UserManager<ApplicationUser> users,
    IConfiguration configuration) : ControllerBase
{
    private string SupportEmail => SupportIdentity.GetEmail(configuration);

    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 50,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var canReview = SupportIdentity.IsSupport(await users.GetUserAsync(User), SupportEmail);
        var supportEmail = SupportEmail.ToLowerInvariant();
        var suggestions = await db.Suggestions.AsNoTracking()
            .OrderBy(suggestion => suggestion.IsWorthImplementing.HasValue)
            .ThenByDescending(suggestion => suggestion.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(suggestion => new SuggestionResponse(
                suggestion.Id,
                suggestion.Title,
                suggestion.Content,
                suggestion.CreatedAt,
                suggestion.AuthorId,
                db.Users.Where(user => user.Id == suggestion.AuthorId)
                    .Select(user => user.Email != null && user.Email.ToLower() == supportEmail
                        ? SupportIdentity.DisplayName
                        : user.UserName)
                    .FirstOrDefault() ?? "Pessoa da comunidade",
                suggestion.Comments.Count,
                suggestion.IsWorthImplementing,
                suggestion.SupportResponse,
                suggestion.ReviewedAt,
                canReview))
            .ToListAsync(cancellationToken);
        return Ok(suggestions);
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var canReview = SupportIdentity.IsSupport(await users.GetUserAsync(User), SupportEmail);
        var supportEmail = SupportEmail.ToLowerInvariant();
        var suggestion = await db.Suggestions.AsNoTracking()
            .Where(item => item.Id == id)
            .Select(item => new SuggestionResponse(
                item.Id,
                item.Title,
                item.Content,
                item.CreatedAt,
                item.AuthorId,
                db.Users.Where(user => user.Id == item.AuthorId)
                    .Select(user => user.Email != null && user.Email.ToLower() == supportEmail
                        ? SupportIdentity.DisplayName
                        : user.UserName)
                    .FirstOrDefault() ?? "Pessoa da comunidade",
                item.Comments.Count,
                item.IsWorthImplementing,
                item.SupportResponse,
                item.ReviewedAt,
                canReview))
            .SingleOrDefaultAsync(cancellationToken);
        return suggestion is null ? NotFound() : Ok(suggestion);
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create(CreateSuggestionRequest request, CancellationToken cancellationToken)
    {
        var user = await users.GetUserAsync(User);
        if (user is null || !user.EmailConfirmed)
        {
            return Forbid();
        }
        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Content))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Informe um título e os detalhes da sugestão.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var suggestion = new ImprovementSuggestion
        {
            AuthorId = user.Id,
            Title = request.Title.Trim(),
            Content = request.Content.Trim()
        };
        db.Suggestions.Add(suggestion);
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = suggestion.Id }, new
        {
            suggestion.Id,
            suggestion.Title,
            suggestion.Content,
            suggestion.CreatedAt,
            AuthorId = user.Id,
            AuthorName = SupportIdentity.GetDisplayName(user, SupportEmail),
            CommentCount = 0,
            suggestion.IsWorthImplementing,
            suggestion.SupportResponse,
            suggestion.ReviewedAt,
            CanReview = SupportIdentity.IsSupport(user, SupportEmail)
        });
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}/comments")]
    public async Task<IActionResult> Comments(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 50,
        CancellationToken cancellationToken = default)
    {
        var supportEmail = SupportEmail.ToLowerInvariant();
        if (!await db.Suggestions.AnyAsync(suggestion => suggestion.Id == id, cancellationToken))
        {
            return NotFound();
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var comments = await db.SuggestionComments.AsNoTracking()
            .Where(comment => comment.SuggestionId == id)
            .OrderByDescending(comment => comment.CreatedAt)
            .ThenByDescending(comment => comment.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(comment => new
            {
                comment.Id,
                comment.Content,
                comment.CreatedAt,
                comment.AuthorId,
                AuthorName = db.Users.Where(user => user.Id == comment.AuthorId)
                    .Select(user => user.Email != null && user.Email.ToLower() == supportEmail
                        ? SupportIdentity.DisplayName
                        : user.UserName)
                    .FirstOrDefault() ?? "Pessoa da comunidade"
            })
            .ToListAsync(cancellationToken);
        return Ok(comments);
    }

    [Authorize]
    [HttpPost("{id:guid}/comments")]
    public async Task<IActionResult> AddComment(Guid id, CreateSuggestionCommentRequest request,
        CancellationToken cancellationToken)
    {
        var user = await users.GetUserAsync(User);
        if (user is null || !user.EmailConfirmed)
        {
            return Forbid();
        }
        if (string.IsNullOrWhiteSpace(request.Content))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Escreva uma resposta antes de enviar.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var suggestion = await db.Suggestions.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (suggestion is null)
        {
            return NotFound();
        }
        if (suggestion.IsWorthImplementing.HasValue)
        {
            return Conflict(new ProblemDetails
            {
                Title = "Esta sugestão já foi encerrada e não aceita novas respostas.",
                Status = StatusCodes.Status409Conflict
            });
        }

        var comment = new ImprovementSuggestionComment
        {
            SuggestionId = id,
            AuthorId = user.Id,
            Content = request.Content.Trim()
        };
        db.SuggestionComments.Add(comment);
        await db.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Comments), new { id }, new
        {
            comment.Id,
            comment.Content,
            comment.CreatedAt,
            AuthorId = user.Id,
            AuthorName = SupportIdentity.GetDisplayName(user, SupportEmail)
        });
    }

    [Authorize]
    [HttpPut("{id:guid}/review")]
    public async Task<IActionResult> Review(Guid id, ReviewSuggestionRequest request,
        CancellationToken cancellationToken)
    {
        var user = await users.GetUserAsync(User);
        if (!SupportIdentity.IsSupport(user, SupportEmail))
        {
            return Forbid();
        }
        if (string.IsNullOrWhiteSpace(request.Response))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Inclua uma resposta antes de encerrar a sugestão.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var suggestion = await db.Suggestions.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (suggestion is null)
        {
            return NotFound();
        }
        if (suggestion.IsWorthImplementing.HasValue)
        {
            return Conflict(new ProblemDetails
            {
                Title = "Esta sugestão já foi encerrada.",
                Status = StatusCodes.Status409Conflict
            });
        }

        suggestion.IsWorthImplementing = request.IsWorthImplementing;
        suggestion.SupportResponse = request.Response.Trim();
        suggestion.ReviewedAt = DateTime.UtcNow;
        suggestion.ReviewedById = user!.Id;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new
        {
            suggestion.Id,
            suggestion.IsWorthImplementing,
            suggestion.SupportResponse,
            suggestion.ReviewedAt,
            SupportName = SupportIdentity.DisplayName
        });
    }
}

/// <summary>Represents a public improvement suggestion and its review.</summary>
public sealed record SuggestionResponse(
    Guid Id,
    string Title,
    string Content,
    DateTime CreatedAt,
    string AuthorId,
    string AuthorName,
    int CommentCount,
    bool? IsWorthImplementing,
    string? SupportResponse,
    DateTime? ReviewedAt,
    bool CanReview);

/// <summary>Payload for submitting an improvement suggestion.</summary>
public sealed record CreateSuggestionRequest(
    [Required, StringLength(120, MinimumLength = 3)] string Title,
    [Required, StringLength(2000, MinimumLength = 5)] string Content);

/// <summary>Payload for adding a comment to an open suggestion.</summary>
public sealed record CreateSuggestionCommentRequest(
    [Required, StringLength(1000, MinimumLength = 1)] string Content);

/// <summary>Payload for the support team's final decision and response.</summary>
public sealed record ReviewSuggestionRequest(
    bool IsWorthImplementing,
    [Required, StringLength(1000, MinimumLength = 1)] string Response);
