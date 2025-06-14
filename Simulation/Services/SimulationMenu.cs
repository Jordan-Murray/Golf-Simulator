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
            Console.Write("\nHow many rounds should I simulate? (q to quit) : ");
            var input = Console.ReadLine()?.Trim().ToLower();

            if (input == "q") return;
            if (!int.TryParse(input, out var n) || n <= 0)
            {
                Console.WriteLine("Please enter a positive integer.");
                continue;
            }

            RunBatch(n);
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
                    // re-run that round verbosely so you see every shot
                    _sim.Run(_course, verbose: true);
                }
                else
                {
                    Console.WriteLine("Invalid round number.");
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    private void RunBatch(int n)
    {
        _history.Clear();
        Console.WriteLine();
        for (int i = 1; i <= n; i++)
        {
            var silentRound = _sim.Run(_course, verbose: false);
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

    private static string ToPar(int diff) =>
        diff == 0 ? "E" : diff > 0 ? $"+{diff}" : diff.ToString();
}