using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpinionApp.Domain;
using OpinionApp.Infrastructure;

namespace OpinionApp.Api.Controllers;

[ApiController]
[Route("api/places")]
public sealed class PlacesController(AppDbContext db, UserManager<ApplicationUser> users) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var places = await db.Places.AsNoTracking()
            .OrderBy(place => place.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(place => new PlaceDto(
                place.Id, place.Name, place.Category, place.Description, place.Address,
                place.City, place.State, place.Country, place.Latitude, place.Longitude,
                place.Posts.Count(post => post.DeletedAt == null)))
            .ToListAsync();
        return Ok(places);
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var place = await db.Places.AsNoTracking()
            .Where(item => item.Id == id)
            .Select(item => new PlaceDto(
                item.Id, item.Name, item.Category, item.Description, item.Address,
                item.City, item.State, item.Country, item.Latitude, item.Longitude,
                item.Posts.Count(post => post.DeletedAt == null)))
            .SingleOrDefaultAsync();
        return place is null ? NotFound() : Ok(place);
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}/posts")]
    public async Task<IActionResult> Posts(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        if (!await db.Places.AnyAsync(place => place.Id == id))
        {
            return NotFound();
        }
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var posts = await db.Posts.AsNoTracking().Where(post => post.PlaceId == id)
            .OrderByDescending(post => post.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(post => new
            {
                post.Id, post.Content, post.Rating, post.CreatedAt, post.AuthorId,
                AuthorName = db.Users.Where(user => user.Id == post.AuthorId).Select(user => user.UserName).FirstOrDefault()
            }).ToListAsync();
        return Ok(posts);
    }

    [AllowAnonymous]
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery, StringLength(100, MinimumLength = 1)] string q,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var search = q.Trim();
        var result = await db.Places.AsNoTracking()
            .Where(place => EF.Functions.ILike(place.Name, $"%{search}%")
                || (place.City != null && EF.Functions.ILike(place.City, $"%{search}%"))
                || EF.Functions.ILike(place.Category, $"%{search}%"))
            .OrderBy(place => place.Name)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(place => new PlaceDto(
                place.Id, place.Name, place.Category, place.Description, place.Address,
                place.City, place.State, place.Country, place.Latitude, place.Longitude,
                place.Posts.Count(post => post.DeletedAt == null)))
            .ToListAsync();
        return Ok(result);
    }

    [AllowAnonymous]
    [HttpGet("nearby")]
    public async Task<IActionResult> Nearby([FromQuery] double latitude, [FromQuery] double longitude,
        [FromQuery] double radiusMeters = 5000, [FromQuery] int limit = 100)
    {
        if (!double.IsFinite(latitude) || latitude is < -90 or > 90
            || !double.IsFinite(longitude) || longitude is < -180 or > 180
            || !double.IsFinite(radiusMeters) || radiusMeters is <= 0 or > 50000)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Coordenadas inválidas.",
                Detail = "Informe coordenadas válidas e um raio entre 1 e 50.000 metros.",
                Status = 400
            });
        }

        limit = Math.Clamp(limit, 1, 200);
        var latitudeDelta = radiusMeters / 111_320d;
        var longitudeDivisor = Math.Max(Math.Abs(Math.Cos(latitude * Math.PI / 180d)), 0.01d);
        var longitudeDelta = radiusMeters / (111_320d * longitudeDivisor);
        var minLatitude = Math.Max(-90, latitude - latitudeDelta);
        var maxLatitude = Math.Min(90, latitude + latitudeDelta);
        IQueryable<Place> candidates = db.Places.AsNoTracking()
            .Where(place => place.Latitude >= minLatitude && place.Latitude <= maxLatitude);
        if (longitudeDelta < 180)
        {
            var minLongitude = longitude - longitudeDelta;
            var maxLongitude = longitude + longitudeDelta;
            candidates = minLongitude < -180
                ? candidates.Where(place => place.Longitude >= minLongitude + 360 || place.Longitude <= maxLongitude)
                : maxLongitude > 180
                    ? candidates.Where(place => place.Longitude >= minLongitude || place.Longitude <= maxLongitude - 360)
                    : candidates.Where(place => place.Longitude >= minLongitude && place.Longitude <= maxLongitude);
        }

        var orderedCandidates = candidates
            .OrderBy(place => Math.Pow(place.Latitude - latitude, 2)
                + Math.Pow((place.Longitude - longitude) * Math.Cos(latitude * Math.PI / 180d), 2))
            .Select(place => new
            {
                place.Id,
                place.Name,
                place.Category,
                place.Address,
                place.City,
                place.Latitude,
                place.Longitude,
                OpinionCount = place.Posts.Count(post => post.DeletedAt == null)
            });
        var rows = await orderedCandidates.Take(5000).ToListAsync();
        var result = rows.Select(place => new
            {
                Place = place,
                Distance = GeoDistance.InMeters(latitude, longitude, place.Latitude, place.Longitude)
            })
            .Where(item => item.Distance <= radiusMeters)
            .OrderBy(item => item.Distance)
            .Take(limit)
            .Select(item => new NearbyPlaceDto(
                item.Place.Id, item.Place.Name, item.Place.Category, item.Place.Address,
                item.Place.City, item.Place.Latitude, item.Place.Longitude,
                item.Place.OpinionCount, Math.Round(item.Distance)))
            .ToList();
        return Ok(result);
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create(CreatePlaceRequest request)
    {
        var user = await users.GetUserAsync(User);
        if (user is null || !user.EmailConfirmed)
        {
            return Forbid();
        }

        if (!double.IsFinite(request.Latitude) || request.Latitude is < -90 or > 90
            || !double.IsFinite(request.Longitude) || request.Longitude is < -180 or > 180)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Coordenadas inválidas.",
                Detail = "Latitude e longitude devem estar dentro dos limites geográficos.",
                Status = 400
            });
        }

        var normalizedName = request.Name.Trim();
        var city = (request.City ?? string.Empty).Trim().ToLower();
        var duplicate = await db.Places.AnyAsync(place =>
            EF.Functions.ILike(place.Name, normalizedName)
            && (place.City ?? string.Empty).ToLower() == city);
        if (duplicate)
        {
            return Conflict(new ProblemDetails { Title = "Um local com esse nome já existe na cidade informada.", Status = 409 });
        }

        var place = new Place
        {
            Name = normalizedName,
            Category = request.Category.Trim(),
            Description = request.Description?.Trim(),
            Address = request.Address?.Trim(),
            City = request.City?.Trim(),
            State = request.State?.Trim(),
            Country = request.Country?.Trim(),
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            CreatedByUserId = user.Id
        };
        db.Places.Add(place);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = place.Id }, new PlaceDto(
            place.Id, place.Name, place.Category, place.Description, place.Address,
            place.City, place.State, place.Country, place.Latitude, place.Longitude, 0));
    }

}

public sealed record CreatePlaceRequest(
    [property: Required, StringLength(160, MinimumLength = 2)] string Name,
    [property: Required, StringLength(80, MinimumLength = 2)] string Category,
    [property: StringLength(1000)] string? Description,
    [property: StringLength(300)] string? Address,
    [property: StringLength(120)] string? City,
    [property: StringLength(120)] string? State,
    [property: StringLength(120)] string? Country,
    double Latitude,
    double Longitude);

public sealed record PlaceDto(
    Guid Id, string Name, string Category, string? Description, string? Address,
    string? City, string? State, string? Country, double Latitude, double Longitude, int OpinionCount);

public sealed record NearbyPlaceDto(
    Guid Id, string Name, string Category, string? Address, string? City,
    double Latitude, double Longitude, int OpinionCount, double DistanceMeters);
