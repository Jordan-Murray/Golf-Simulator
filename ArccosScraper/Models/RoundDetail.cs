using System.Text.Json.Serialization;

namespace ArccosScraper.Models;

// This is the top-level object from the second API call
public class RoundDetail
{
    [JsonPropertyName("roundId")]
    public long RoundId { get; set; }

    [JsonPropertyName("courseName")]
    public string CourseName { get; set; } = string.Empty;

    [JsonPropertyName("courseId")]
    public long CourseId { get; set; }

    [JsonPropertyName("holes")]
    public List<Hole> Holes { get; set; } = [];
}