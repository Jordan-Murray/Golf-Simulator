// Models/Round.cs
using System.Text.Json.Serialization;

namespace ArccosScraper.Models;

public class Round
{
    [JsonPropertyName("roundId")]
    public long RoundId { get; set; }

    [JsonPropertyName("roundUUID")]
    public string RoundUUID { get; set; } = string.Empty;

    [JsonPropertyName("courseName")]
    public string CourseName { get; set; } = string.Empty;

    [JsonPropertyName("startTime")]
    public DateTime StartTime { get; set; }

    [JsonPropertyName("endTime")]
    public DateTime EndTime { get; set; }

    [JsonPropertyName("teeId")]
    public int TeeId { get; set; }

    [JsonPropertyName("noOfHoles")]
    public int NumberOfHoles { get; set; }

    [JsonPropertyName("noOfShots")]
    public int NumberOfShots { get; set; }

    [JsonPropertyName("par")]
    public int Par { get; set; }

    [JsonPropertyName("overUnder")]
    public int OverUnder { get; set; }

    [JsonPropertyName("driveHcp")]
    public double? DriveHcp { get; set; }

    [JsonPropertyName("approachHcp")]
    public double? ApproachHcp { get; set; }

    [JsonPropertyName("chipHcp")]
    public double? ChipHcp { get; set; }

    [JsonPropertyName("sandHcp")]
    public double? SandHcp { get; set; }

    [JsonPropertyName("puttHcp")]
    public double? PuttHcp { get; set; }
}

public class RoundsApiResponse
{
    [JsonPropertyName("rounds")]
    public List<Round> Rounds { get; set; } = [];

    [JsonPropertyName("totalCount")]
    public int TotalCount { get; set; }
}