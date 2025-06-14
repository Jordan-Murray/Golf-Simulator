using Simulation.Models;

namespace Simulation.Services;

public class DefaultPuttingModel : IPuttingModel
{
    private readonly GolferDna _dna;
    private readonly Random _rand = new();

    public DefaultPuttingModel(GolferDna dna) => _dna = dna;

    public (double distanceTravelled, bool holed, int extraStrokes) Putt(double distanceToHoleYards)
    {
        var feet = distanceToHoleYards * 3.28;
        var r = _rand.NextDouble() * 100;
        var stats = _dna.PuttingStatistics;

        if (r < stats.OnePuttPercentage)
        {
            // Holed it
            return (distanceToHoleYards, true, 0);
        }

        if (r < stats.OnePuttPercentage + stats.TwoPuttPercentage)
        {
            // Two‑putt: lag then tap‑in
            var remainingFeet = feet > 25 ? _rand.Next(4, 8) : _rand.Next(1, 4);
            var remainingYards = remainingFeet / 3.28;
            var travelled = distanceToHoleYards - remainingYards;
            return (travelled, false, 1); // will add a tap‑in stroke
        }

        // Three‑putt: lag, small miss, tap‑in
        var missFeet = _rand.Next(2, 6);
        var missYards = missFeet / 3.28;
        var travelled3 = distanceToHoleYards - missYards;
        return (travelled3, false, 2); // adds two extra strokes
    }
}
