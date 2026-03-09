using ArccosScraper.Models;
using ArccosScraper.Services;
using ArccosScraper.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Net.Http.Headers;
using System.Text.Json;

const string OutputFilePath = "arccos_shot_data_comprehensive.csv";

var builder = Host.CreateApplicationBuilder(args);
var appSettings = AppSettings.Load();

builder.Services.AddSingleton<IArccosDataService>(sp =>
    new ArccosDataService(sp.GetRequiredService<IHttpClientFactory>(), appSettings.UserId));

builder.Services.AddHttpClient("ArccosApiClient", client =>
{
    client.BaseAddress = new Uri("https://api.arccosgolf.com");
    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", appSettings.BearerToken);
    client.DefaultRequestHeaders.Add("accept", "application/json");
    client.DefaultRequestHeaders.Add("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36");
});

var host = builder.Build();
var dataService = host.Services.GetRequiredService<IArccosDataService>();

async Task FetchShotData()
{
    Console.WriteLine("\nFetching comprehensive shot data...");
    var rounds = await dataService.GetAllRoundsAsync();
    var allShots = new List<ComprehensiveShotRecord>();
    var skippedNullRounds = 0;
    var skippedNullHoles = 0;
    var skippedNullShots = 0;

    foreach (var round in rounds)
    {
        if (round == null)
        {
            skippedNullRounds++;
            continue;
        }

        var roundDetail = await dataService.GetRoundDetailAsync(round.RoundId);
        if (roundDetail == null)
        {
            continue;
        }

        foreach (var hole in roundDetail.Holes ?? [])
        {
            if (hole == null)
            {
                skippedNullHoles++;
                continue;
            }

            foreach (var shot in hole.Shots ?? [])
            {
                if (shot == null)
                {
                    skippedNullShots++;
                    continue;
                }

                allShots.Add(new ComprehensiveShotRecord
                {
                    RoundId = round.RoundId,
                    RoundUUID = round.RoundUUID,
                    CourseName = round.CourseName,
                    RoundStartTime = round.StartTime,
                    RoundPar = round.Par,
                    RoundOverUnder = round.OverUnder,
                    DriveHcp = round.DriveHcp,
                    ApproachHcp = round.ApproachHcp,
                    ChipHcp = round.ChipHcp,
                    SandHcp = round.SandHcp,
                    PuttHcp = round.PuttHcp,

                    CourseId = roundDetail.CourseId,

                    HoleNumber = hole.HoleId,
                    HolePutts = hole.Putts,
                    HoleIsGir = hole.IsGir == "T",
                    HoleIsFairway = hole.IsFairWay == "T",
                    PinLat = hole.PinLat,
                    PinLong = hole.PinLong,

                    ShotNumberInHole = shot.ShotId,
                    ShotUUID = shot.ShotUUID,
                    ClubId = shot.ClubId,
                    ShotTime = shot.ShotTime,
                    Distance = shot.Distance,
                    IsHalfSwing = shot.IsHalfSwing == "T",
                    Penalties = shot.NumberOfPenalties,
                    StartLat = shot.StartLat,
                    StartLong = shot.StartLong,
                    EndLat = shot.EndLat,
                    EndLong = shot.EndLong,
                    StartAltitude = shot.StartAltitude,
                    EndAltitude = shot.EndAltitude
                });
            }
        }

        await Task.Delay(250);
    }

    CsvWriterService.WriteShotsToCsv(allShots, "arccos_shot_data_comprehensive.csv");
    Console.WriteLine($"Shot data saved to arccos_shot_data_comprehensive.csv");
    if (skippedNullRounds > 0 || skippedNullHoles > 0 || skippedNullShots > 0)
    {
        Console.WriteLine($"Skipped null entities: rounds={skippedNullRounds}, holes={skippedNullHoles}, shots={skippedNullShots}");
    }
}


async Task FetchSmartDistances()
{
    Console.WriteLine("\nFetching smart distances data...");
    var smartDistances = await dataService.GetSmartDistancesAsync();
    var options = new JsonSerializerOptions { WriteIndented = true };
    var jsonOutput = JsonSerializer.Serialize(smartDistances, options);
    File.WriteAllText("smart_distances.json", jsonOutput);
    Console.WriteLine($"Smart distances saved to smart_distances.json");
}

async Task FetchDashboardAnalysis()
{
    Console.WriteLine("\nFetching dashboard analysis data...");
    var analysis = await dataService.GetDashboardAnalysisAsync();
    if (analysis == null)
    {
        Console.WriteLine("Dashboard analysis unavailable (likely 401/403). Skipping this dataset.");
        return;
    }

    var options = new JsonSerializerOptions { WriteIndented = true };
    var jsonOutput = JsonSerializer.Serialize(analysis, options);
    File.WriteAllText("dashboard_analysis.json", jsonOutput);
    Console.WriteLine($"Dashboard analysis saved to dashboard_analysis.json");
}

void ExportVisualizationData()
{
    const string csvPath = "arccos_shot_data_comprehensive.csv";
    var repoRoot = FindRepoRootOrNull() ?? Directory.GetCurrentDirectory();
    var vizDataDir = Path.Combine(repoRoot, "Visualization", "data");
    var vizOutputPath = Path.Combine(vizDataDir, "visualization_data.json");

    if (!File.Exists(csvPath))
    {
        Console.WriteLine($"\nCSV file not found: {csvPath}");
        Console.WriteLine("Please fetch shot data first (option 2).");
        return;
    }

    Directory.CreateDirectory(vizDataDir);

    Console.WriteLine("\nExporting 3D visualization data...");
    VisualizationExporterService.Export(csvPath, vizOutputPath);
    Console.WriteLine($"Visualization data saved to {Path.GetFullPath(vizOutputPath)}");
}

void ImportCourseGeometry()
{
    const string csvPath = "arccos_shot_data_comprehensive.csv";
    if (!File.Exists(csvPath))
    {
        Console.WriteLine($"\nCSV file not found: {csvPath}");
        Console.WriteLine("Fetch shot data first (option 2).");
        return;
    }

    Console.WriteLine("\nEnter path to source geometry file (.geojson/.json/.kml):");
    var sourcePathInput = Console.ReadLine()?.Trim();
    if (string.IsNullOrWhiteSpace(sourcePathInput))
    {
        Console.WriteLine("No source file provided.");
        return;
    }

    var sourcePath = Path.GetFullPath(sourcePathInput);
    if (!File.Exists(sourcePath))
    {
        Console.WriteLine($"Source file not found: {sourcePath}");
        return;
    }

    var repoRoot = FindRepoRootOrNull() ?? Directory.GetCurrentDirectory();
    var defaultOut = Path.Combine(repoRoot, "Visualization", "data", "course_geometry.json");
    Console.WriteLine($"Output path (Enter for default): {defaultOut}");
    var outInput = Console.ReadLine()?.Trim();
    var outputPath = string.IsNullOrWhiteSpace(outInput) ? defaultOut : Path.GetFullPath(outInput);

    try
    {
        Console.WriteLine("\nImporting course geometry...");
        CourseGeometryImportService.Import(sourcePath, csvPath, outputPath);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Geometry import failed: {ex.Message}");
    }
}

void ValidateCourseGeometrySource()
{
    Console.WriteLine("\nEnter path to geometry source file to validate (.geojson/.json/.kml):");
    var sourcePathInput = Console.ReadLine()?.Trim();
    if (string.IsNullOrWhiteSpace(sourcePathInput))
    {
        Console.WriteLine("No source file provided.");
        return;
    }

    var sourcePath = Path.GetFullPath(sourcePathInput);
    if (!File.Exists(sourcePath))
    {
        Console.WriteLine($"Source file not found: {sourcePath}");
        return;
    }

    try
    {
        CourseGeometryImportService.ValidateSource(sourcePath);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Validation failed: {ex.Message}");
    }
}

string? FindRepoRootOrNull()
{
    var probe = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (probe != null)
    {
        var arccosDir = Path.Combine(probe.FullName, "ArccosScraper");
        var visualizationDir = Path.Combine(probe.FullName, "Visualization");
        if (Directory.Exists(arccosDir) && Directory.Exists(visualizationDir))
            return probe.FullName;

        probe = probe.Parent;
    }

    return null;
}

// --- The Menu Loop ---
while (true)
{
    Console.WriteLine("\n--- Arccos Data Scraper Menu ---");
    Console.WriteLine("1. Fetch All Data (Shots, Distances, Analysis)");
    Console.WriteLine("2. Fetch Shot Data Only");
    Console.WriteLine("3. Fetch Smart Distances Only");
    Console.WriteLine("4. Fetch Dashboard Analysis Only");
    Console.WriteLine("5. Export 3D Visualization Data");
    Console.WriteLine("6. Import Course Geometry (GeoJSON/KML)");
    Console.WriteLine("7. Validate Geometry Source (GeoJSON/KML)");
    Console.WriteLine("8. Exit");
    Console.Write("Enter your choice: ");

    var choice = Console.ReadLine();
    switch (choice)
    {
        case "1":
            await FetchShotData();
            await FetchSmartDistances();
            await FetchDashboardAnalysis();
            break;
        case "2":
            await FetchShotData();
            break;
        case "3":
            await FetchSmartDistances();
            break;
        case "4":
            await FetchDashboardAnalysis();
            break;
        case "5":
            ExportVisualizationData();
            break;
        case "6":
            ImportCourseGeometry();
            break;
        case "7":
            ValidateCourseGeometrySource();
            break;
        case "8":
            return;
        default:
            Console.WriteLine("Invalid choice. Please try again.");
            break;
    }
}
