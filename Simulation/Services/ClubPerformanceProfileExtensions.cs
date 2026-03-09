using Simulation.Models;

namespace Simulation.Services;

public static class ClubPerformanceProfileExtensions
{
    private static readonly Random _rand = new();
    public static double GetRandomDistance(this ClubPerformanceProfile profile, LieType lie, double accuracyMultiplier = 1.0)
    {
        if (profile == null) throw new ArgumentNullException(nameof(profile));

        var mean = profile.DistanceByLie.TryGetValue(lie, out var distance)
                    ? distance
                    : profile.DistanceByLie.GetValueOrDefault(LieType.Default, 0);

        if (mean <= 0) return 1;

        var accuracyImpact = 1.0 + ((accuracyMultiplier - 1.0) * 0.45);
        var stdDev = Math.Max(2, profile.StandardDeviation * accuracyImpact);

        // Box–Muller transform for Gaussian randomness
        var u1 = 1.0 - _rand.NextDouble();
        var u2 = 1.0 - _rand.NextDouble();
        var randStdNormal = Math.Sqrt(-2.0 * Math.Log(u1)) *
                            Math.Sin(2.0 * Math.PI * u2);

        var raw = mean + stdDev * randStdNormal;
        var lower = Math.Max(1, mean - (2.5 * stdDev));
        var upper = Math.Min(mean + (2.5 * stdDev), (mean * 1.35) + 15);
        var result = Math.Clamp(raw, lower, upper);
        return Math.Max(1, result); // never negative or zero
    }

    private const double FeetPerYard = 3.0;

    public static double ToFeet(this double yards) => yards * FeetPerYard;
}
