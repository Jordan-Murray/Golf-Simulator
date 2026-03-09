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
        CalibrateShortGame(courseShots, dna, settings, blend);
        CalibrateClubDispersion(courseShots, dna, blend);
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
        var firstPuttSnapshots = new List<(double StartFeet, int PuttsOnHole)>();

        foreach (var holeShots in holeGroups)
        {
            var ordered = holeShots.OrderBy(s => s.ShotNumberInHole).ToList();
            var finalShotNumber = ordered[^1].ShotNumberInHole;
            var firstPutt = ordered.FirstOrDefault(s => s.ClubId == GolferDna.PutterClubId);
            if (firstPutt != null)
            {
                var firstFeet = putterMedian <= 12 ? firstPutt.Distance : firstPutt.Distance * 3.0;
                var puttsOnHole = Math.Max(1, ordered[0].HolePutts);
                firstPuttSnapshots.Add((firstFeet, puttsOnHole));
            }

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

        if (firstPuttSnapshots.Count > 0)
            dna.PuttingBandProfiles = BuildPuttingBandProfiles(firstPuttSnapshots);
    }

    private static List<PuttingBandProfile> BuildPuttingBandProfiles(List<(double StartFeet, int PuttsOnHole)> samples)
    {
        var bands = new[] { 6.0, 12.0, 20.0, 35.0, 80.0 };
        var profiles = new List<PuttingBandProfile>();

        foreach (var maxFeet in bands)
        {
            var minFeet = profiles.Count == 0 ? 0 : profiles[^1].MaxDistanceFeet;
            var bucket = samples
                .Where(s => s.StartFeet > minFeet && s.StartFeet <= maxFeet)
                .ToList();

            if (bucket.Count < 6)
                continue;

            var one = 100.0 * bucket.Count(s => s.PuttsOnHole <= 1) / bucket.Count;
            var two = 100.0 * bucket.Count(s => s.PuttsOnHole == 2) / bucket.Count;
            var three = 100.0 * bucket.Count(s => s.PuttsOnHole >= 3) / bucket.Count;

            profiles.Add(new PuttingBandProfile
            {
                MaxDistanceFeet = maxFeet,
                OnePuttPercentage = one,
                TwoPuttPercentage = two,
                ThreePuttPercentage = three
            });
        }

        return profiles;
    }

    private static void CalibrateClubDispersion(
        List<ComprehensiveShotRecord> courseShots,
        GolferDna dna,
        double blend)
    {
        foreach (var profile in dna.ClubProfiles.Values.Where(c => c.ClubId != GolferDna.PutterClubId))
        {
            var samples = courseShots
                .Where(s => s.ClubId == profile.ClubId && s.Distance >= 20)
                .Select(s => s.Distance)
                .OrderBy(d => d)
                .ToList();

            if (samples.Count < 12)
                continue;

            var trim = (int)Math.Floor(samples.Count * 0.10);
            var trimmed = samples.Skip(trim).Take(samples.Count - (2 * trim)).ToList();
            if (trimmed.Count < 6)
                continue;

            var mean = trimmed.Average();
            var variance = trimmed.Average(v => Math.Pow(v - mean, 2));
            var observedStdDev = Math.Sqrt(variance);
            var targetStdDev = Clamp(observedStdDev, 4, 55);
            profile.StandardDeviation = Blend(profile.StandardDeviation, targetStdDev, blend);
        }
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

        var holeScores = courseShots
            .GroupBy(s => new { s.RoundId, s.HoleNumber })
            .Select(g => g.Count() + g.Sum(s => s.Penalties))
            .ToList();

        if (holeScores.Count > 0)
        {
            var blowupRate = holeScores.Count(s => s >= 6) / (double)holeScores.Count;
            settings.BlowupHoleChancePerHole = Blend(settings.BlowupHoleChancePerHole, Clamp(blowupRate * 0.55, 0.03, 0.35), blend);
        }
    }

    private static void CalibrateShortGame(
        List<ComprehensiveShotRecord> courseShots,
        GolferDna dna,
        SimulationSettings settings,
        double blend)
    {
        var holeGroups = courseShots
            .GroupBy(s => new { s.RoundId, s.HoleNumber })
            .Select(g => g.OrderBy(s => s.ShotNumberInHole).ToList())
            .ToList();

        var putterShots = courseShots.Where(s => s.ClubId == GolferDna.PutterClubId).Select(s => s.Distance).OrderBy(d => d).ToList();
        var putterMedian = putterShots.Count > 0 ? putterShots[putterShots.Count / 2] : 8.0;
        var putterIsFeet = putterMedian <= 12;

        var attempts = 0;
        var greenHits = 0;
        var leaveFeetSamples = new List<double>();
        var duffCount = 0;

        foreach (var hole in holeGroups)
        {
            var firstPuttIdx = hole.FindIndex(s => s.ClubId == GolferDna.PutterClubId);
            if (firstPuttIdx <= 0) continue;

            var shortGameShot = hole[firstPuttIdx - 1];
            if (shortGameShot.ClubId == GolferDna.PutterClubId || shortGameShot.Distance > 60) continue;

            attempts++;
            greenHits++;

            var firstPutt = hole[firstPuttIdx];
            var leaveFeet = putterIsFeet ? firstPutt.Distance : firstPutt.Distance * 3.0;
            leaveFeetSamples.Add(Clamp(leaveFeet, 1, 45));

            if (shortGameShot.Distance <= 8)
                duffCount++;
        }

        if (attempts == 0) return;

        var observedGreenHitRate = greenHits / (double)attempts;
        var meanLeave = leaveFeetSamples.Count > 0 ? leaveFeetSamples.Average() : 9.0;
        var stdLeave = leaveFeetSamples.Count > 1
            ? Math.Sqrt(leaveFeetSamples.Average(v => Math.Pow(v - meanLeave, 2)))
            : 4.0;
        var observedDuffChance = duffCount / (double)attempts;

        dna.ShortGameProfile = new ShortGameProfile
        {
            GreenHitRate = Clamp(Blend(dna.ShortGameProfile.GreenHitRate, observedGreenHitRate, blend), 0.35, 0.92),
            LeaveDistanceMeanFeet = Clamp(Blend(dna.ShortGameProfile.LeaveDistanceMeanFeet, meanLeave, blend), 3, 24),
            LeaveDistanceStdFeet = Clamp(Blend(dna.ShortGameProfile.LeaveDistanceStdFeet, stdLeave, blend), 1.5, 12),
            DuffChance = Clamp(Blend(dna.ShortGameProfile.DuffChance, observedDuffChance, blend), 0.02, 0.35)
        };

        settings.ExtraStrokesPerHole = Blend(settings.ExtraStrokesPerHole, Clamp(observedDuffChance * 1.4, 0, 0.9), blend * 0.5);
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
