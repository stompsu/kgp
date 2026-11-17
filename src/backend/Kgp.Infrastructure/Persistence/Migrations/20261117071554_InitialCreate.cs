using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;

#nullable disable

namespace Kgp.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Peaks",
                columns: table => new
                {
                    Number = table.Column<int>(type: "int", nullable: false),
                    Slug = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Range = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    HeightMeters = table.Column<int>(type: "int", nullable: false),
                    Location = table.Column<Point>(type: "geography", nullable: true),
                    NotesPl = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    NotesEn = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Sources = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Peaks", x => x.Number);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Peaks_Slug",
                table: "Peaks",
                column: "Slug",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Peaks");
        }
    }
}
