using Simulation.Models;

namespace Simulation.Services;

public interface IPenaltyManager
{
    bool IsPenalty(LieType lie);
}
