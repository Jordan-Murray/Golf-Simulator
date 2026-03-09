namespace Simulation.Models;

public class ShortGameProfile
{
    public double GreenHitRate { get; set; } = 0.65;
    public double LeaveDistanceMeanFeet { get; set; } = 9.0;
    public double LeaveDistanceStdFeet { get; set; } = 4.0;
    public double DuffChance { get; set; } = 0.08;
}
