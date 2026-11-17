using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kgp.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddConquests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Conquests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PeakNumber = table.Column<int>(type: "int", nullable: false),
                    ConqueredOn = table.Column<DateOnly>(type: "date", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    PhotoBlobName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    PhotoTakenAt = table.Column<DateTime>(type: "datetime2(0)", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Conquests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Conquests_Peaks_PeakNumber",
                        column: x => x.PeakNumber,
                        principalTable: "Peaks",
                        principalColumn: "Number",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Conquests_PeakNumber",
                table: "Conquests",
                column: "PeakNumber");

            migrationBuilder.CreateIndex(
                name: "IX_Conquests_UserId_PeakNumber",
                table: "Conquests",
                columns: new[] { "UserId", "PeakNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Conquests");
        }
    }
}
