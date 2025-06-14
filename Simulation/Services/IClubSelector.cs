using Simulation.Models;

namespace Simulation.Services;

public interface IClubSelector
{
    ClubPerformanceProfile SelectClub(double distanceYards, string lie, GolferDna dna, string? teeKey = null);
}
