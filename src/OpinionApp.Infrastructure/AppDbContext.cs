using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using OpinionApp.Application;
using OpinionApp.Domain;

namespace OpinionApp.Infrastructure;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<ApplicationUser>(options), IPlaceRepository, IPostRepository
{
    public DbSet<Place> Places => Set<Place>();
    public DbSet<OpinionPost> Posts => Set<OpinionPost>();
    public DbSet<PostLike> Likes => Set<PostLike>();
    public DbSet<PostComment> Comments => Set<PostComment>();
    public DbSet<ImprovementSuggestion> Suggestions => Set<ImprovementSuggestion>();
    public DbSet<ImprovementSuggestionComment> SuggestionComments => Set<ImprovementSuggestionComment>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(user => user.Bio).HasMaxLength(300);
            entity.Property(user => user.ProfilePhotoUrl).HasMaxLength(500);
            entity.HasIndex(user => user.NormalizedEmail).IsUnique();
        });
        builder.Entity<Place>(entity =>
        {
            entity.Property(place => place.Name).HasMaxLength(160).IsRequired();
            entity.Property(place => place.Category).HasMaxLength(80).IsRequired();
            entity.Property(place => place.Description).HasMaxLength(1000);
            entity.Property(place => place.Address).HasMaxLength(300);
            entity.Property(place => place.City).HasMaxLength(120);
            entity.HasIndex(place => new { place.Name, place.City });
            entity.HasIndex(place => new { place.Latitude, place.Longitude });
            entity.HasMany(place => place.Posts).WithOne(post => post.Place)
                .HasForeignKey(post => post.PlaceId).OnDelete(DeleteBehavior.SetNull);
        });
        builder.Entity<OpinionPost>(entity =>
        {
            entity.Property(post => post.Content).HasMaxLength(2000).IsRequired();
            entity.Property(post => post.ImageUrl).HasMaxLength(1000);
            entity.HasIndex(post => new { post.CreatedAt, post.Id });
            entity.HasIndex(post => new { post.PlaceId, post.CreatedAt });
            entity.HasQueryFilter(post => post.DeletedAt == null);
        });
        builder.Entity<PostLike>(entity =>
        {
            entity.HasIndex(like => new { like.PostId, like.UserId }).IsUnique();
            entity.HasOne(like => like.Post).WithMany(post => post.Likes)
                .HasForeignKey(like => like.PostId).OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(like => like.Post != null && like.Post.DeletedAt == null);
        });
        builder.Entity<PostComment>(entity =>
        {
            entity.Property(comment => comment.Content).HasMaxLength(1000).IsRequired();
            entity.HasIndex(comment => new { comment.PostId, comment.CreatedAt });
            entity.HasQueryFilter(comment => comment.DeletedAt == null);
        });
        builder.Entity<ImprovementSuggestion>(entity =>
        {
            entity.Property(suggestion => suggestion.Title).HasMaxLength(120).IsRequired();
            entity.Property(suggestion => suggestion.Content).HasMaxLength(2000).IsRequired();
            entity.Property(suggestion => suggestion.SupportResponse).HasMaxLength(1000);
            entity.HasIndex(suggestion => new { suggestion.CreatedAt, suggestion.Id });
        });
        builder.Entity<ImprovementSuggestionComment>(entity =>
        {
            entity.Property(comment => comment.Content).HasMaxLength(1000).IsRequired();
            entity.HasIndex(comment => new { comment.SuggestionId, comment.CreatedAt });
            entity.HasOne(comment => comment.Suggestion).WithMany(suggestion => suggestion.Comments)
                .HasForeignKey(comment => comment.SuggestionId).OnDelete(DeleteBehavior.Cascade);
        });
        builder.Entity<RefreshToken>(entity =>
        {
            entity.Property(token => token.TokenHash).HasMaxLength(64).IsRequired();
            entity.HasIndex(token => token.TokenHash).IsUnique();
            entity.HasIndex(token => new { token.UserId, token.ExpiresAt });
        });
    }

    IQueryable<Place> IPlaceRepository.Query() => Places;
    Task IPlaceRepository.AddAsync(Place place, CancellationToken cancellationToken) =>
        Places.AddAsync(place, cancellationToken).AsTask();
    IQueryable<OpinionPost> IPostRepository.Query() => Posts;
    Task IPostRepository.AddAsync(OpinionPost post, CancellationToken cancellationToken) =>
        Posts.AddAsync(post, cancellationToken).AsTask();
}
