using ArccosScraper.Models;
using System.Text;

namespace ArccosScraper.Services;

public static class CsvWriterService
{
    public static void WriteShotsToCsv(List<ComprehensiveShotRecord> shots, string filePath)
    {
        var sb = new StringBuilder();

        // A much more comprehensive header row!
        var headers = new[]
        {
            "RoundId", "RoundUUID", "CourseName", "CourseId", "RoundStartTime", "RoundPar", "RoundOverUnder",
            "DriveHcp", "ApproachHcp", "ChipHcp", "SandHcp", "PuttHcp",
            "HoleNumber", "HolePutts", "HoleIsGir", "HoleIsFairway", "PinLat", "PinLong",
            "ShotNumberInHole", "ShotUUID", "ClubId", "ShotTime", "Distance", "IsHalfSwing", "Penalties",
            "StartLat", "StartLong", "EndLat", "EndLong", "StartAltitude", "EndAltitude"
        };
        sb.AppendLine(string.Join(",", headers));

        foreach (var shot in shots)
        {
            var values = new object?[]
            {
                shot.RoundId, shot.RoundUUID, shot.CourseName, shot.CourseId, shot.RoundStartTime.ToString("o"), shot.RoundPar, shot.RoundOverUnder,
                shot.DriveHcp, shot.ApproachHcp, shot.ChipHcp, shot.SandHcp, shot.PuttHcp,
                shot.HoleNumber, shot.HolePutts, shot.HoleIsGir, shot.HoleIsFairway, shot.PinLat, shot.PinLong,
                shot.ShotNumberInHole, shot.ShotUUID, shot.ClubId, shot.ShotTime.ToString("o"), shot.Distance, shot.IsHalfSwing, shot.Penalties,
                shot.StartLat, shot.StartLong, shot.EndLat, shot.EndLong, shot.StartAltitude, shot.EndAltitude
            };
            var line = string.Join(",", values.Select(v => $"\"{v?.ToString() ?? ""}\""));
            sb.AppendLine(line);
        }

        File.WriteAllText(filePath, sb.ToString());
    }
}