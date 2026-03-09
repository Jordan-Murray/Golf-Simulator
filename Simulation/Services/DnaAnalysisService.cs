using ArccosScraper.Models;
using Simulation.Models;
using System.Text.Json;

namespace Simulation.Services;

public class DnaAnalysisService
{
    public GolferDna BuildDna(List<ComprehensiveShotRecord> historicalShots, string smartDistancesJsonPath, string dashboardAnalysisJsonPath)
    {
        var dna = new GolferDna();

        // 1. Analyze club performance (non-putts)
        var jsonContent = File.ReadAllText(smartDistancesJsonPath);
        var smartData = JsonSerializer.Deserialize<List<SmartClubData>>(jsonContent) ?? [];

        foreach (var clubData in smartData.Where(c => c.Range != null))
        {
            var range = clubData.Range!;
            var profile = new ClubPerformanceProfile
            {
                ClubId = clubData.ClubId,
                // Calculate standard deviation from the provided range. A simple heuristic.
                StandardDeviation = (range.High - range.Low) / 4.0
            };

            // Populate distances for different lies.
            if (clubData.Terrain?.Tee?.Distance > 0) profile.DistanceByLie[LieType.Tee] = clubData.Terrain.Tee.Distance;
            if (clubData.Terrain?.Fairway?.Distance > 0) profile.DistanceByLie[LieType.Fairway] = clubData.Terrain.Fairway.Distance;
            if (clubData.Terrain?.Rough?.Distance > 0) profile.DistanceByLie[LieType.Rough] = clubData.Terrain.Rough.Distance;
            if (clubData.Terrain?.Sand?.Distance > 0) profile.DistanceByLie[LieType.Sand] = clubData.Terrain.Sand.Distance;

            // Add a fallback default distance.
            if (clubData.SmartDistance != null) profile.DistanceByLie[LieType.Default] = clubData.SmartDistance.Distance;

            dna.ClubProfiles[clubData.ClubId] = profile;
        }


        // 2. Analyze fairway hit percentage for driving clubs
        var teeShots = historicalShots.Where(s => s.ShotNumberInHole == 1);
        var strategyGroups = teeShots.GroupBy(s => $"{s.CourseName}-{s.HoleNumber}");

        foreach (var group in strategyGroups)
        {
            var clubFrequencies = group.GroupBy(g => g.ClubId)
                                       .Select(c => new { ClubId = c.Key, Count = c.Count() })
                                       .OrderByDescending(c => c.Count)
                                       .ToList();

            var mostCommonClub = clubFrequencies[0].ClubId;
            dna.TeeShotStrategy[group.Key] = mostCommonClub;
            dna.TeeShotDistributions[group.Key] = clubFrequencies
                .Select(c => new TeeClubWeight
                {
                    ClubId = c.ClubId,
                    Weight = c.Count / (double)group.Count()
                })
                .ToList();
        }

        var usageSamples = historicalShots
            .Where(s => s.ClubId > 0 && s.ClubId != GolferDna.PutterClubId)
            .ToList();
        if (usageSamples.Count > 0)
        {
            var byClub = usageSamples.GroupBy(s => s.ClubId);
            foreach (var grp in byClub)
            {
                dna.ClubUsagePercentage[grp.Key] = grp.Count() / (double)usageSamples.Count;

                var ordered = grp.Select(s => s.Distance).OrderBy(d => d).ToList();
                if (ordered.Count > 0)
                {
                    var idx = (int)Math.Floor((ordered.Count - 1) * 0.95);
                    dna.ClubPracticalMaxDistance[grp.Key] = ordered[Math.Clamp(idx, 0, ordered.Count - 1)];

                    var p25Idx = (int)Math.Floor((ordered.Count - 1) * 0.25);
                    var p75Idx = (int)Math.Floor((ordered.Count - 1) * 0.75);
                    dna.ClubDistanceP25[grp.Key] = ordered[Math.Clamp(p25Idx, 0, ordered.Count - 1)];
                    dna.ClubDistanceP75[grp.Key] = ordered[Math.Clamp(p75Idx, 0, ordered.Count - 1)];
                }
            }
        }

        // What's your overall fairway hit percentage?
        var drivingShots = historicalShots
            .Where(s => s.ShotNumberInHole == 1 && (s.ClubId == 1 || s.ClubId == 17))
            .ToList();
        if (drivingShots.Any())
        {
            dna.FairwayHitPercentage = drivingShots.Count(s => s.HoleIsFairway) / (double)drivingShots.Count;
        }
        else
        {
            dna.FairwayHitPercentage = 0.5;
        }

        DashboardAnalysis? analysisData = null;
        if (File.Exists(dashboardAnalysisJsonPath))
        {
            try
            {
                var analysisJson = File.ReadAllText(dashboardAnalysisJsonPath);
                analysisData = JsonSerializer.Deserialize<DashboardAnalysis>(analysisJson);
            }
            catch
            {
                analysisData = null;
            }
        }

        var puttStats = analysisData?.Putting?.AveragePuttsPerRound;
        dna.PuttingStatistics = puttStats == null
            ? new PuttingProfile { OnePuttPercentage = 8, TwoPuttPercentage = 82, ThreePuttPercentage = 10 }
            : new PuttingProfile
            {
                OnePuttPercentage = puttStats.OnePutt.Value,
                TwoPuttPercentage = puttStats.TwoPutt.Value,
                ThreePuttPercentage = puttStats.ThreePutt.Value
            };

        return dna;
    }
}
