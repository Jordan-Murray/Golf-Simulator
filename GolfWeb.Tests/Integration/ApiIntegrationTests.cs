using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace GolfWeb.Tests.Integration;

public class ApiIntegrationTests : IClassFixture<TestApiFactory>
{
    private readonly TestApiFactory _factory;

    public ApiIntegrationTests(TestApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Health_ReturnsOk()
    {
        using var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task LatestData_ReturnsConfiguredRounds()
    {
        using var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/data/latest?count=2");

        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<LatestResponse>();
        Assert.NotNull(payload);
        Assert.Equal(2, payload!.RoundCount);
        Assert.Equal(2, payload.Rounds.Count);
    }

    [Fact]
    public async Task Simulate_ReturnsNotFound_WhenCsvMissing()
    {
        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/simulate", new
        {
            courseName = "Pottergate GC",
            holes = 9,
            rounds = 1,
            verbose = false
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}

public sealed class TestApiFactory : WebApplicationFactory<Program>
{
    private readonly string _tmpRoot;
    private readonly Dictionary<string, string?> _cfg;

    public TestApiFactory()
    {
        _tmpRoot = Path.Combine(Path.GetTempPath(), "golfweb-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tmpRoot);

        var vizPath = Path.Combine(_tmpRoot, "visualization_data.json");
        var geoPath = Path.Combine(_tmpRoot, "course_geometry.json");
        File.WriteAllText(vizPath, """
            {
              "rounds": [
                { "courseName": "Pottergate GC", "date": "2026-03-09", "totalScore": 50, "holes": [] },
                { "courseName": "Pottergate GC", "date": "2026-03-08", "totalScore": 52, "holes": [] },
                { "courseName": "Pottergate GC", "date": "2026-03-07", "totalScore": 49, "holes": [] }
              ]
            }
            """);
        File.WriteAllText(geoPath, """{ "courses": [] }""");

        _cfg = new Dictionary<string, string?>
        {
            ["AppPaths:VisualizationRoot"] = _tmpRoot,
            ["AppPaths:VisualizationDataPath"] = vizPath,
            ["AppPaths:CourseGeometryPath"] = geoPath,
            ["AppPaths:CsvPath"] = Path.Combine(_tmpRoot, "missing.csv"),
            ["AppPaths:SmartDistancesPath"] = Path.Combine(_tmpRoot, "missing-smart.json"),
            ["AppPaths:DashboardPath"] = Path.Combine(_tmpRoot, "missing-dash.json"),
            ["AppPaths:SimulationSettingsPath"] = Path.Combine(_tmpRoot, "simulation_settings.json")
        };
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, configBuilder) =>
        {
            configBuilder.AddInMemoryCollection(_cfg);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && Directory.Exists(_tmpRoot))
        {
            try
            {
                Directory.Delete(_tmpRoot, recursive: true);
            }
            catch
            {
                // Ignore cleanup failures in test teardown.
            }
        }
    }
}

public sealed class LatestResponse
{
    public int RoundCount { get; set; }
    public List<LatestRound> Rounds { get; set; } = [];
}

public sealed class LatestRound
{
    public string CourseName { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty;
    public int TotalScore { get; set; }
}
