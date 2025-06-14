using Simulation.Models;

namespace Simulation.Services;

public interface ILieManager
{
    string GetNextLie(string previousLie, double distanceToHole, GolferDna dna);
}
