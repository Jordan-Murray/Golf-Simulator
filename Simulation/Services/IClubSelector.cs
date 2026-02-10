using Simulation.Models;

namespace Simulation.Services;

public interface IClubSelector
{
    ClubPerformanceProfile SelectClub(double distanceYards, LieType lie, GolferDna dna, string? teeKey = null);
}
