using Simulation.Models;

namespace Simulation.Services;

public interface ILieManager
{
    LieType GetNextLie(LieType previousLie, double distanceToHole, GolferDna dna);
}
