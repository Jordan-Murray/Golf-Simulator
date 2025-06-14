namespace Simulation.Services;

public class DefaultPenaltyManager : IPenaltyManager
{
    private readonly double _chancePerShot;
    private readonly Random _rand = new();
    public DefaultPenaltyManager(double averagePenaltiesPer18)
    {
        // Average shots per round ≈ 72
        _chancePerShot = averagePenaltiesPer18 / 72.0;
    }

    public bool IsPenalty() => _rand.NextDouble() < _chancePerShot;
}
