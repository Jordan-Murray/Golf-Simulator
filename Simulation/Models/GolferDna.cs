namespace Simulation.Models;

public class GolferDna
{
    public Dictionary<int, ClubPerformanceProfile> ClubProfiles { get; set; } = [];
    public PuttingProfile PuttingStatistics { get; set; } = new();
    public double FairwayHitPercentage { get; set; }
    public Dictionary<string, int> TeeShotStrategy { get; set; } = [];
    public Dictionary<string, List<TeeClubWeight>> TeeShotDistributions { get; set; } = [];

    public const int PutterClubId = 13;
}
