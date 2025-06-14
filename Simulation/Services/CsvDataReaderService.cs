using ArccosScraper.Models;
using System.Globalization;

namespace Simulation.Services;

public static class CsvDataReaderService
{
    public static List<ComprehensiveShotRecord> ReadShots(string filePath)
    {
        var records = new List<ComprehensiveShotRecord>();
        var lines = File.ReadAllLines(filePath).Skip(1); // Skip header row

        foreach (var line in lines)
        {
            var values = line.Split(',').Select(v => v.Trim('"')).ToArray();

            if (values.Length < 31)
            {
                Console.WriteLine($"Skipping malformed CSV line: Not enough columns. Line: {line}");
                continue;
            }

            try
            {
                var record = new ComprehensiveShotRecord
                {
                    // Round-level data
                    RoundId = long.Parse(values[0]),
                    RoundUUID = values[1],
                    CourseName = values[2],
                    CourseId = long.Parse(values[3]),
                    RoundStartTime = DateTime.Parse(values[4], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
                    RoundPar = int.Parse(values[5]),
                    RoundOverUnder = int.Parse(values[6]),
                    DriveHcp = ParseNullableDouble(values[7]),
                    ApproachHcp = ParseNullableDouble(values[8]),
                    ChipHcp = ParseNullableDouble(values[9]),
                    SandHcp = ParseNullableDouble(values[10]),
                    PuttHcp = ParseNullableDouble(values[11]),

                    // Hole-level data
                    HoleNumber = int.Parse(values[12]),
                    HolePutts = int.Parse(values[13]),
                    HoleIsGir = bool.Parse(values[14]),
                    HoleIsFairway = bool.Parse(values[15]),
                    PinLat = ParseNullableDouble(values[16]),
                    PinLong = ParseNullableDouble(values[17]),

                    // Shot-level data
                    ShotNumberInHole = int.Parse(values[18]),
                    ShotUUID = values[19],
                    ClubId = int.Parse(values[20]),
                    ShotTime = DateTime.Parse(values[21], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
                    Distance = double.Parse(values[22], CultureInfo.InvariantCulture),
                    IsHalfSwing = bool.Parse(values[23]),
                    Penalties = int.Parse(values[24]),
                    StartLat = ParseNullableDouble(values[25]),
                    StartLong = ParseNullableDouble(values[26]),
                    EndLat = ParseNullableDouble(values[27]),
                    EndLong = ParseNullableDouble(values[28]),
                    StartAltitude = ParseNullableDouble(values[29]),
                    EndAltitude = ParseNullableDouble(values[30])
                };
                records.Add(record);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Skipping line due to parsing error: {ex.Message}. Line: {line}");
            }
        }
        return records;
    }

    private static double? ParseNullableDouble(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }
        return double.Parse(value, CultureInfo.InvariantCulture);
    }
}
