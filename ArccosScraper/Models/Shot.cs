using System.Text.Json.Serialization;

namespace ArccosScraper.Models;

public class Shot
{
    [JsonPropertyName("shotId")]
    public int ShotId { get; set; }

    [JsonPropertyName("shotUUID")]
    public string ShotUUID { get; set; } = string.Empty;

    [JsonPropertyName("clubType")]
    public int ClubType { get; set; }

    [JsonPropertyName("clubId")]
    public int ClubId { get; set; }

    [JsonPropertyName("distance")]
    public double Distance { get; set; }

    [JsonPropertyName("isHalfSwing")]
    public string IsHalfSwing { get; set; } = string.Empty; // "T" or "F"

    [JsonPropertyName("startLat")]
    public double? StartLat { get; set; }

    [JsonPropertyName("startLong")]
    public double? StartLong { get; set; }

    [JsonPropertyName("endLat")]
    public double? EndLat { get; set; }

    [JsonPropertyName("endLong")]
    public double? EndLong { get; set; }

    [JsonPropertyName("startAltitude")]
    public double? StartAltitude { get; set; }

    [JsonPropertyName("endAltitude")]
    public double? EndAltitude { get; set; }

    [JsonPropertyName("shotTime")]
    public DateTime ShotTime { get; set; }

    [JsonPropertyName("noOfPenalties")]
    public int NumberOfPenalties { get; set; }
}