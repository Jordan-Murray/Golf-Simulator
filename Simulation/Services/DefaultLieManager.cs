using Simulation.Models;

namespace Simulation.Services;

public class DefaultLieManager : ILieManager
{
    private readonly Random _rand = new();
    public LieType GetNextLie(LieType previousLie, double distanceToHole, GolferDna dna)
    {
        if (distanceToHole < 30) return LieType.Green;

        if (previousLie == LieType.Tee)
        {
            // Use user's fairway percentage
            return _rand.NextDouble() < dna.FairwayHitPercentage ? LieType.Fairway : LieType.Rough;
        }

        // 70/30 fairway/rough after first shot
        return _rand.NextDouble() < 0.7 ? LieType.Fairway : LieType.Rough;
    }
}
