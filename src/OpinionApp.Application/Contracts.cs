using OpinionApp.Domain;

namespace OpinionApp.Application;

public interface IPlaceRepository
{
    IQueryable<Place> Query();
    Task AddAsync(Place place, CancellationToken cancellationToken);
}

public interface IPostRepository
{
    IQueryable<OpinionPost> Query();
    Task AddAsync(OpinionPost post, CancellationToken cancellationToken);
}

public interface IEmailSender
{
    Task SendAsync(string email, string subject, string htmlBody, CancellationToken cancellationToken);
}

public interface IImageStorageService
{
    Task<string> SaveProfilePhotoAsync(string extension, Stream content, CancellationToken cancellationToken);
    Task<Stream?> OpenProfilePhotoAsync(string fileName, CancellationToken cancellationToken);
    Task DeleteProfilePhotoAsync(string fileName, CancellationToken cancellationToken);
    Task<string> SavePostPhotoAsync(string extension, Stream content, CancellationToken cancellationToken);
    Task<Stream?> OpenPostPhotoAsync(string fileName, CancellationToken cancellationToken);
    Task DeletePostPhotoAsync(string photoUrl, CancellationToken cancellationToken);
}
