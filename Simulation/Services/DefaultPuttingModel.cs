using Simulation.Models;

namespace Simulation.Services;

public class DefaultPuttingModel(GolferDna dna, SimulationSettings settings) : IPuttingModel
{
    private readonly Random _rand = new();
    private readonly double _onePuttPct = NormalizeToPercent(dna.PuttingStatistics.OnePuttPercentage);
    private readonly double _twoPuttPct = NormalizeToPercent(dna.PuttingStatistics.TwoPuttPercentage);
    private readonly double _threePuttPct = NormalizeToPercent(dna.PuttingStatistics.ThreePuttPercentage);
    private readonly List<PuttingBandProfile> _bandProfiles = dna.PuttingBandProfiles
        .OrderBy(p => p.MaxDistanceFeet)
        .ToList();

    public (double distanceTravelled, bool holed, int extraStrokes) Putt(double distanceToHoleYards)
    {
        var feet = distanceToHoleYards * 3.0;
        var r = _rand.NextDouble() * 100;

        // Short putts (≤6 feet) use the configured make percentage
        if (feet <= 6)
        {
            if (r < settings.MakePercentageInside6Feet)
                return (distanceToHoleYards, true, 0);

            // Missed short putt — leave a tap-in
            var remainingYards = Math.Min(distanceToHoleYards, _rand.Next(1, 3) / 3.0);
            var travelled = Math.Max(0, distanceToHoleYards - remainingYards);
            return (travelled, false, 1);
        }

        var (onePuttPct, twoPuttPct, threePuttPct) = GetPuttProbabilities(feet);
        var totalPct = onePuttPct + twoPuttPct + threePuttPct;
        var scale = totalPct > 100 ? 100.0 / totalPct : 1.0;
        var onePuttThreshold = totalPct > 0 ? onePuttPct * scale : 8;
        var twoPuttThreshold = totalPct > 0 ? (onePuttPct + twoPuttPct) * scale : 8 + 82;

        if (r < onePuttThreshold)
        {
            // Holed it
            return (distanceToHoleYards, true, 0);
        }

        if (r < twoPuttThreshold)
        {
            // Two‑putt: lag then tap‑in
            var remainingFeet = feet > 25 ? _rand.Next(4, 8) : _rand.Next(1, 4);
            var remainingYards = remainingFeet / 3.0;
            var travelled = Math.Max(0, distanceToHoleYards - Math.Min(distanceToHoleYards, remainingYards));
            return (travelled, false, 1); // will add a tap‑in stroke
        }

        // Three‑putt: lag, small miss, tap‑in
        var missFeet = _rand.Next(2, 6);
        var missYards = missFeet / 3.0;
        var travelled3 = Math.Max(0, distanceToHoleYards - Math.Min(distanceToHoleYards, missYards));
        return (travelled3, false, 2); // adds two extra strokes
    }

    private static double NormalizeToPercent(double value)
    {
        if (value <= 0) return 0;
        if (value <= 1) return value * 100;
        return Math.Min(100, value);
    }

    private (double one, double two, double three) GetPuttProbabilities(double feet)
    {
        if (_bandProfiles.Count > 0)
        {
            var band = _bandProfiles.FirstOrDefault(b => feet <= b.MaxDistanceFeet) ?? _bandProfiles[^1];
            return (
                NormalizeToPercent(band.OnePuttPercentage),
                NormalizeToPercent(band.TwoPuttPercentage),
                NormalizeToPercent(band.ThreePuttPercentage));
        }

        return (_onePuttPct, _twoPuttPct, _threePuttPct);
    }
}
