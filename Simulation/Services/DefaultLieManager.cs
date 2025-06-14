using Simulation.Models;

namespace Simulation.Services;

public class DefaultLieManager : ILieManager
{
    private readonly Random _rand = new();
    public string GetNextLie(string previousLie, double distanceToHole, GolferDna dna)
    {
        if (distanceToHole < 30) return "Green";

        if (previousLie == "Tee")
        {
            // Use user's fairway percentage
            return _rand.NextDouble() < dna.FairwayHitPercentage ? "Fairway" : "Rough";
        }

        // 70/30 fairway/rough after first shot
        return _rand.NextDouble() < 0.7 ? "Fairway" : "Rough";
    }
}
