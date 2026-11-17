using Kgp.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kgp.Infrastructure.Persistence;

public sealed class KgpDbContext(DbContextOptions<KgpDbContext> options) : DbContext(options)
{
    public DbSet<Peak> Peaks => Set<Peak>();
    public DbSet<Conquest> Conquests => Set<Conquest>();
    public DbSet<Parking> Parkings => Set<Parking>();
    public DbSet<Trail> Trails => Set<Trail>();
    public DbSet<SeedState> SeedStates => Set<SeedState>();

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

        modelBuilder.Entity<Parking>(parking =>
        {
            parking.ToTable("Parkings");
            parking.HasKey(p => p.Id);
            parking.HasIndex(p => new { p.PeakNumber, p.OsmId }).IsUnique();
            parking.HasOne(p => p.Peak).WithMany().HasForeignKey(p => p.PeakNumber).OnDelete(DeleteBehavior.Cascade);
            parking.Property(p => p.OsmId).HasMaxLength(40);
            parking.Property(p => p.Name).HasMaxLength(200);
            parking.Property(p => p.Location).HasColumnType("geography");
        });

        modelBuilder.Entity<Trail>(trail =>
        {
            trail.HasKey(t => t.Id);
            trail.HasIndex(t => new { t.PeakNumber, t.OsmId }).IsUnique();
            trail.HasOne(t => t.Peak).WithMany().HasForeignKey(t => t.PeakNumber).OnDelete(DeleteBehavior.Cascade);
            trail.Property(t => t.OsmId).HasMaxLength(40);
            trail.Property(t => t.Name).HasMaxLength(400);
            trail.Property(t => t.Ref).HasMaxLength(50);
            trail.Property(t => t.Colour).HasMaxLength(20);
            trail.Property(t => t.Network).HasMaxLength(10);
            trail.Property(t => t.Geometry).HasColumnType("geography");
        });

        modelBuilder.Entity<SeedState>(state =>
        {
            state.HasKey(s => s.Name);
            state.Property(s => s.Name).HasMaxLength(100);
            state.Property(s => s.ContentHash).HasMaxLength(64).IsFixedLength();
        });
    }
}
