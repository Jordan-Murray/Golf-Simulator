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
        var smartData = JsonSerializer.Deserialize<List<SmartClubData>>(jsonContent);

        foreach (var clubData in smartData.Where(c => c.Range != null))
        {
            var profile = new ClubPerformanceProfile
            {
                ClubId = clubData.ClubId,
                // Calculate standard deviation from the provided range. A simple heuristic.
                StandardDeviation = (clubData.Range.High - clubData.Range.Low) / 4.0
            };

            // Populate distances for different lies.
            if (clubData.Terrain?.Tee?.Distance > 0) profile.DistanceByLie["Tee"] = clubData.Terrain.Tee.Distance;
            if (clubData.Terrain?.Fairway?.Distance > 0) profile.DistanceByLie["Fairway"] = clubData.Terrain.Fairway.Distance;
            if (clubData.Terrain?.Rough?.Distance > 0) profile.DistanceByLie["Rough"] = clubData.Terrain.Rough.Distance;
            if (clubData.Terrain?.Sand?.Distance > 0) profile.DistanceByLie["Sand"] = clubData.Terrain.Sand.Distance;

            // Add a fallback default distance.
            if (clubData.SmartDistance != null) profile.DistanceByLie["Default"] = clubData.SmartDistance.Distance;

            dna.ClubProfiles[clubData.ClubId] = profile;
        }


        // 2. Analyze fairway hit percentage for driving clubs
        var teeShots = historicalShots.Where(s => s.ShotNumberInHole == 1);
        var strategyGroups = teeShots.GroupBy(s => $"{s.CourseName}-{s.HoleNumber}");

        foreach (var group in strategyGroups)
        {
            var mostCommonClub = group.GroupBy(g => g.ClubId)
                                      .OrderByDescending(c => c.Count())
                                      .Select(c => c.Key)
                                      .First();
            dna.TeeShotStrategy[group.Key] = mostCommonClub;
        }

        // What's your overall fairway hit percentage?
        var drivingShots = historicalShots.Where(s => s.ClubId == 1 || s.ClubId == 17).ToList();
        if (drivingShots.Any())
        {
            dna.FairwayHitPercentage = drivingShots.Count(s => s.HoleIsFairway) / (double)drivingShots.Count;
        }

        var analysisJson = File.ReadAllText(dashboardAnalysisJsonPath);
        var analysisData = JsonSerializer.Deserialize<DashboardAnalysis>(analysisJson);

        if (analysisData != null)
        {
            var puttStats = analysisData.Putting.AveragePuttsPerRound;
            dna.PuttingStatistics = new PuttingProfile
            {
                OnePuttPercentage = puttStats.OnePutt.Value,
                TwoPuttPercentage = puttStats.TwoPutt.Value,
                ThreePuttPercentage = puttStats.ThreePutt.Value
            };
        }

        return dna;
    }
}
