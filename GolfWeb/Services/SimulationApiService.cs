using System.Text.Json;
using GolfWeb.Options;
using Microsoft.Extensions.Options;
using Simulation.Models;
using Simulation.Services;

namespace GolfWeb.Services;

public sealed class SimulationApiService
{
    private readonly object _gate = new();
    private readonly AppPathsOptions _paths;
    private SimulationDataSnapshot? _snapshot;

    public SimulationApiService(IOptions<AppPathsOptions> paths)
    {
        _paths = paths.Value;
    }

    public SimulationResult RunSimulation(SimulateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.CourseName))
        {
            throw new InvalidOperationException("courseName is required.");
        }

        var snapshot = GetOrLoadSnapshot(request.CourseName);
        var requestedHoles = Math.Clamp(request.Holes, 1, Math.Max(1, snapshot.FullCourse.Holes.Count));
        var roundsToPlay = Math.Clamp(request.Rounds, 1, 200);

        var course = new CourseLayout
        {
            CourseName = snapshot.FullCourse.CourseName,
            Holes = snapshot.FullCourse.Holes
                .OrderBy(h => h.HoleNumber)
                .Take(requestedHoles)
                .ToList()
        };

        var rounds = new List<SimulatedRound>(roundsToPlay);
        for (var i = 0; i < roundsToPlay; i++)
        {
            rounds.Add(snapshot.Service.Run(course, verbose: request.Verbose));
        }

        return new SimulationResult(
            snapshot.FullCourse.CourseName,
            requestedHoles,
            roundsToPlay,
            rounds,
            snapshot.Settings,
            snapshot.CalibrationReport,
            snapshot.SourcePaths);
    }

    private SimulationDataSnapshot GetOrLoadSnapshot(string courseName)
    {
        lock (_gate)
        {
            var sourcePaths = BuildSourcePaths(_paths);
            var fileStamp = GetStamp(sourcePaths);
            var current = _snapshot;
            if (current is not null &&
                current.FileStamp == fileStamp &&
                string.Equals(current.FullCourse.CourseName, courseName, StringComparison.OrdinalIgnoreCase))
            {
                return current;
            }

            var shots = CsvDataReaderService.ReadShots(sourcePaths.CsvPath);
            var dna = new DnaAnalysisService().BuildDna(shots, sourcePaths.SmartDistancesPath, sourcePaths.DashboardPath);
            var settings = LoadSettings(sourcePaths.SettingsPath);
            var fullCourse = new CourseFactory().BuildCourse(shots, courseName);
            if (fullCourse.Holes.Count == 0)
            {
                throw new InvalidOperationException($"No holes found for course '{courseName}' in shot data.");
            }

            var calibration = new CourseCalibrationService();
            var calibrationReport = calibration.Apply(shots, courseName, dna, settings);

            var service = new SimulationService(
                dna,
                new DefaultClubSelector(settings),
                new DefaultLieManager(),
                new DefaultPuttingModel(dna, settings),
                new DefaultPenaltyManager(settings),
                settings);

            _snapshot = new SimulationDataSnapshot(
                fileStamp,
                fullCourse,
                service,
                settings,
                calibrationReport,
                sourcePaths);

            return _snapshot;
        }
    }

    private static SourcePaths BuildSourcePaths(AppPathsOptions paths)
    {
        var sourcePaths = new SourcePaths(
            CsvPath: paths.CsvPath,
            SmartDistancesPath: paths.SmartDistancesPath,
            DashboardPath: paths.DashboardPath,
            SettingsPath: paths.SimulationSettingsPath);

        if (!File.Exists(sourcePaths.CsvPath))
        {
            throw new FileNotFoundException("Missing shot CSV. Run Arccos scraper/export first.", sourcePaths.CsvPath);
        }
        if (!File.Exists(sourcePaths.SmartDistancesPath))
        {
            throw new FileNotFoundException("Missing smart distances JSON. Run Arccos scraper first.", sourcePaths.SmartDistancesPath);
        }
        if (!File.Exists(sourcePaths.DashboardPath))
        {
            throw new FileNotFoundException("Missing dashboard analysis JSON. Run Arccos scraper first.", sourcePaths.DashboardPath);
        }

        return sourcePaths;
    }

    private static long GetStamp(SourcePaths paths)
    {
        return File.GetLastWriteTimeUtc(paths.CsvPath).Ticks
               ^ File.GetLastWriteTimeUtc(paths.SmartDistancesPath).Ticks
               ^ File.GetLastWriteTimeUtc(paths.DashboardPath).Ticks
               ^ (File.Exists(paths.SettingsPath) ? File.GetLastWriteTimeUtc(paths.SettingsPath).Ticks : 0);
    }

    private static SimulationSettings LoadSettings(string path)
    {
        if (!File.Exists(path))
        {
            return new SimulationSettings();
        }

        return JsonSerializer.Deserialize<SimulationSettings>(File.ReadAllText(path)) ?? new SimulationSettings();
    }
}

public sealed record SimulateRequest(string CourseName, int Holes = 9, int Rounds = 1, bool Verbose = false);

public sealed record SimulationResult(
    string CourseName,
    int HolesPlayed,
    int RoundsRequested,
    List<SimulatedRound> Rounds,
    SimulationSettings SettingsUsed,
    CourseCalibrationReport Calibration,
    SourcePaths SourcePaths);

public sealed record SourcePaths(
    string CsvPath,
    string SmartDistancesPath,
    string DashboardPath,
    string SettingsPath);

internal sealed record SimulationDataSnapshot(
    long FileStamp,
    CourseLayout FullCourse,
    SimulationService Service,
    SimulationSettings Settings,
    CourseCalibrationReport CalibrationReport,
    SourcePaths SourcePaths);
