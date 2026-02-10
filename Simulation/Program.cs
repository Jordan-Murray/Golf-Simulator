using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Simulation.Models;
using Simulation.Services;

const string CourseToSimulate = "Pottergate GC";
const string SettingsFilePath = "simulation_settings.json";

const string InputCsvPath = @"..\..\..\..\ArccosScraper\bin\Debug\net9.0\arccos_shot_data_comprehensive.csv";
const string SmartDistJsonInputPath = @"..\..\..\..\ArccosScraper\bin\Debug\net9.0\smart_distances.json";
const string DashboardJsonInputPath = @"..\..\..\..\ArccosScraper\bin\Debug\net9.0\dashboard_analysis.json";

// Load simulation settings (what-if tweaks)
var settings = File.Exists(SettingsFilePath)
    ? JsonSerializer.Deserialize<SimulationSettings>(File.ReadAllText(SettingsFilePath)) ?? new SimulationSettings()
    : new SimulationSettings();

Console.WriteLine("Loading Arccos data sources...");
var allShots = CsvDataReaderService.ReadShots(InputCsvPath);
var dnaService = new DnaAnalysisService();
var baseGolferDna = dnaService.BuildDna(allShots, SmartDistJsonInputPath, DashboardJsonInputPath);
var courseLayout = new CourseFactory().BuildCourse(allShots, CourseToSimulate);

var builder = Host.CreateApplicationBuilder(args);

// 1. core data
builder.Services.AddSingleton(baseGolferDna);
builder.Services.AddSingleton(settings);

// 2. helper strategies
builder.Services.AddSingleton<IClubSelector, DefaultClubSelector>();
builder.Services.AddSingleton<ILieManager, DefaultLieManager>();
builder.Services.AddSingleton<IPuttingModel, DefaultPuttingModel>();
builder.Services.AddSingleton<IPenaltyManager, DefaultPenaltyManager>();

// 3. orchestrator
builder.Services.AddSingleton<SimulationService>();

var host = builder.Build();
var simService = host.Services.GetRequiredService<SimulationService>();

var menu = new SimulationMenu(simService, courseLayout);
menu.Start();
