using Simulation.Models;

namespace Simulation.Services;

public class SimulationMenu
{
    private readonly SimulationService _sim;
    private readonly CourseLayout _course;

    private readonly List<SimulatedRound> _history = [];

    public SimulationMenu(SimulationService sim, CourseLayout course)
    {
        _sim = sim;
        _course = course;
    }

    // ---------------------------------------------------------------------
    public void Start()
    {
        while (true)
        {
            Console.WriteLine("\n--- Simulation Menu ---");
            Console.WriteLine($"Course: {_course.CourseName}");
            Console.WriteLine("How many holes of golf per round would you like to play? (9/18)");
            var holesToPlay = Console.ReadLine()?.Trim();
            var selectedHoles = holesToPlay switch
            {
                "9" => _course.Holes.Take(9).ToList(),
                "18" => _course.Holes.Take(18).ToList(),
                _ => throw new ArgumentException("Invalid input. Please enter 9 or 18.")
            };
            var courseToPlay = new CourseLayout
            {
                CourseName = _course.CourseName,
                Holes = selectedHoles
            };

            Console.Write("\nHow many rounds should I simulate? (q to quit) : ");
            var input = Console.ReadLine()?.Trim().ToLower();

            if (input == "q") return;
            if (!int.TryParse(input, out var n) || n <= 0)
            {
                Console.WriteLine("Please enter a positive integer.");
                continue;
            }

            RunBatch(n, courseToPlay);
            ShowSummary();

            while (true)
            {
                Console.Write("\nEnter a round # to replay (or press Enter to continue): ");
                var pick = Console.ReadLine();
                if (string.IsNullOrWhiteSpace(pick)) break;

                if (int.TryParse(pick, out var idx) &&
                    idx >= 1 && idx <= _history.Count)
                {
                    Console.WriteLine();
                    PrintRound(_history[idx - 1]);
                }
                else
                {
                    Console.WriteLine("Invalid round number.");
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    private void RunBatch(int n, CourseLayout course)
    {
        _history.Clear();
        Console.WriteLine();
        for (int i = 1; i <= n; i++)
        {
            var silentRound = _sim.Run(course, verbose: false);
            _history.Add(silentRound);
            Console.WriteLine($"Round {i}: {silentRound.TotalScore} ({ToPar(silentRound.ScoreToPar)})");
        }
    }

    private void ShowSummary()
    {
        var best = _history.MinBy(r => r.TotalScore)!;
        var worst = _history.MaxBy(r => r.TotalScore)!;
        var avg = _history.Average(r => r.TotalScore);
        var par = _history[0].Holes.Sum(h => h.Par);

        Console.WriteLine("\n--------------------------------------------------");
        Console.WriteLine($"Best Round : {best.TotalScore} ({ToPar(best.ScoreToPar)})");
        Console.WriteLine($"Worst Round: {worst.TotalScore} ({ToPar(worst.ScoreToPar)})");
        Console.WriteLine($"Average    : {avg:F1} ({ToPar((int)Math.Round(avg - par))})");
        Console.WriteLine("--------------------------------------------------");
    }

    private static void PrintRound(SimulatedRound round)
    {
        Console.WriteLine($"--- Replay: {round.CourseName} ---\n");

        foreach (var hole in round.Holes)
        {
            Console.WriteLine($"\n--- Hole {hole.HoleNumber} (Par {hole.Par}) ---");
            foreach (var shot in hole.Shots)
            {
                Console.WriteLine($"  Shot {shot.ShotNumber}: {shot.ClubName} — {shot.DistanceTravelled:F0} yds, Lie: {shot.Lie}, {shot.DistanceToHoleAfterShot:F0} yds remaining");
            }
            Console.WriteLine($"  Score: {hole.Score}");
        }

        Console.WriteLine($"\nTotal: {round.TotalScore} ({ToPar(round.ScoreToPar)})");
    }

    private static string ToPar(int diff) =>
        diff == 0 ? "E" : diff > 0 ? $"+{diff}" : diff.ToString();
}
