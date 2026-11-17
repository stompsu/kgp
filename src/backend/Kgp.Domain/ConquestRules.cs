namespace Kgp.Domain;

/// <summary>Input rules for a conquest (docs/api.md, <c>ConquestRequest</c>).</summary>
public static class ConquestRules
{
    public const int NotesMaxLength = 2000;
    public static readonly DateOnly MinDate = new(1900, 1, 1);

    /// <summary>KGP is a Polish badge, so "today" is the calendar date in Poland, not on the server.</summary>
    public static readonly TimeZoneInfo PolandTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Warsaw");

    public static DateOnly TodayInPoland(TimeProvider time) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(time.GetUtcNow(), PolandTimeZone).DateTime);

    /// <summary>Trims notes; empty or whitespace becomes null.</summary>
    public static string? NormalizeNotes(string? notes) =>
        string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();

    /// <summary>
    /// Validates already-normalized input. Returns errors keyed by JSON field name
    /// (<c>conqueredOn</c>, <c>notes</c>); empty when valid.
    /// </summary>
    public static Dictionary<string, string[]> Validate(DateOnly? conqueredOn, string? normalizedNotes, DateOnly today)
    {
        var errors = new Dictionary<string, string[]>();

        if (conqueredOn is not { } date)
        {
            errors["conqueredOn"] = ["Data zdobycia jest wymagana. / The conquest date is required."];
        }
        else if (date > today)
        {
            errors["conqueredOn"] = ["Data zdobycia nie może być w przyszłości. / The conquest date cannot be in the future."];
        }
        else if (date < MinDate)
        {
            errors["conqueredOn"] = ["Data zdobycia nie może być wcześniejsza niż 1900-01-01. / The conquest date cannot be before 1900-01-01."];
        }

        if (normalizedNotes is { Length: > NotesMaxLength })
        {
            errors["notes"] = [$"Notatka może mieć najwyżej {NotesMaxLength} znaków. / Notes can be at most {NotesMaxLength} characters."];
        }

        return errors;
    }
}
