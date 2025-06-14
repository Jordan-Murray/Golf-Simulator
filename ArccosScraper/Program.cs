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
    // This logic is now moved into its own function
    var rounds = await dataService.GetAllRoundsAsync();
    var allShots = new List<ComprehensiveShotRecord>();
    foreach (var round in rounds)
    {
        var roundDetail = await dataService.GetRoundDetailAsync(round.RoundId);
        if (roundDetail != null)
        {
            foreach (var hole in roundDetail.Holes)
            {
                foreach (var shot in hole.Shots)
                {
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
        }
        await Task.Delay(250);
    }
    CsvWriterService.WriteShotsToCsv(allShots, "arccos_shot_data_comprehensive.csv");
    Console.WriteLine($"Shot data saved to arccos_shot_data_comprehensive.csv");
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
    var options = new JsonSerializerOptions { WriteIndented = true };
    var jsonOutput = JsonSerializer.Serialize(analysis, options);
    File.WriteAllText("dashboard_analysis.json", jsonOutput);
    Console.WriteLine($"Dashboard analysis saved to dashboard_analysis.json");
}

// --- The Menu Loop ---
while (true)
{
    Console.WriteLine("\n--- Arccos Data Scraper Menu ---");
    Console.WriteLine("1. Fetch All Data (Shots, Distances, Analysis)");
    Console.WriteLine("2. Fetch Shot Data Only");
    Console.WriteLine("3. Fetch Smart Distances Only");
    Console.WriteLine("4. Fetch Dashboard Analysis Only");
    Console.WriteLine("5. Exit");
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
            return;
        default:
            Console.WriteLine("Invalid choice. Please try again.");
            break;
    }
}
