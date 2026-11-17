using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;

namespace Kgp.Api.Auth;

public sealed class AuthOptions
{
    /// <summary>e.g. https://&lt;tenant-subdomain&gt;.ciamlogin.com/&lt;tenant-id&gt;/v2.0. Empty: sign-in is off.</summary>
    public string? Authority { get; set; }
    /// <summary>The kgp-api app registration's client ID.</summary>
    public string? Audience { get; set; }
}

/// <summary>Entra External ID bearer tokens for /api/me/* (ADR 0003).</summary>
public static class AuthSetup
{
    public const string ConquestsPolicy = "conquests";
    public const string ConquestsScope = "Conquests.ReadWrite";
    public const string UserIdClaim = "oid";
    public const string ScopeClaim = "scp";

    public static IServiceCollection AddKgpAuth(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection("Auth").Get<AuthOptions>() ?? new AuthOptions();
        var enabled = !string.IsNullOrWhiteSpace(options.Authority) && !string.IsNullOrWhiteSpace(options.Audience);

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(jwt =>
            {
                // Keep the token's claim names (oid, scp) instead of the legacy WS-Fed URIs.
                jwt.MapInboundClaims = false;
                jwt.TokenValidationParameters.NameClaimType = UserIdClaim;

                if (enabled)
                {
                    jwt.Authority = options.Authority;
                    // v2 tokens carry the client ID; accept the App ID URI form too.
                    jwt.TokenValidationParameters.ValidAudiences = [options.Audience, $"api://{options.Audience}"];
                }
                else
                {
                    // Sign-in not configured (no external tenant yet): ignore any token, so /api/me/* answers 401.
                    jwt.Events = new JwtBearerEvents
                    {
                        OnMessageReceived = context =>
                        {
                            context.NoResult();
                            return Task.CompletedTask;
                        },
                    };
                }
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(ConquestsPolicy, policy => policy
                .RequireAuthenticatedUser()
                .RequireAssertion(context => TryGetUserId(context.User, out _))
                .RequireAssertion(context => HasScope(context.User, ConquestsScope)));

        return services;
    }

    public static bool HasScope(ClaimsPrincipal user, string scope) =>
        user.FindAll(ScopeClaim).Any(c => c.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains(scope, StringComparer.Ordinal));

    public static bool TryGetUserId(ClaimsPrincipal user, out Guid userId) =>
        Guid.TryParse(user.FindFirst(UserIdClaim)?.Value, out userId) && userId != Guid.Empty;

    /// <summary>The caller's <c>oid</c>. Only valid behind <see cref="ConquestsPolicy"/>, which guarantees it.</summary>
    public static Guid GetUserId(this ClaimsPrincipal user) =>
        TryGetUserId(user, out var id) ? id : throw new InvalidOperationException("The user has no valid oid claim.");
}
