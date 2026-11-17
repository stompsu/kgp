using Kgp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kgp.Infrastructure.Persistence;

public sealed class KgpDbContext(DbContextOptions<KgpDbContext> options) : DbContext(options)
{
    public DbSet<Peak> Peaks => Set<Peak>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Peak>(peak =>
        {
            peak.HasKey(p => p.Number);
            peak.Property(p => p.Number).ValueGeneratedNever();
            peak.Property(p => p.Slug).HasMaxLength(64);
            peak.HasIndex(p => p.Slug).IsUnique();
            peak.Property(p => p.Name).HasMaxLength(100);
            peak.Property(p => p.Range).HasMaxLength(100);
            peak.Property(p => p.Location).HasColumnType("geography");
            peak.Property(p => p.NotesPl).HasMaxLength(1000);
            peak.Property(p => p.NotesEn).HasMaxLength(1000);
        });
    }
}
