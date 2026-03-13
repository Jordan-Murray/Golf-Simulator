using System.Text.Json;
using ArccosScraper.Services;
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
    .PostConfigure(o => AppPathDefaults.Apply(o, repoRoot));

var configuredOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
var allowedOrigins = configuredOrigins.Length > 0
    ? configuredOrigins
    : (
        builder.Environment.IsDevelopment()
            ? ["http://localhost:8080", "http://127.0.0.1:8080"]
            : []
    );
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

app.MapGet("/api/data/smart-distances", () =>
{
    if (!File.Exists(appPaths.SmartDistancesPath))
    {
        return Results.NotFound(new
        {
            message = "smart_distances.json not found. Run ArccosScraper export first.",
            path = appPaths.SmartDistancesPath
        });
    }

    return Results.File(appPaths.SmartDistancesPath, "application/json");
});

app.MapPost("/api/geometry/import", async (IFormFile? file) =>
{
    if (file is null || file.Length <= 0)
    {
        return Results.BadRequest(new { message = "No file uploaded. Use form field name 'file'." });
    }

    var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (ext is not ".geojson" and not ".json" and not ".kml")
    {
        return Results.BadRequest(new { message = "Unsupported file type. Upload .geojson, .json, or .kml." });
    }

    if (!File.Exists(appPaths.CsvPath))
    {
        return Results.NotFound(new
        {
            message = "Shot CSV not found. Export/fetch shot data first in ArccosScraper.",
            path = appPaths.CsvPath
        });
    }

    var tmpPath = Path.Combine(Path.GetTempPath(), $"golf-geometry-{Guid.NewGuid():N}{ext}");
    try
    {
        await using (var fs = File.Create(tmpPath))
        {
            await file.CopyToAsync(fs);
        }

        CourseGeometryImportService.Import(tmpPath, appPaths.CsvPath, appPaths.CourseGeometryPath);

        return Results.Ok(new
        {
            message = "Geometry import completed.",
            sourceFile = file.FileName,
            outputPath = appPaths.CourseGeometryPath
        });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = $"Geometry import failed: {ex.Message}" });
    }
    finally
    {
        if (File.Exists(tmpPath))
        {
            try { File.Delete(tmpPath); } catch { }
        }
    }
}).DisableAntiforgery();

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

public partial class Program;
