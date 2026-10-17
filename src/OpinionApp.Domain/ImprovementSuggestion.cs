namespace OpinionApp.Domain;

public sealed class ImprovementSuggestion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string AuthorId { get; set; }
    public required string Title { get; set; }
    public required string Content { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool? IsWorthImplementing { get; set; }
    public string? SupportResponse { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewedById { get; set; }
    public ICollection<ImprovementSuggestionComment> Comments { get; set; } = [];
}
