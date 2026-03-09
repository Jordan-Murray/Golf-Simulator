namespace Simulation.Models;

public class GolferDna
{
    public Dictionary<int, ClubPerformanceProfile> ClubProfiles { get; set; } = [];
    public PuttingProfile PuttingStatistics { get; set; } = new();
    public List<PuttingBandProfile> PuttingBandProfiles { get; set; } = [];
    public ShortGameProfile ShortGameProfile { get; set; } = new();
    public Dictionary<int, double> ClubUsagePercentage { get; set; } = [];
    public Dictionary<int, double> ClubPracticalMaxDistance { get; set; } = [];
    public Dictionary<int, double> ClubDistanceP25 { get; set; } = [];
    public Dictionary<int, double> ClubDistanceP75 { get; set; } = [];
    public double FairwayHitPercentage { get; set; }
    public Dictionary<string, int> TeeShotStrategy { get; set; } = [];
    public Dictionary<string, List<TeeClubWeight>> TeeShotDistributions { get; set; } = [];

    public const int PutterClubId = 13;
}
