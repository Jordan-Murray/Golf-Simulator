using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Simulation.Models;
using Simulation.Services;

const string CourseToSimulate = "Pottergate GC";
const string SettingsFilePath = "simulation_settings.json";

const string InputCsvPath = @"..\..\..\..\ArccosScraper\bin\Debug\net9.0\arccos_shot_data_comprehensive.csv";
const string SmartDistJsonInputPath = @"..\..\..\..\ArccosScraper\bin\Debug\net9.0\smart_distances.json";
const string DashboardJsonInputPath = @"..\..\..\..\ArccosScraper\bin\Debug\net9.0\dashboard_analysis.json";
const string OutputJsonPath = "simulated_round.json";

Console.WriteLine("Loading Arccos data sources...");
var allShots = CsvDataReaderService.ReadShots(InputCsvPath);
var dnaService = new DnaAnalysisService();
var baseGolferDna = dnaService.BuildDna(allShots, SmartDistJsonInputPath, DashboardJsonInputPath);
var courseLayout = new CourseFactory().BuildCourse(allShots, CourseToSimulate);
//Console.WriteLine("Base DNA profile and course layout created.");

//Console.WriteLine("\n--- Simulation Mode ---");
//Console.WriteLine("Would you like to apply custom settings or use your default Arccos DNA?");
//Console.WriteLine("  [1] Default Arccos DNA (your real stats)");
//Console.WriteLine("  [2] Use custom settings from simulation_settings.json");
var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddSingleton<GolferDna>(baseGolferDna);
//builder.Services.AddSingleton<SimulationSettings>(settings ?? new SimulationSettings());

// 2. helper strategies
builder.Services.AddSingleton<IClubSelector, DefaultClubSelector>();
builder.Services.AddSingleton<ILieManager, DefaultLieManager>();
builder.Services.AddSingleton<IPuttingModel, DefaultPuttingModel>();
builder.Services.AddSingleton<IPenaltyManager>(sp =>
    new DefaultPenaltyManager(10)); //to do  work out penalty logic

// 3. orchestrator
builder.Services.AddSingleton<SimulationService>();

var host = builder.Build();
var simService = host.Services.GetRequiredService<SimulationService>();

// -----------------------------------------------------------------------
var menu = new SimulationMenu(simService, courseLayout);
menu.Start();

// --- SAVE OUTPUT ---
//var outputOptions = new JsonSerializerOptions { WriteIndented = true };
//var jsonOutput = JsonSerializer.Serialize(simulatedRound, outputOptions);
//File.WriteAllText(OutputJsonPath, jsonOutput);
//Console.WriteLine($"\nDetailed simulation data saved to {Path.GetFullPath(OutputJsonPath)}");