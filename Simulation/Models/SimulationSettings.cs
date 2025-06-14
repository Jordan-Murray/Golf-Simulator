namespace Simulation.Models
{
    public class SimulationSettings
    {
        // How many penalty strokes do you average per 18 holes?
        public double AveragePenaltiesPer18Holes { get; set; }

        // What percentage of putts inside 6 feet do you want to make? (Set to 100 for "perfect")
        public double MakePercentageInside6Feet { get; set; }

        // How many extra yards do you want to add to your driver? (Can be negative)
        public double DriverDistanceBoostYards { get; set; }

        // A multiplier for accuracy. 1.0 is your normal dispersion.
        // 0.8 would be 20% more accurate. 1.2 would be 20% less accurate.
        public double OverallAccuracyMultiplier { get; set; }
    }
}
