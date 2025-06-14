namespace Simulation.Models;

public class CourseLayout
{
    public string CourseName { get; set; } = string.Empty;
    public List<HoleLayout> Holes { get; set; } = [];
}
