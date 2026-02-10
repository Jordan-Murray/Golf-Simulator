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

        var stdDev = profile.StandardDeviation * accuracyMultiplier;

        // Box–Muller transform for Gaussian randomness
        var u1 = 1.0 - _rand.NextDouble();
        var u2 = 1.0 - _rand.NextDouble();
        var randStdNormal = Math.Sqrt(-2.0 * Math.Log(u1)) *
                            Math.Sin(2.0 * Math.PI * u2);

        var result = mean + stdDev * randStdNormal;
        return Math.Max(1, result); // never negative or zero
    }

    private const double FeetPerYard = 3.0;

    public static double ToFeet(this double yards) => yards * FeetPerYard;
}
