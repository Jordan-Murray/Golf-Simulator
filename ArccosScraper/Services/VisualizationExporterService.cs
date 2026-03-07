using ArccosScraper.Models;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ArccosScraper.Services;

public static class VisualizationExporterService
{
    private const int PutterClubId = 13;

    private static readonly Dictionary<int, string> ClubNames = new()
    {
        { 1, "Driver" }, { 17, "3 Wood" }, { 2, "4 Hybrid" },
        { 3, "5 Iron" }, { 4, "6 Iron" }, { 5, "7 Iron" },
        { 6, "8 Iron" }, { 7, "9 Iron" }, { 8, "Pitching Wedge" },
        { 10, "Approach Wedge" }, { 9, "Gap Wedge" },
        { 11, "Sand Wedge" }, { 12, "Lob Wedge" }, { 13, "Putter" }
    };

    public static void Export(string csvInputPath, string jsonOutputPath)
    {
        Console.WriteLine("Reading shot data from CSV...");
        var shots = ReadCsv(csvInputPath);
        Console.WriteLine($"Loaded {shots.Count} shots.");

        var data = BuildVisualizationData(shots);

        var options = new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        var json = JsonSerializer.Serialize(data, options);
        File.WriteAllText(jsonOutputPath, json);
        Console.WriteLine($"Exported {data.Rounds.Count} round(s) across {data.Rounds.Select(r => r.CourseName).Distinct().Count()} course(s).");
    }

    private static VisualizationData BuildVisualizationData(List<ComprehensiveShotRecord> shots)
    {
        var data = new VisualizationData();

        var roundGroups = shots
            .GroupBy(s => s.RoundId)
            .OrderBy(g => g.First().RoundStartTime);

        foreach (var roundGroup in roundGroups)
        {
            var firstShot = roundGroup.First();
            var round = new VisualizationRound
            {
                RoundId = firstShot.RoundId,
                CourseName = firstShot.CourseName,
                Date = firstShot.RoundStartTime.ToString("yyyy-MM-dd")
            };

            var holeGroups = roundGroup
                .GroupBy(s => s.HoleNumber)
                .OrderBy(h => h.Key);

            foreach (var holeGroup in holeGroups)
            {
                var holeShots = holeGroup.OrderBy(s => s.ShotNumberInHole).ToList();
                var hole = BuildHole(holeShots);
                if (hole != null)
                    round.Holes.Add(hole);
            }

            round.TotalScore = round.Holes.Sum(h => h.Score);
            data.Rounds.Add(round);
        }

        return data;
    }

    private static VisualizationHole? BuildHole(List<ComprehensiveShotRecord> shots)
    {
        var firstShot = shots[0];

        if (!firstShot.StartLat.HasValue || !firstShot.StartLong.HasValue)
            return null;

        var teeLat = firstShot.StartLat.Value;
        var teeLng = firstShot.StartLong.Value;
        var teeAlt = firstShot.StartAltitude ?? 0;

        var pinLat = firstShot.PinLat ?? teeLat;
        var pinLng = firstShot.PinLong ?? teeLng;

        // Rotation angle: align tee → pin with +Z axis
        var (pinRawX, pinRawZ) = GpsToMeters(pinLat, pinLng, teeLat, teeLng);
        var angle = Math.Atan2(pinRawX, pinRawZ);
        var pinLocal = RotatePoint(pinRawX, pinRawZ, -angle);

        var lastAltitude = teeAlt;
        var vizShots = new List<VisualizationShot>();

        foreach (var shot in shots)
        {
            if (!shot.StartLat.HasValue || !shot.StartLong.HasValue)
                continue;

            var endLat = shot.EndLat ?? shot.StartLat.Value;
            var endLng = shot.EndLong ?? shot.StartLong.Value;

            var (sRawX, sRawZ) = GpsToMeters(shot.StartLat.Value, shot.StartLong.Value, teeLat, teeLng);
            var (eRawX, eRawZ) = GpsToMeters(endLat, endLng, teeLat, teeLng);

            var startLocal = RotatePoint(sRawX, sRawZ, -angle);
            var endLocal = RotatePoint(eRawX, eRawZ, -angle);

            var startY = (shot.StartAltitude ?? teeAlt) - teeAlt;
            var endY = (shot.EndAltitude ?? teeAlt) - teeAlt;

            if (shot.EndAltitude.HasValue)
                lastAltitude = shot.EndAltitude.Value;

            vizShots.Add(new VisualizationShot
            {
                ShotNumber = shot.ShotNumberInHole,
                ClubId = shot.ClubId,
                ClubName = ClubNames.GetValueOrDefault(shot.ClubId, $"Club {shot.ClubId}"),
                Distance = Math.Round(shot.Distance, 1),
                Start = new Point3D(Round2(startLocal.x), Round2(startY), Round2(startLocal.z)),
                End = new Point3D(Round2(endLocal.x), Round2(endY), Round2(endLocal.z))
            });
        }

        if (vizShots.Count == 0)
            return null;

        // Infer par from GIR when available, otherwise use yardage heuristic
        var nonPuttDistance = shots.Where(s => s.ClubId != PutterClubId).Sum(s => s.Distance);
        int par;
        if (firstShot.HoleIsGir)
        {
            var nonPuttShots = shots.Count(s => s.ClubId != PutterClubId);
            par = nonPuttShots + 2;
        }
        else
        {
            par = nonPuttDistance switch
            {
                > 470 => 5,
                > 250 => 4,
                _ => 3
            };
        }

        var pinAlt = lastAltitude - teeAlt;

        return new VisualizationHole
        {
            HoleNumber = firstShot.HoleNumber,
            Par = par,
            Score = shots.Count + shots.Sum(s => s.Penalties),
            Pin = new Point3D(Round2(pinLocal.x), Round2(pinAlt), Round2(pinLocal.z)),
            Shots = vizShots
        };
    }

    private static (double x, double z) GpsToMeters(double lat, double lng, double originLat, double originLng)
    {
        const double metersPerDegree = 111_320.0;
        var x = (lng - originLng) * metersPerDegree * Math.Cos(originLat * Math.PI / 180.0);
        var z = (lat - originLat) * metersPerDegree;
        return (x, z);
    }

    private static (double x, double z) RotatePoint(double x, double z, double angle)
    {
        var cos = Math.Cos(angle);
        var sin = Math.Sin(angle);
        return (x * cos - z * sin, x * sin + z * cos);
    }

    private static double Round2(double value) => Math.Round(value, 2);

    private static List<ComprehensiveShotRecord> ReadCsv(string path)
    {
        var records = new List<ComprehensiveShotRecord>();

        foreach (var line in File.ReadAllLines(path).Skip(1))
        {
            var v = line.Split(',').Select(s => s.Trim('"')).ToArray();
            if (v.Length < 31) continue;

            try
            {
                records.Add(new ComprehensiveShotRecord
                {
                    RoundId = long.Parse(v[0]),
                    RoundUUID = v[1],
                    CourseName = v[2],
                    CourseId = long.Parse(v[3]),
                    RoundStartTime = DateTime.Parse(v[4], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
                    RoundPar = int.Parse(v[5]),
                    RoundOverUnder = int.Parse(v[6]),
                    DriveHcp = ParseDouble(v[7]),
                    ApproachHcp = ParseDouble(v[8]),
                    ChipHcp = ParseDouble(v[9]),
                    SandHcp = ParseDouble(v[10]),
                    PuttHcp = ParseDouble(v[11]),
                    HoleNumber = int.Parse(v[12]),
                    HolePutts = int.Parse(v[13]),
                    HoleIsGir = bool.Parse(v[14]),
                    HoleIsFairway = bool.Parse(v[15]),
                    PinLat = ParseDouble(v[16]),
                    PinLong = ParseDouble(v[17]),
                    ShotNumberInHole = int.Parse(v[18]),
                    ShotUUID = v[19],
                    ClubId = int.Parse(v[20]),
                    ShotTime = DateTime.Parse(v[21], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
                    Distance = double.Parse(v[22], CultureInfo.InvariantCulture),
                    IsHalfSwing = bool.Parse(v[23]),
                    Penalties = int.Parse(v[24]),
                    StartLat = ParseDouble(v[25]),
                    StartLong = ParseDouble(v[26]),
                    EndLat = ParseDouble(v[27]),
                    EndLong = ParseDouble(v[28]),
                    StartAltitude = ParseDouble(v[29]),
                    EndAltitude = ParseDouble(v[30])
                });
            }
            catch
            {
                // Skip malformed lines silently
            }
        }

        return records;
    }

    private static double? ParseDouble(string value) =>
        string.IsNullOrEmpty(value) ? null : double.Parse(value, CultureInfo.InvariantCulture);
}

public sealed record VisualizationData
{
    public List<VisualizationRound> Rounds { get; init; } = [];
}

public sealed record VisualizationRound
{
    public long RoundId { get; init; }
    public string CourseName { get; init; } = string.Empty;
    public string Date { get; init; } = string.Empty;
    public int TotalScore { get; set; }
    public List<VisualizationHole> Holes { get; init; } = [];
}

public sealed record VisualizationHole
{
    public int HoleNumber { get; init; }
    public int Par { get; init; }
    public int Score { get; init; }
    public required Point3D Pin { get; init; }
    public List<VisualizationShot> Shots { get; init; } = [];
}

public sealed record VisualizationShot
{
    public int ShotNumber { get; init; }
    public int ClubId { get; init; }
    public string ClubName { get; init; } = string.Empty;
    public double Distance { get; init; }
    public required Point3D Start { get; init; }
    public required Point3D End { get; init; }
}

public sealed record Point3D(double X, double Y, double Z);
