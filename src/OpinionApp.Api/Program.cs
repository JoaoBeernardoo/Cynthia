using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using OpinionApp.Infrastructure;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

var localDataDirectory = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cynthia");
Directory.CreateDirectory(localDataDirectory);
Directory.CreateDirectory(Path.Combine(localDataDirectory, "data-protection"));
builder.Services.AddDataProtection()
    .SetApplicationName("Cynthia")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(localDataDirectory, "data-protection")));

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddProblemDetails();

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default is required.");
var databaseHost = new Npgsql.NpgsqlConnectionStringBuilder(connectionString).Host;
var usesLocalDatabase = string.Equals(databaseHost, "localhost", StringComparison.OrdinalIgnoreCase)
    || string.Equals(databaseHost, "127.0.0.1", StringComparison.Ordinal)
    || string.Equals(databaseHost, "::1", StringComparison.Ordinal);
if (builder.Environment.IsDevelopment() && !string.IsNullOrWhiteSpace(builder.Configuration["POSTGRES_PASSWORD"]))
{
    var localConnection = new Npgsql.NpgsqlConnectionStringBuilder(connectionString)
    {
        Password = builder.Configuration["POSTGRES_PASSWORD"]
    };
    connectionString = localConnection.ConnectionString;
}
builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddIdentityCore<ApplicationUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.SignIn.RequireConfirmedEmail = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        options.Password.RequiredLength = 10;
        options.Password.RequireDigit = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireNonAlphanumeric = true;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();

var signingKey = builder.Configuration["Jwt:SigningKey"];
if (string.IsNullOrWhiteSpace(signingKey) && builder.Environment.IsDevelopment())
{
    var signingKeyPath = Path.Combine(localDataDirectory, "jwt-signing-key");
    if (File.Exists(signingKeyPath))
    {
        signingKey = await File.ReadAllTextAsync(signingKeyPath);
    }
    else
    {
        signingKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        await File.WriteAllTextAsync(signingKeyPath, signingKey);
    }
}
if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
{
    throw new InvalidOperationException("Jwt:SigningKey must be configured with at least 32 UTF-8 bytes.");
}

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddScoped<OpinionApp.Application.IEmailSender, SmtpEmailSender>();
builder.Services.AddSingleton<OpinionApp.Application.IImageStorageService>(
    _ => new LocalImageStorageService(builder.Environment.ContentRootPath));

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:4200"];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
});

var app = builder.Build();

if (app.Environment.IsDevelopment() && usesLocalDatabase)
{
    var composeFile = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "..", "docker-compose.yml"));
    if (!File.Exists(composeFile))
    {
        throw new FileNotFoundException("Could not find docker-compose.yml next to the source repository.", composeFile);
    }

    var startServices = new ProcessStartInfo("docker")
    {
        WorkingDirectory = Path.GetDirectoryName(composeFile)!,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false
    };
    startServices.ArgumentList.Add("compose");
    startServices.ArgumentList.Add("-f");
    startServices.ArgumentList.Add(composeFile);
    startServices.ArgumentList.Add("up");
    startServices.ArgumentList.Add("-d");
    startServices.ArgumentList.Add("postgres");
    startServices.ArgumentList.Add("mailpit");

    using var docker = Process.Start(startServices)
        ?? throw new InvalidOperationException("Could not start Docker Compose. Ensure Docker Desktop is running.");
    var standardOutputTask = docker.StandardOutput.ReadToEndAsync();
    var standardErrorTask = docker.StandardError.ReadToEndAsync();
    await docker.WaitForExitAsync();
    var standardOutput = await standardOutputTask;
    var standardError = await standardErrorTask;
    if (docker.ExitCode != 0)
    {
        throw new InvalidOperationException(
            $"Could not start PostgreSQL and Mailpit using Docker Compose. Start Docker Desktop and retry. {standardError}");
    }
    if (!string.IsNullOrWhiteSpace(standardOutput))
    {
        Console.WriteLine(standardOutput);
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseExceptionHandler();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    await next();
});
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var connected = false;
    Npgsql.NpgsqlException? lastConnectionError = null;
    for (var attempt = 1; attempt <= 30; attempt++)
    {
        try
        {
            await using var connection = new Npgsql.NpgsqlConnection(connectionString);
            await connection.OpenAsync();
            connected = true;
            break;
        }
        catch (Npgsql.NpgsqlException exception)
        {
            lastConnectionError = exception;
            logger.LogInformation(
                "Waiting for PostgreSQL host {DatabaseHost} ({Attempt}/30): {Error}",
                databaseHost,
                attempt,
                exception.Message);
        }

        await Task.Delay(TimeSpan.FromSeconds(1));
    }

    if (!connected)
    {
        var locationHint = usesLocalDatabase
            ? "Check Docker Desktop and port 5432."
            : "Check the Supabase host, network access, and whether the Session pooler is required.";
        throw new InvalidOperationException(
            $"Could not connect to PostgreSQL host '{databaseHost}'. {locationHint} Last error: {lastConnectionError?.Message ?? "No PostgreSQL connection error was returned."}",
            lastConnectionError);
    }

    await db.Database.MigrateAsync();
}

app.Run();

public partial class Program;
