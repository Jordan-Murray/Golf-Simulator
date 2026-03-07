using Simulation.Models;

namespace Simulation.Services;

public class DefaultClubSelector : IClubSelector
{
    private readonly Random _rand = new();

    public ClubPerformanceProfile SelectClub(double distanceYards, LieType lie, GolferDna dna, string? teeKey = null)
    {
        if (lie == LieType.Tee && teeKey != null && dna.TeeShotDistributions.TryGetValue(teeKey, out var distribution))
        {
            var sampledClub = SampleTeeClub(distribution, dna);
            if (sampledClub != null)
                return sampledClub;
        }

        // honour usual tee‐shot first if provided
        if (lie == LieType.Tee && teeKey != null && dna.TeeShotStrategy.TryGetValue(teeKey, out var usualClubId))
        {
            if (dna.ClubProfiles.TryGetValue(usualClubId, out var preferred))
                return preferred;
        }

        var eligible = (lie == LieType.Tee)
            ? dna.ClubProfiles.Values
            : dna.ClubProfiles.Values.Where(c => c.ClubId != 1); // not driver off deck

        var selected = eligible
            .Where(c => c.DistanceByLie.ContainsKey(lie) || c.DistanceByLie.ContainsKey(LieType.Default))
            .OrderBy(c => Math.Abs(GetDistanceForLie(c, lie) - distanceYards))
            .FirstOrDefault();

        if (selected != null)
            return selected;

        throw new InvalidOperationException("No eligible clubs available for the current lie.");
    }

    private static double GetDistanceForLie(ClubPerformanceProfile club, LieType lie)
    {
        if (club.DistanceByLie.TryGetValue(lie, out var lieDistance))
            return lieDistance;

        if (club.DistanceByLie.TryGetValue(LieType.Default, out var defaultDistance))
            return defaultDistance;

        return 0;
    }

    private ClubPerformanceProfile? SampleTeeClub(IEnumerable<TeeClubWeight> distribution, GolferDna dna)
    {
        var candidates = distribution
            .Where(w => w.Weight > 0 && dna.ClubProfiles.ContainsKey(w.ClubId))
            .ToList();

        if (candidates.Count == 0)
            return null;

        var totalWeight = candidates.Sum(c => c.Weight);
        var roll = _rand.NextDouble() * totalWeight;
        var acc = 0.0;

        foreach (var option in candidates)
        {
            acc += option.Weight;
            if (roll <= acc)
                return dna.ClubProfiles[option.ClubId];
        }

        return dna.ClubProfiles[candidates[^1].ClubId];
    }
}
