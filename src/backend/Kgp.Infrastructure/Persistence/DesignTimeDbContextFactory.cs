using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Kgp.Infrastructure.Persistence;

/// <summary>Used only by `dotnet ef migrations add`; never connects to a database.</summary>
internal sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<KgpDbContext>
{
    public KgpDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<KgpDbContext>()
            .UseSqlServer("Server=design-time;Database=kgp", sql => sql.UseNetTopologySuite())
            .Options);
}
