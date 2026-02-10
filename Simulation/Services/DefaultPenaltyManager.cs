using Simulation.Models;

namespace Simulation.Services;

public class DefaultPenaltyManager(SimulationSettings settings) : IPenaltyManager
{
    private readonly double _basePenaltiesPer18 = settings.AveragePenaltiesPer18Holes;
    private readonly Random _rand = new();

    public bool IsPenalty(LieType lie)
    {
        // Base chance spread across ~72 shots per round
        var baseChance = _basePenaltiesPer18 / 72.0;

        var multiplier = lie switch
        {
            LieType.Tee => 1.5,
            LieType.Rough => 1.3,
            LieType.Sand => 1.2,
            LieType.Fairway => 0.3,
            LieType.Green => 0.0,
            _ => 1.0
        };

        return _rand.NextDouble() < baseChance * multiplier;
    }
}
