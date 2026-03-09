using GolfWeb.Options;

namespace GolfWeb.Tests.Unit;

public class AppPathDefaultsTests
{
    [Fact]
    public void Apply_FillsMissingPaths_FromRepoRoot()
    {
        var options = new AppPathsOptions();
        var repoRoot = Path.Combine("C:", "repo", "GolfSimulation");

        AppPathDefaults.Apply(options, repoRoot);

        Assert.Equal(Path.Combine(repoRoot, "Visualization"), options.VisualizationRoot);
        Assert.Equal(Path.Combine(repoRoot, "Visualization", "data", "visualization_data.json"), options.VisualizationDataPath);
        Assert.Equal(Path.Combine(repoRoot, "Visualization", "data", "course_geometry.json"), options.CourseGeometryPath);
        Assert.Equal(Path.Combine(repoRoot, "ArccosScraper", "bin", "Debug", "net9.0", "arccos_shot_data_comprehensive.csv"), options.CsvPath);
        Assert.Equal(Path.Combine(repoRoot, "ArccosScraper", "bin", "Debug", "net9.0", "smart_distances.json"), options.SmartDistancesPath);
        Assert.Equal(Path.Combine(repoRoot, "ArccosScraper", "bin", "Debug", "net9.0", "dashboard_analysis.json"), options.DashboardPath);
        Assert.Equal(Path.Combine(repoRoot, "Simulation", "simulation_settings.json"), options.SimulationSettingsPath);
    }

    [Fact]
    public void Apply_PreservesProvidedPaths()
    {
        var options = new AppPathsOptions
        {
            VisualizationRoot = "V_ROOT",
            VisualizationDataPath = "V_DATA",
            CourseGeometryPath = "V_GEO",
            CsvPath = "CSV",
            SmartDistancesPath = "SMART",
            DashboardPath = "DASH",
            SimulationSettingsPath = "SETTINGS"
        };

        AppPathDefaults.Apply(options, "IGNORED");

        Assert.Equal("V_ROOT", options.VisualizationRoot);
        Assert.Equal("V_DATA", options.VisualizationDataPath);
        Assert.Equal("V_GEO", options.CourseGeometryPath);
        Assert.Equal("CSV", options.CsvPath);
        Assert.Equal("SMART", options.SmartDistancesPath);
        Assert.Equal("DASH", options.DashboardPath);
        Assert.Equal("SETTINGS", options.SimulationSettingsPath);
    }
}
