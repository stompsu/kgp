var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:4200"])
          .AllowAnyHeader()
          .AllowAnyMethod()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }))
   .WithName("Health");

app.Run();

public partial class Program;
