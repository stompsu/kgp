using Kgp.Api.Peaks;
using Kgp.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddKgpInfrastructure(builder.Configuration);
builder.Services.AddOutputCache(options =>
    options.AddPolicy(PeakEndpoints.CachePolicy, policy => policy.Expire(TimeSpan.FromHours(1))));
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:4200"])
          .AllowAnyHeader()
          .AllowAnyMethod()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseExceptionHandler();
app.UseCors();
app.UseOutputCache();

// Liveness only: must not touch the database, which may be paused.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }))
   .WithName("Health");

app.MapPeakEndpoints();

app.Run();

public partial class Program;
