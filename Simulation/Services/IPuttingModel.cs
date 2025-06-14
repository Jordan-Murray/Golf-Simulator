namespace Simulation.Services;

public interface IPuttingModel
{
    (double distanceTravelled, bool holed, int extraStrokes) Putt(double distanceToHoleYards);
}
