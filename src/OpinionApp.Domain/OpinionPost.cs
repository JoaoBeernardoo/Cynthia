namespace OpinionApp.Domain;

public sealed class OpinionPost
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string AuthorId { get; set; }
    public Guid? PlaceId { get; set; }
    public Place? Place { get; set; }
    public required string Content { get; set; }
    public int? Rating { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
    public ICollection<PostLike> Likes { get; set; } = new List<PostLike>();
}
