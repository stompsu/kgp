using Kgp.Domain;

namespace Kgp.Tests;

public class ConquestRulesTests
{
    private sealed class FixedTime(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    [Fact]
    public void Today_is_the_calendar_date_in_Poland_not_UTC()
    {
        // 22:30 UTC on 14 August is 00:30 on 15 August in Warsaw (CEST, UTC+2).
        var time = new FixedTime(new DateTimeOffset(2025, 8, 14, 22, 30, 0, TimeSpan.Zero));

        Assert.Equal(new DateOnly(2025, 8, 15), ConquestRules.TodayInPoland(time));
    }

    [Fact]
    public void Today_in_winter_uses_CET()
    {
        // 23:30 UTC on 31 December is 00:30 on 1 January in Warsaw (CET, UTC+1); 22:59 UTC is still 31 December.
        Assert.Equal(new DateOnly(2026, 1, 1), ConquestRules.TodayInPoland(new FixedTime(new(2025, 12, 31, 23, 30, 0, TimeSpan.Zero))));
        Assert.Equal(new DateOnly(2025, 12, 31), ConquestRules.TodayInPoland(new FixedTime(new(2025, 12, 31, 22, 59, 0, TimeSpan.Zero))));
    }

    [Fact]
    public void Today_is_valid_tomorrow_is_not()
    {
        var today = new DateOnly(2025, 8, 15);

        Assert.Empty(ConquestRules.Validate(today, null, today));
        Assert.Equal(["conqueredOn"], ConquestRules.Validate(today.AddDays(1), null, today).Keys);
    }

    [Fact]
    public void Date_is_required_and_not_before_1900()
    {
        var today = new DateOnly(2025, 8, 15);

        Assert.Contains("conqueredOn", ConquestRules.Validate(null, null, today).Keys);
        Assert.Contains("conqueredOn", ConquestRules.Validate(new DateOnly(1899, 12, 31), null, today).Keys);
        Assert.Empty(ConquestRules.Validate(new DateOnly(1900, 1, 1), null, today));
    }

    [Fact]
    public void Notes_up_to_2000_characters_are_valid()
    {
        var today = new DateOnly(2025, 8, 15);

        Assert.Empty(ConquestRules.Validate(today, new string('a', 2000), today));
        Assert.Equal(["notes"], ConquestRules.Validate(today, new string('a', 2001), today).Keys);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("   \n\t", null)]
    [InlineData("  Mgła na szczycie. ", "Mgła na szczycie.")]
    public void Notes_are_trimmed_and_empty_becomes_null(string? input, string? expected)
    {
        Assert.Equal(expected, ConquestRules.NormalizeNotes(input));
    }

    [Fact]
    public void Notes_length_is_checked_after_trimming()
    {
        var today = new DateOnly(2025, 8, 15);
        var notes = ConquestRules.NormalizeNotes("  " + new string('a', 2000) + "  ");

        Assert.Empty(ConquestRules.Validate(today, notes, today));
    }
}
