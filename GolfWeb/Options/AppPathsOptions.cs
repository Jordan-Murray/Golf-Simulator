namespace GolfWeb.Options;

public sealed class AppPathsOptions
{
    public string VisualizationRoot { get; set; } = string.Empty;
    public string VisualizationDataPath { get; set; } = string.Empty;
    public string CourseGeometryPath { get; set; } = string.Empty;
    public string CsvPath { get; set; } = string.Empty;
    public string SmartDistancesPath { get; set; } = string.Empty;
    public string DashboardPath { get; set; } = string.Empty;
    public string SimulationSettingsPath { get; set; } = string.Empty;
}
