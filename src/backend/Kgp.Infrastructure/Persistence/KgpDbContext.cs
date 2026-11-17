using Kgp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kgp.Infrastructure.Persistence;

public sealed class KgpDbContext(DbContextOptions<KgpDbContext> options) : DbContext(options)
{
    public DbSet<Peak> Peaks => Set<Peak>();
    public DbSet<Conquest> Conquests => Set<Conquest>();

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

        modelBuilder.Entity<Conquest>(conquest =>
        {
            conquest.HasKey(c => c.Id);
            conquest.Property(c => c.Id).ValueGeneratedNever();
            // One conquest per user and peak (ADR 0003). Also serves "all conquests of a user" queries.
            conquest.HasIndex(c => new { c.UserId, c.PeakNumber }).IsUnique();
            conquest.HasOne(c => c.Peak).WithMany().HasForeignKey(c => c.PeakNumber).OnDelete(DeleteBehavior.Restrict);
            conquest.Property(c => c.Notes).HasMaxLength(ConquestRules.NotesMaxLength);
            conquest.Property(c => c.PhotoBlobName).HasMaxLength(200);
            conquest.Property(c => c.PhotoTakenAt).HasColumnType("datetime2(0)");
        });
    }
}
