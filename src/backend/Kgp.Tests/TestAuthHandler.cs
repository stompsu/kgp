using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Kgp.Tests;

/// <summary>
/// Stands in for JWT bearer in tests: X-Test-User becomes the <c>oid</c> claim, X-Test-Scope the <c>scp</c> claim.
/// No header: no result, so the authorization policy answers 401 as it would for a missing token.
/// </summary>
public sealed class TestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";
    public const string UserHeader = "X-Test-User";
    public const string ScopeHeader = "X-Test-Scope";

    public static void Register(IServiceCollection services) =>
        services.AddAuthentication(o =>
            {
                o.DefaultScheme = SchemeName;
                o.DefaultAuthenticateScheme = SchemeName;
                o.DefaultChallengeScheme = SchemeName;
            })
            .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(SchemeName, _ => { });

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(UserHeader, out var user))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var claims = new List<Claim> { new("oid", user.ToString()) };
        if (Request.Headers.TryGetValue(ScopeHeader, out var scope))
        {
            claims.Add(new Claim("scp", scope.ToString()));
        }

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName, "oid", null));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
    }
}
