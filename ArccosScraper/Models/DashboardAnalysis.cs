using System.Text.Json.Serialization;

namespace ArccosScraper.Models;

public class PercentageValue
{
    [JsonPropertyName("value")]
    public double Value { get; set; }
}

public class PuttStats
{
    [JsonPropertyName("onePutt")]
    public PercentageValue OnePutt { get; set; } = new();

    [JsonPropertyName("twoPutt")]
    public PercentageValue TwoPutt { get; set; } = new();

    [JsonPropertyName("threePutt")]
    public PercentageValue ThreePutt { get; set; } = new();
}

public class PuttingAnalysis
{
    [JsonPropertyName("avgPuttsPerRound")]
    public PuttStats AveragePuttsPerRound { get; set; } = new();
}

public class DashboardAnalysis
{
    [JsonPropertyName("putting")]
    public PuttingAnalysis Putting { get; set; } = new();
}