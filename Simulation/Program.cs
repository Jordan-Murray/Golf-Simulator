using System.Linq;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Simulation.Models;
using Simulation.Services;

const string CourseToSimulate = "Pottergate GC";
const string SettingsFilePath = "simulation_settings.json";

var settings = LoadSettings(SettingsFilePath);
var repoRoot = FindRepoRootOrThrow();
var arccosOutputDir = Path.Combine(repoRoot, "ArccosScraper", "bin", "Debug", "net9.0");

var inputCsvPath = Path.Combine(arccosOutputDir, "arccos_shot_data_comprehensive.csv");
var smartDistJsonInputPath = Path.Combine(arccosOutputDir, "smart_distances.json");
var dashboardJsonInputPath = Path.Combine(arccosOutputDir, "dashboard_analysis.json");

Console.WriteLine("Loading Arccos data sources...");
var allShots = CsvDataReaderService.ReadShots(inputCsvPath);
var dnaService = new DnaAnalysisService();
var baseGolferDna = dnaService.BuildDna(allShots, smartDistJsonInputPath, dashboardJsonInputPath);
var courseLayout = new CourseFactory().BuildCourse(allShots, CourseToSimulate);
var calibrationLayout = BuildCalibrationLayout(allShots, CourseToSimulate, courseLayout);

var calibration = new CourseCalibrationService();
var report = calibration.Apply(allShots, CourseToSimulate, baseGolferDna, settings);
if (report.Enabled)
{
    Console.WriteLine($"Auto-calibrated from {report.TotalShots} shots at {report.CourseName}.");
    Console.WriteLine($"Tuned settings: penalties/18={settings.AveragePenaltiesPer18Holes:F2}, make<=6ft={settings.MakePercentageInside6Feet:F1}%, " +
                      $"driverBoost={settings.DriverDistanceBoostYards:F1}, accuracyMult={settings.OverallAccuracyMultiplier:F2}");
}

var targetAveragePerHole = GetHistoricalAverageScorePerHole(allShots, CourseToSimulate);
if (targetAveragePerHole > 0 && calibrationLayout.Holes.Count > 0)
{
    var tunedMultiplier = TuneAccuracyToTargetScorePerHole(baseGolferDna, settings, calibrationLayout, targetAveragePerHole, roundsPerProbe: 80);
    settings.OverallAccuracyMultiplier = tunedMultiplier;
    var predictedPerHole = ProbeAverageScorePerHole(baseGolferDna, settings, calibrationLayout, tunedMultiplier, 100);
    settings.ExtraStrokesPerHole = Math.Max(0, targetAveragePerHole - predictedPerHole);
    var holesPerRound = calibrationLayout.Holes.Count;
    Console.WriteLine($"Score calibration: target avg {(targetAveragePerHole * holesPerRound):F1}, tuned accuracyMult={settings.OverallAccuracyMultiplier:F2}");
    Console.WriteLine($"Score calibration: predicted avg {(predictedPerHole * holesPerRound):F1}, extraStrokes/hole={settings.ExtraStrokesPerHole:F2}");
}

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddSingleton(baseGolferDna);
builder.Services.AddSingleton(settings);
builder.Services.AddSingleton<IClubSelector, DefaultClubSelector>();
builder.Services.AddSingleton<ILieManager, DefaultLieManager>();
builder.Services.AddSingleton<IPuttingModel, DefaultPuttingModel>();
builder.Services.AddSingleton<IPenaltyManager, DefaultPenaltyManager>();
builder.Services.AddSingleton<SimulationService>();

var host = builder.Build();
var simService = host.Services.GetRequiredService<SimulationService>();

var menu = new SimulationMenu(simService, courseLayout);
menu.Start();

static SimulationSettings LoadSettings(string settingsPath)
{
    if (!File.Exists(settingsPath))
        return new SimulationSettings();

    return JsonSerializer.Deserialize<SimulationSettings>(File.ReadAllText(settingsPath)) ?? new SimulationSettings();
}

static string FindRepoRootOrThrow()
{
    var probe = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (probe != null)
    {
        var simulationDir = Path.Combine(probe.FullName, "Simulation");
        var arccosDir = Path.Combine(probe.FullName, "ArccosScraper");
        if (Directory.Exists(simulationDir) && Directory.Exists(arccosDir))
            return probe.FullName;
        probe = probe.Parent;
    }

    throw new DirectoryNotFoundException("Could not locate repository root containing both Simulation and ArccosScraper.");
}

static double GetHistoricalAverageScorePerHole(List<ArccosScraper.Models.ComprehensiveShotRecord> allShots, string courseName)
{
    var rounds = allShots
        .Where(s => s.CourseName == courseName)
        .GroupBy(s => s.RoundId);

    var totals = rounds
        .Select(g =>
        {
            var first = g.First();
            var holesPlayed = g.Select(s => s.HoleNumber).Distinct().Count();
            if (holesPlayed <= 0) return (double?)null;
            return (first.RoundPar + first.RoundOverUnder) / (double)holesPlayed;
        })
        .Where(v => v.HasValue)
        .Select(v => v!.Value)
        .ToList();

    if (totals.Count == 0)
        return 0;

    return totals.Average();
}

static CourseLayout BuildCalibrationLayout(
    List<ArccosScraper.Models.ComprehensiveShotRecord> allShots,
    string courseName,
    CourseLayout fullLayout)
{
    if (fullLayout.Holes.Count == 0)
        return fullLayout;

    var holesPlayedPerRound = allShots
        .Where(s => s.CourseName == courseName)
        .GroupBy(s => s.RoundId)
        .Select(g => g.Select(s => s.HoleNumber).Distinct().Count())
        .Where(c => c > 0)
        .ToList();

    if (holesPlayedPerRound.Count == 0)
        return fullLayout;

    var modeHoles = holesPlayedPerRound
        .GroupBy(c => c)
        .OrderByDescending(g => g.Count())
        .ThenBy(g => g.Key)
        .First().Key;

    modeHoles = Math.Min(modeHoles, fullLayout.Holes.Count);

    return new CourseLayout
    {
        CourseName = fullLayout.CourseName,
        Holes = fullLayout.Holes.OrderBy(h => h.HoleNumber).Take(modeHoles).ToList()
    };
}

static double TuneAccuracyToTargetScorePerHole(
    GolferDna dna,
    SimulationSettings baseSettings,
    CourseLayout courseLayout,
    double targetAveragePerHole,
    int roundsPerProbe)
{
    var bestMultiplier = baseSettings.OverallAccuracyMultiplier;
    var bestGap = double.MaxValue;

    for (double candidate = 0.8; candidate <= 5.0; candidate += 0.2)
    {
        var probePerHole = ProbeAverageScorePerHole(dna, baseSettings, courseLayout, candidate, roundsPerProbe);
        var gap = Math.Abs(probePerHole - targetAveragePerHole);
        if (gap < bestGap)
        {
            bestGap = gap;
            bestMultiplier = candidate;
        }
    }

    return bestMultiplier;
}

static double ProbeAverageScorePerHole(
    GolferDna dna,
    SimulationSettings baseSettings,
    CourseLayout courseLayout,
    double accuracyMultiplier,
    int rounds)
{
    var probeSettings = CloneSettings(baseSettings);
    probeSettings.OverallAccuracyMultiplier = accuracyMultiplier;

    var sim = new SimulationService(
        dna,
        new DefaultClubSelector(),
        new DefaultLieManager(),
        new DefaultPuttingModel(dna, probeSettings),
        new DefaultPenaltyManager(probeSettings),
        probeSettings);

    var total = 0.0;
    for (int i = 0; i < rounds; i++)
    {
        var rnd = sim.Run(courseLayout, verbose: false);
        total += rnd.TotalScore;
    }

    var avgRoundScore = total / rounds;
    return avgRoundScore / Math.Max(1, courseLayout.Holes.Count);
}

static SimulationSettings CloneSettings(SimulationSettings src) =>
    new()
    {
        AveragePenaltiesPer18Holes = src.AveragePenaltiesPer18Holes,
        MakePercentageInside6Feet = src.MakePercentageInside6Feet,
        DriverDistanceBoostYards = src.DriverDistanceBoostYards,
        OverallAccuracyMultiplier = src.OverallAccuracyMultiplier,
        AutoCalibrateFromHistoricalData = src.AutoCalibrateFromHistoricalData,
        AutoCalibrationBlend = src.AutoCalibrationBlend,
        ExtraStrokesPerHole = src.ExtraStrokesPerHole
    };
