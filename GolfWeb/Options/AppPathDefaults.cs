namespace GolfWeb.Options;

public static class AppPathDefaults
{
    public static void Apply(AppPathsOptions options, string repoRoot)
    {
        var visualizationRoot = string.IsNullOrWhiteSpace(options.VisualizationRoot)
            ? Path.Combine(repoRoot, "Visualization")
            : options.VisualizationRoot;

        options.VisualizationRoot = visualizationRoot;
        options.VisualizationDataPath = DefaultIfEmpty(options.VisualizationDataPath, Path.Combine(visualizationRoot, "data", "visualization_data.json"));
        options.CourseGeometryPath = DefaultIfEmpty(options.CourseGeometryPath, Path.Combine(visualizationRoot, "data", "course_geometry.json"));

        var scraperOut = Path.Combine(repoRoot, "ArccosScraper", "bin", "Debug", "net9.0");
        options.CsvPath = DefaultIfEmpty(options.CsvPath, Path.Combine(scraperOut, "arccos_shot_data_comprehensive.csv"));
        options.SmartDistancesPath = DefaultIfEmpty(options.SmartDistancesPath, Path.Combine(scraperOut, "smart_distances.json"));
        options.DashboardPath = DefaultIfEmpty(options.DashboardPath, Path.Combine(scraperOut, "dashboard_analysis.json"));
        options.SimulationSettingsPath = DefaultIfEmpty(options.SimulationSettingsPath, Path.Combine(repoRoot, "Simulation", "simulation_settings.json"));
    }

    private static string DefaultIfEmpty(string value, string fallback)
    {
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }
}
