using ArccosScraper.Models;
using Simulation.Models;

namespace Simulation.Services;

public sealed class CourseCalibrationService
{
    public CourseCalibrationReport Apply(
        List<ComprehensiveShotRecord> allShots,
        string courseName,
        GolferDna dna,
        SimulationSettings settings)
    {
        var report = new CourseCalibrationReport { CourseName = courseName };
        if (!settings.AutoCalibrateFromHistoricalData)
        {
            report.Enabled = false;
            return report;
        }

        var courseShots = allShots.Where(s => s.CourseName == courseName).ToList();
        if (courseShots.Count == 0)
            return report;

        report.Enabled = true;
        report.TotalShots = courseShots.Count;

        var blend = Clamp(settings.AutoCalibrationBlend, 0, 1);

        CalibrateTeeStrategy(courseShots, dna);
        CalibrateFairwayHitRate(courseShots, dna);
        CalibratePutting(courseShots, dna, settings, blend);
        CalibratePenalties(courseShots, settings, blend, report);
        CalibrateDistanceAndAccuracy(courseShots, dna, settings, blend);

        return report;
    }

    private static void CalibrateTeeStrategy(List<ComprehensiveShotRecord> courseShots, GolferDna dna)
    {
        var teeShots = courseShots.Where(s => s.ShotNumberInHole == 1);
        var groups = teeShots.GroupBy(s => $"{s.CourseName}-{s.HoleNumber}");

        foreach (var group in groups)
        {
            var frequencies = group.GroupBy(s => s.ClubId)
                .Select(g => new { ClubId = g.Key, Count = g.Count() })
                .OrderByDescending(g => g.Count)
                .ToList();

            if (frequencies.Count == 0)
                continue;

            dna.TeeShotStrategy[group.Key] = frequencies[0].ClubId;
            dna.TeeShotDistributions[group.Key] = frequencies
                .Select(g => new TeeClubWeight
                {
                    ClubId = g.ClubId,
                    Weight = g.Count / (double)group.Count()
                })
                .ToList();
        }
    }

    private static void CalibrateFairwayHitRate(List<ComprehensiveShotRecord> courseShots, GolferDna dna)
    {
        var teeDrivingShots = courseShots
            .Where(s => s.ShotNumberInHole == 1 && (s.ClubId == 1 || s.ClubId == 17))
            .ToList();

        if (teeDrivingShots.Count > 0)
            dna.FairwayHitPercentage = teeDrivingShots.Count(s => s.HoleIsFairway) / (double)teeDrivingShots.Count;
    }

    private static void CalibratePutting(
        List<ComprehensiveShotRecord> courseShots,
        GolferDna dna,
        SimulationSettings settings,
        double blend)
    {
        var holeGroups = courseShots
            .GroupBy(s => new { s.RoundId, s.HoleNumber })
            .Select(g => g.ToList())
            .ToList();

        var holeSummaries = holeGroups.Select(g => g[0]).ToList();
        if (holeSummaries.Count == 0)
            return;

        var onePuttPct = 100.0 * holeSummaries.Count(h => h.HolePutts == 1) / holeSummaries.Count;
        var twoPuttPct = 100.0 * holeSummaries.Count(h => h.HolePutts == 2) / holeSummaries.Count;
        var threePuttPct = 100.0 * holeSummaries.Count(h => h.HolePutts >= 3) / holeSummaries.Count;

        dna.PuttingStatistics = new PuttingProfile
        {
            OnePuttPercentage = onePuttPct,
            TwoPuttPercentage = twoPuttPct,
            ThreePuttPercentage = threePuttPct
        };

        var putterDistances = courseShots
            .Where(s => s.ClubId == GolferDna.PutterClubId)
            .Select(s => s.Distance)
            .OrderBy(d => d)
            .ToList();

        if (putterDistances.Count == 0)
            return;

        var putterMedian = putterDistances[putterDistances.Count / 2];
        // Heuristic: Arccos exports very small putter distances in feet for this dataset.
        var threshold = putterMedian <= 12 ? 6.0 : 2.0;

        var attempts = 0;
        var makes = 0;

        foreach (var holeShots in holeGroups)
        {
            var ordered = holeShots.OrderBy(s => s.ShotNumberInHole).ToList();
            var finalShotNumber = ordered[^1].ShotNumberInHole;

            foreach (var shot in ordered.Where(s => s.ClubId == GolferDna.PutterClubId && s.Distance <= threshold))
            {
                attempts++;
                if (shot.ShotNumberInHole == finalShotNumber)
                    makes++;
            }
        }

        if (attempts == 0)
            return;

        var inside6MakePct = 100.0 * makes / attempts;
        settings.MakePercentageInside6Feet = Blend(settings.MakePercentageInside6Feet, inside6MakePct, blend);
    }

    private static void CalibratePenalties(
        List<ComprehensiveShotRecord> courseShots,
        SimulationSettings settings,
        double blend,
        CourseCalibrationReport report)
    {
        var roundGroups = courseShots.GroupBy(s => s.RoundId).ToList();
        if (roundGroups.Count == 0)
            return;

        var penaltiesPerRound = roundGroups
            .Select(g => g.Sum(s => s.Penalties))
            .ToList();

        var avgPenaltiesPerRound = penaltiesPerRound.Average();
        var avgHolesPerRound = roundGroups
            .Select(g => g.Select(s => s.HoleNumber).Distinct().Count())
            .Average();

        report.AveragePenaltiesPerRound = avgPenaltiesPerRound;
        report.AverageHolesPerRound = avgHolesPerRound;

        if (avgHolesPerRound <= 0)
            return;

        var normalizedPer18 = avgPenaltiesPerRound * (18.0 / avgHolesPerRound);
        settings.AveragePenaltiesPer18Holes = Blend(settings.AveragePenaltiesPer18Holes, normalizedPer18, blend);
    }

    private static void CalibrateDistanceAndAccuracy(
        List<ComprehensiveShotRecord> courseShots,
        GolferDna dna,
        SimulationSettings settings,
        double blend)
    {
        if (dna.ClubProfiles.TryGetValue(1, out var driverProfile))
        {
            var observedDriverTee = courseShots
                .Where(s => s.ShotNumberInHole == 1 && s.ClubId == 1)
                .Select(s => s.Distance)
                .ToList();

            if (observedDriverTee.Count >= 5)
            {
                var observed = observedDriverTee.Average();
                var baseDriver = driverProfile.DistanceByLie.GetValueOrDefault(
                    LieType.Tee,
                    driverProfile.DistanceByLie.GetValueOrDefault(LieType.Default, observed));
                var targetBoost = observed - baseDriver;
                settings.DriverDistanceBoostYards = Blend(settings.DriverDistanceBoostYards, targetBoost, blend);
            }
        }

        var holes = courseShots
            .GroupBy(s => new { s.RoundId, s.HoleNumber })
            .Select(g => g.First())
            .ToList();

        if (holes.Count == 0)
            return;

        var girRate = holes.Count(h => h.HoleIsGir) / (double)holes.Count;
        var targetFromGir = Clamp(1.0 + (0.20 - girRate) * 1.5, 0.85, 1.50);

        var roundSummaries = courseShots
            .GroupBy(s => s.RoundId)
            .Select(g => g.First())
            .ToList();

        var targetFromScoring = targetFromGir;
        if (roundSummaries.Count > 0)
        {
            var avgOverUnder = roundSummaries.Average(r => r.RoundOverUnder);
            var avgHolesPerRound = courseShots
                .GroupBy(s => s.RoundId)
                .Select(g => g.Select(s => s.HoleNumber).Distinct().Count())
                .DefaultIfEmpty(9)
                .Average();

            var overPerHole = avgHolesPerRound > 0 ? avgOverUnder / avgHolesPerRound : 0;
            // Anchor dispersion to real scoring pressure.
            targetFromScoring = Clamp(1.0 + (overPerHole * 0.25), 1.0, 1.90);
        }

        var targetMultiplier = Clamp((targetFromScoring * 0.70) + (targetFromGir * 0.30), 0.90, 1.90);
        settings.OverallAccuracyMultiplier = Blend(settings.OverallAccuracyMultiplier, targetMultiplier, blend);
    }

    private static double Blend(double current, double target, double blend) =>
        current + ((target - current) * blend);

    private static double Clamp(double value, double min, double max) =>
        Math.Min(max, Math.Max(min, value));
}

public sealed class CourseCalibrationReport
{
    public bool Enabled { get; set; }
    public string CourseName { get; set; } = string.Empty;
    public int TotalShots { get; set; }
    public double AveragePenaltiesPerRound { get; set; }
    public double AverageHolesPerRound { get; set; }
}
