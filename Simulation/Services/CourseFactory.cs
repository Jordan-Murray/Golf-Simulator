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
            var holeInstances = holeGroup.GroupBy(s => s.RoundId);

            var calculatedHoleLengths = new List<double>();
            var inferredPars = new List<int>();

            foreach (var instance in holeInstances)
            {
                var shots = instance.ToList();

                var instanceLength = shots
                    .Where(s => s.ClubId != GolferDna.PutterClubId)
                    .Sum(s => s.Distance);

                if (instanceLength > 50)
                    calculatedHoleLengths.Add(instanceLength);

                // When GIR was hit, par = non-putt shots + 2
                if (shots[0].HoleIsGir)
                {
                    var nonPuttShots = shots.Count(s => s.ClubId != GolferDna.PutterClubId);
                    inferredPars.Add(nonPuttShots + 2);
                }
            }

            if (calculatedHoleLengths.Count == 0) continue;

            var averageLength = calculatedHoleLengths.Average();

            // Use GIR-inferred par when available, fall back to yardage heuristic
            var par = inferredPars.Count > 0
                ? inferredPars.GroupBy(p => p).MaxBy(g => g.Count())!.Key
                : averageLength switch
                {
                    > 470 => 5,
                    > 250 => 4,
                    _ => 3
                };

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
