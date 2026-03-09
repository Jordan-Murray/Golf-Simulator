using Simulation.Models;

namespace Simulation.Services;

public class DefaultClubSelector(SimulationSettings settings) : IClubSelector
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
            if (!settings.AvoidClubIds.Contains(usualClubId) &&
                dna.ClubProfiles.TryGetValue(usualClubId, out var preferred))
                return preferred;
        }

        var eligible = (lie == LieType.Tee)
            ? dna.ClubProfiles.Values
            : dna.ClubProfiles.Values.Where(c => c.ClubId != 1); // not driver off deck

        var baseCandidates = eligible
            .Where(c => !settings.AvoidClubIds.Contains(c.ClubId))
            .Where(c => c.DistanceByLie.ContainsKey(lie) || c.DistanceByLie.ContainsKey(LieType.Default))
            .ToList();

        var constrainedCandidates = lie == LieType.Tee
            ? baseCandidates
            : baseCandidates
                .Where(c =>
                {
                    if (!dna.ClubPracticalMaxDistance.TryGetValue(c.ClubId, out var practicalMax))
                        return true;
                    return distanceYards <= practicalMax + 10;
                })
                .ToList();

        var scoringCandidates = constrainedCandidates.Count > 0 ? constrainedCandidates : baseCandidates;

        var selected = scoringCandidates
            .OrderBy(c =>
            {
                var clubCarry = GetDistanceForLie(c, lie);
                var distanceError = Math.Abs(clubCarry - distanceYards);
                var usage = dna.ClubUsagePercentage.GetValueOrDefault(c.ClubId, 0.01);
                var usagePenaltyYards = (1.0 - usage) * 25.0;
                // Extra penalty when a short/rare club is stretched beyond its normal role.
                var stretchPenalty = distanceYards > (clubCarry + 20)
                    ? (distanceYards - (clubCarry + 20)) * 1.2
                    : 0;
                var windowPenalty = 0.0;
                if (dna.ClubDistanceP25.TryGetValue(c.ClubId, out var p25) &&
                    dna.ClubDistanceP75.TryGetValue(c.ClubId, out var p75))
                {
                    if (distanceYards > p75 + 10)
                        windowPenalty += (distanceYards - (p75 + 10)) * 1.8;
                    if (distanceYards < p25 - 10)
                        windowPenalty += ((p25 - 10) - distanceYards) * 1.4;
                }

                return distanceError + usagePenaltyYards + stretchPenalty + windowPenalty;
            })
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
            .Where(w => w.Weight > 0 && dna.ClubProfiles.ContainsKey(w.ClubId) && !settings.AvoidClubIds.Contains(w.ClubId))
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
