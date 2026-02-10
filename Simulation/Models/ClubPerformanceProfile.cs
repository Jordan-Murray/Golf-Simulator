namespace Simulation.Models;

public class ClubPerformanceProfile
{
    public int ClubId { get; set; }
    public Dictionary<LieType, double> DistanceByLie { get; set; } = [];
    public double StandardDeviation { get; set; }
}
