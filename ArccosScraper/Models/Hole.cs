using System.Text.Json.Serialization;

namespace ArccosScraper.Models;

public class Hole
{
    [JsonPropertyName("holeId")]
    public int HoleId { get; set; }

    [JsonPropertyName("noOfShots")]
    public int NumberOfShots { get; set; }

    [JsonPropertyName("isGir")]
    public string IsGir { get; set; } = string.Empty; // "T" or "F"

    [JsonPropertyName("putts")]
    public int Putts { get; set; }

    [JsonPropertyName("isFairWay")]
    public string IsFairWay { get; set; } = string.Empty;

    [JsonPropertyName("pinLat")]
    public double? PinLat { get; set; }

    [JsonPropertyName("pinLong")]
    public double? PinLong { get; set; }

    [JsonPropertyName("shots")]
    public List<Shot> Shots { get; set; } = [];
}