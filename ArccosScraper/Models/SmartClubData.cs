using System.Text.Json.Serialization;

namespace ArccosScraper.Models;

public class DistanceInfo
{
    [JsonPropertyName("distance")]
    public double Distance { get; set; }
}

public class TerrainDistances
{
    [JsonPropertyName("tee")]
    public DistanceInfo? Tee { get; set; }
    [JsonPropertyName("fairway")]
    public DistanceInfo? Fairway { get; set; }
    [JsonPropertyName("rough")]
    public DistanceInfo? Rough { get; set; }
    [JsonPropertyName("sand")]
    public DistanceInfo? Sand { get; set; }
}

public class DistanceRange
{
    [JsonPropertyName("low")]
    public double Low { get; set; }
    [JsonPropertyName("high")]
    public double High { get; set; }
}

public class SmartClubData
{
    [JsonPropertyName("clubId")]
    public int ClubId { get; set; }
    [JsonPropertyName("smartDistance")]
    public DistanceInfo? SmartDistance { get; set; }
    [JsonPropertyName("terrain")]
    public TerrainDistances? Terrain { get; set; }
    [JsonPropertyName("range")]
    public DistanceRange? Range { get; set; }
}

public class SmartDistancesApiResponse
{
    [JsonPropertyName("clubs")]
    public List<SmartClubData> Clubs { get; set; } = [];
}