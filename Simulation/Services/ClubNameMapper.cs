namespace Simulation.Services;

public static class ClubNameMapper
{
    private static readonly Dictionary<int, string> ClubNames = new()
{
    { 1, "Driver" },
    { 17, "3 Wood" },
    { 2, "4 Hybrid" },
    { 3, "5 Iron" },
    { 4, "6 Iron" },
    { 5, "7 Iron" },
    { 6, "8 Iron" },
    { 7, "9 Iron" },
    { 8, "Pitching Wedge" },
    { 10, "Approach Wedge (46°)" },
    { 9, "Gap Wedge (50°)" },
    { 11, "Sand Wedge (56°)" },
    { 12, "Lob Wedge (60°)" },
    { 13, "Putter" }
};

    public static string GetClubName(int clubId)
    {
        return ClubNames.GetValueOrDefault(clubId, $"Unknown Club ({clubId})");
    }
}
