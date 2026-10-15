using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpinionApp.Infrastructure;

namespace OpinionApp.Api.Controllers;

[ApiController]
public sealed class HealthController(AppDbContext db) : ControllerBase
{
    [HttpGet("/health")]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        return await db.Database.CanConnectAsync(cancellationToken)
            ? Ok(new { status = "ok" })
            : StatusCode(StatusCodes.Status503ServiceUnavailable, new { status = "unavailable" });
    }
}
