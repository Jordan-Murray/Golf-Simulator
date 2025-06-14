using Simulation.Models;

namespace Simulation.Services;

public class DefaultClubSelector : IClubSelector
{
    public ClubPerformanceProfile SelectClub(double distanceYards, string lie, GolferDna dna, string? teeKey = null)
    {
        // honour usual tee‑shot first if provided
        if (lie == "Tee" && teeKey != null && dna.TeeShotStrategy.TryGetValue(teeKey, out var usualClubId))
        {
            return dna.ClubProfiles[usualClubId];
        }

        var eligible = (lie == "Tee")
            ? dna.ClubProfiles.Values
            : dna.ClubProfiles.Values.Where(c => c.ClubId != 1); // not driver off deck

        return eligible
            .Where(c => c.DistanceByLie.ContainsKey(lie) || c.DistanceByLie.ContainsKey("Default"))
            .OrderBy(c => Math.Abs(c.DistanceByLie.GetValueOrDefault(lie, c.DistanceByLie["Default"]) - distanceYards))
            .First();
    }
}