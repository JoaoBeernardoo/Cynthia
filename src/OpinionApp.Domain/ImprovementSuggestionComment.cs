namespace OpinionApp.Domain;

public sealed class ImprovementSuggestionComment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SuggestionId { get; set; }
    public ImprovementSuggestion? Suggestion { get; set; }
    public required string AuthorId { get; set; }
    public required string Content { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
