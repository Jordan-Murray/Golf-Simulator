using System.Text.Json;
using GolfWeb.Options;
using GolfWeb.Services;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);
var jsonFileOptions = new JsonSerializerOptions
{
    PropertyNameCaseInsensitive = true
};
var repoRoot = FindRepoRootOrNull() ?? Directory.GetCurrentDirectory();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});
builder.Services.AddOptions<AppPathsOptions>()
    .Bind(builder.Configuration.GetSection("AppPaths"))
    .PostConfigure(o => ApplyPathDefaults(o, repoRoot));

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
if (allowedOrigins.Length > 0)
{
    builder.Services.AddCors(o =>
    {
        o.AddPolicy("frontend", p => p.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod());
    });
}

builder.Services.AddSingleton<SimulationApiService>();

var app = builder.Build();
var appPaths = app.Services.GetRequiredService<IOptions<AppPathsOptions>>().Value;

if (allowedOrigins.Length > 0)
{
    app.UseCors("frontend");
}

if (Directory.Exists(appPaths.VisualizationRoot))
{
    var staticProvider = new PhysicalFileProvider(appPaths.VisualizationRoot);
    app.UseDefaultFiles(new DefaultFilesOptions
    {
        FileProvider = staticProvider,
        RequestPath = "/viz"
    });
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = staticProvider,
        RequestPath = "/viz"
    });
}

app.MapGet("/", () => Results.Redirect("/viz/"));

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "ok",
    appPaths.VisualizationRoot,
    visualizationDataExists = File.Exists(appPaths.VisualizationDataPath),
    courseGeometryExists = File.Exists(appPaths.CourseGeometryPath),
    corsAllowedOrigins = allowedOrigins
}));

app.MapGet("/api/data/latest", (int? count) =>
{
    if (!File.Exists(appPaths.VisualizationDataPath))
    {
        return Results.NotFound(new
        {
            message = "visualization_data.json not found. Run ArccosScraper export first.",
            path = appPaths.VisualizationDataPath
        });
    }

    var payload = JsonSerializer.Deserialize<VisualizationPayload>(File.ReadAllText(appPaths.VisualizationDataPath), jsonFileOptions);
    if (payload?.Rounds is null)
    {
        return Results.Problem("Unable to parse visualization_data.json");
    }

    var take = Math.Clamp(count ?? 20, 1, 500);
    var rounds = payload.Rounds
        .OrderByDescending(r => r.Date)
        .Take(take)
        .ToList();

    return Results.Ok(new
    {
        courseCount = rounds.Select(r => r.CourseName).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
        roundCount = rounds.Count,
        rounds
    });
});

app.MapGet("/api/data/visualization", () =>
{
    if (!File.Exists(appPaths.VisualizationDataPath))
    {
        return Results.NotFound(new
        {
            message = "visualization_data.json not found. Run ArccosScraper export first.",
            path = appPaths.VisualizationDataPath
        });
    }

    return Results.File(appPaths.VisualizationDataPath, "application/json");
});

app.MapGet("/api/data/geometry", () =>
{
    if (!File.Exists(appPaths.CourseGeometryPath))
    {
        return Results.NotFound(new
        {
            message = "course_geometry.json not found. Import geometry in ArccosScraper first.",
            path = appPaths.CourseGeometryPath
        });
    }

    return Results.File(appPaths.CourseGeometryPath, "application/json");
});

app.MapPost("/api/simulate", (SimulateRequest request, SimulationApiService simulationApi) =>
{
    try
    {
        var result = simulationApi.RunSimulation(request);
        return Results.Ok(result);
    }
    catch (FileNotFoundException ex)
    {
        return Results.NotFound(new
        {
            message = ex.Message,
            path = ex.FileName
        });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

app.Run();

static string? FindRepoRootOrNull()
{
    var probe = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (probe is not null)
    {
        var visualizationDir = Path.Combine(probe.FullName, "Visualization");
        var simulationDir = Path.Combine(probe.FullName, "Simulation");
        if (Directory.Exists(visualizationDir) && Directory.Exists(simulationDir))
        {
            return probe.FullName;
        }

        probe = probe.Parent;
    }

    return null;
}

static void ApplyPathDefaults(AppPathsOptions o, string repoRoot)
{
    var visualizationRoot = string.IsNullOrWhiteSpace(o.VisualizationRoot)
        ? Path.Combine(repoRoot, "Visualization")
        : o.VisualizationRoot;

    o.VisualizationRoot = visualizationRoot;
    o.VisualizationDataPath = DefaultIfEmpty(o.VisualizationDataPath, Path.Combine(visualizationRoot, "data", "visualization_data.json"));
    o.CourseGeometryPath = DefaultIfEmpty(o.CourseGeometryPath, Path.Combine(visualizationRoot, "data", "course_geometry.json"));

    var scraperOut = Path.Combine(repoRoot, "ArccosScraper", "bin", "Debug", "net9.0");
    o.CsvPath = DefaultIfEmpty(o.CsvPath, Path.Combine(scraperOut, "arccos_shot_data_comprehensive.csv"));
    o.SmartDistancesPath = DefaultIfEmpty(o.SmartDistancesPath, Path.Combine(scraperOut, "smart_distances.json"));
    o.DashboardPath = DefaultIfEmpty(o.DashboardPath, Path.Combine(scraperOut, "dashboard_analysis.json"));
    o.SimulationSettingsPath = DefaultIfEmpty(o.SimulationSettingsPath, Path.Combine(repoRoot, "Simulation", "simulation_settings.json"));
}

static string DefaultIfEmpty(string value, string fallback)
{
    return string.IsNullOrWhiteSpace(value) ? fallback : value;
}

public sealed class VisualizationPayload
{
    public List<VisualizationRound> Rounds { get; set; } = [];
}

public sealed class VisualizationRound
{
    public string CourseName { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty;
    public int TotalScore { get; set; }
}
