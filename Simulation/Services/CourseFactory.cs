using ArccosScraper.Models;
using Simulation.Models;

namespace Simulation.Services;

public class CourseFactory
{
    public CourseLayout BuildCourse(List<ComprehensiveShotRecord> allShots, string courseName)
    {
        var courseShots = allShots.Where(s => s.CourseName == courseName).ToList();
        var course = new CourseLayout { CourseName = courseName };

        // First, group all shots for the course by which hole they belong to.
        var shotsByHole = courseShots.GroupBy(s => s.HoleNumber);

        foreach (var holeGroup in shotsByHole.OrderBy(h => h.Key))
        {
            // Now, for each hole, group the shots by the specific round they were played in.
            // This treats each time you played Hole 1 as a separate "instance".
            var holeInstances = holeGroup.GroupBy(s => s.RoundId);

            var calculatedHoleLengths = new List<double>();
            foreach (var instance in holeInstances)
            {
                // For this single instance of playing the hole, sum the distance of all non-putter shots.
                // This gives us the total length for that one time you played it.
                var instanceLength = instance
                    .Where(s => s.ClubId != GolferDna.PutterClubId)
                    .Sum(s => s.Distance);

                if (instanceLength > 50) // Basic sanity check to exclude incomplete hole data
                {
                    calculatedHoleLengths.Add(instanceLength);
                }
            }

            // If we have no valid calculated lengths, we can't model the hole.
            if (!calculatedHoleLengths.Any()) continue;

            // The hole's official length for our simulation is the *average* of all the calculated lengths.
            var averageLength = calculatedHoleLengths.Average();

            // Infer par from the much more realistic average length.
            var par = 3;
            if (averageLength > 470) par = 5;
            else if (averageLength > 250) par = 4;

            course.Holes.Add(new HoleLayout
            {
                HoleNumber = holeGroup.Key,
                Par = par,
                LengthYards = averageLength
            });
        }
        return course;
    }
}
