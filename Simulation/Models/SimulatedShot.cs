using System.Text.Json.Serialization;

namespace Simulation.Models;

public class SimulatedShot
{
    [JsonPropertyName("shotNumber")]
    public int ShotNumber { get; set; }

    [JsonPropertyName("clubUsed")]
    public int ClubUsed { get; set; }

    [JsonPropertyName("clubName")]
    public string ClubName { get; set; } = string.Empty;

    [JsonPropertyName("distanceTravelled")]
    public double DistanceTravelled { get; set; }

    [JsonPropertyName("lie")]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public LieType Lie { get; set; } = LieType.Tee;

    [JsonPropertyName("distanceToHoleAfterShot")]
    public double DistanceToHoleAfterShot { get; set; }
}
