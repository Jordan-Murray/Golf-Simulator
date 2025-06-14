using System.Text.Json.Serialization;

namespace Simulation.Models;

public class SimulatedHole
{
    [JsonPropertyName("holeNumber")]
    public int HoleNumber { get; set; }

    [JsonPropertyName("par")]
    public int Par { get; set; }

    [JsonPropertyName("score")]
    public int Score { get; set; }

    [JsonPropertyName("shots")]
    public List<SimulatedShot> Shots { get; set; } = [];
}
