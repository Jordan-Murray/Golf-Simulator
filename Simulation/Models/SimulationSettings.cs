namespace Simulation.Models;

public class SimulationSettings
{
    /// <summary>How many penalty strokes do you average per 18 holes?</summary>
    public double AveragePenaltiesPer18Holes { get; set; } = 4.0;

    /// <summary>What percentage of putts inside 6 feet do you make? (Set to 100 for "perfect")</summary>
    public double MakePercentageInside6Feet { get; set; } = 90.0;

    /// <summary>Extra yards to add to your driver distance. Can be negative.</summary>
    public double DriverDistanceBoostYards { get; set; }

    /// <summary>
    /// Multiplier for shot dispersion. 1.0 = your normal spread.
    /// 0.8 = 20% more accurate. 1.2 = 20% less accurate.
    /// </summary>
    public double OverallAccuracyMultiplier { get; set; } = 1.0;
}
