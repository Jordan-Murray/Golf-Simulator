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

    /// <summary>Automatically tune key simulation inputs from historical shots at startup.</summary>
    public bool AutoCalibrateFromHistoricalData { get; set; } = true;

    /// <summary>How strongly auto calibration should override configured settings (0-1).</summary>
    public double AutoCalibrationBlend { get; set; } = 0.7;

    /// <summary>
    /// Additional stochastic strokes per hole used to match real scoring pressure
    /// (short game errors, recovery shots, decision mistakes not captured elsewhere).
    /// </summary>
    public double ExtraStrokesPerHole { get; set; }

    /// <summary>Club IDs to avoid in selection logic unless no viable alternatives exist.</summary>
    public List<int> AvoidClubIds { get; set; } = [];

    /// <summary>Chance a simulated round is a "good form" day.</summary>
    public double GoodRoundChance { get; set; } = 0.2;

    /// <summary>Chance a simulated round is an "off form" day.</summary>
    public double OffRoundChance { get; set; } = 0.3;

    /// <summary>Multiplier applied to shot-dispersion on good-form days.</summary>
    public double GoodRoundAccuracyFactor { get; set; } = 0.9;

    /// <summary>Multiplier applied to shot-dispersion on off-form days.</summary>
    public double OffRoundAccuracyFactor { get; set; } = 1.15;

    /// <summary>Multiplier applied to per-hole trouble events on good-form days.</summary>
    public double GoodRoundTroubleFactor { get; set; } = 0.8;

    /// <summary>Multiplier applied to per-hole trouble events on off-form days.</summary>
    public double OffRoundTroubleFactor { get; set; } = 1.3;

    /// <summary>Probability of a blow-up hole event on each hole.</summary>
    public double BlowupHoleChancePerHole { get; set; } = 0.12;

    /// <summary>Minimum extra non-putt strokes added when a blow-up hole triggers.</summary>
    public int BlowupExtraStrokesMin { get; set; } = 1;

    /// <summary>Maximum extra non-putt strokes added when a blow-up hole triggers.</summary>
    public int BlowupExtraStrokesMax { get; set; } = 3;
}
