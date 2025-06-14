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
    public string Lie { get; set; } = "Tee"; // e.g., Tee, Fairway, Rough, Green

    [JsonPropertyName("distanceToHoleAfterShot")]
    public double DistanceToHoleAfterShot { get; set; }
}
