using System.Text.Json.Serialization;

namespace Simulation.Models;

public class SimulatedRound
{
    [JsonPropertyName("courseName")]
    public string CourseName { get; set; } = string.Empty;

    [JsonPropertyName("totalScore")]
    public int TotalScore => Holes.Sum(h => h.Score);

    [JsonPropertyName("scoreToPar")]
    public int ScoreToPar => TotalScore - Holes.Sum(h => h.Par);

    [JsonPropertyName("holes")]
    public List<SimulatedHole> Holes { get; set; } = [];
}
