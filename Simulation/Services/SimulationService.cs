using Simulation.Models;

namespace Simulation.Services;

public class SimulationService
{
    private readonly GolferDna _dna;
    private readonly IClubSelector _clubs;
    private readonly ILieManager _lies;
    private readonly IPuttingModel _putts;
    private readonly IPenaltyManager _pen;

    private readonly Random _rand = new();
    private bool _verbose;

    public SimulationService(
        GolferDna dna,
        IClubSelector clubs,
        ILieManager lies,
        IPuttingModel putts,
        IPenaltyManager pen)
    {
        _dna = dna;
        _clubs = clubs;
        _lies = lies;
        _putts = putts;
        _pen = pen;
    }

    // ---------------------------------------------------------------------
    #region Public API
    public SimulatedRound Run(CourseLayout course, bool verbose = true)
    {
        _verbose = verbose;
        Log($"--- Starting Simulation at {course.CourseName} ---\n");

        var rnd = new SimulatedRound { CourseName = course.CourseName };

        foreach (var hole in course.Holes.OrderBy(h => h.HoleNumber))
            rnd.Holes.Add(PlayHole(course.CourseName, hole));

        Log("\n--- Simulation Complete ---");
        Log($"Total Score: {rnd.TotalScore} ({FormatToPar(rnd.ScoreToPar)})");
        return rnd;
    }
    #endregion

    // ---------------------------------------------------------------------
    #region Hole engine
    private SimulatedHole PlayHole(string course, HoleLayout layout)
    {
        Log($"\n--- Playing Hole {layout.HoleNumber} (Par {layout.Par}, {layout.LengthYards:F0} yards) ---\n");

        var teeKey = $"{course}-{layout.HoleNumber}";
        if (_dna.TeeShotStrategy.TryGetValue(teeKey, out var usual))
            Log($"Caddie Strategy: Using your usual {ClubNameMapper.GetClubName(usual)} on this tee.\n");

        var sh = new SimulatedHole { HoleNumber = layout.HoleNumber, Par = layout.Par };
        var dist = layout.LengthYards;
        var lie = "Tee";
        var shotN = 0;

        while (dist > 0.1)
        {
            // ---------------- penalties -----------------
            if (_pen.IsPenalty())
            {
                shotN++;
                Log("PENALTY STROKE! A costly mistake.");
                sh.Shots.Add(new SimulatedShot
                {
                    ShotNumber = shotN,
                    ClubName = "Penalty",
                    ClubUsed = -1,
                    DistanceTravelled = 0,
                    Lie = lie,
                    DistanceToHoleAfterShot = dist
                });
                continue;
            }

            // ---------------- putting -------------------
            if (lie == "Green")
            {
                shotN++;
                var startFt = dist.ToFeet();
                var (travel, holed, taps) = _putts.Putt(dist);
                dist -= travel;

                sh.Shots.Add(new SimulatedShot
                {
                    ShotNumber = shotN,
                    ClubName = "Putter",
                    ClubUsed = GolferDna.PutterClubId,
                    DistanceTravelled = travel,
                    Lie = lie,
                    DistanceToHoleAfterShot = dist
                });

                if (holed)
                {
                    Log($"Shot {shotN} (Putt): Sunk a {startFt:F1} footer!");
                    break;
                }

                var remainFt = dist.ToFeet();
                Log($"Shot {shotN} (Putt): Lagged a {startFt:F1} footer close. {remainFt:F1} feet remaining.");

                // tap-ins
                for (int i = 0; i < taps; i++)
                {
                    shotN++;
                    bool last = i == taps - 1;
                    var verb = last ? "Sunk" : "Missed";
                    Log($"Shot {shotN} (Putt): {verb} a {remainFt:F1} footer!");

                    sh.Shots.Add(new SimulatedShot
                    {
                        ShotNumber = shotN,
                        ClubName = "Putter",
                        ClubUsed = GolferDna.PutterClubId,
                        DistanceTravelled = remainFt / 3.28,
                        Lie = "Green",
                        DistanceToHoleAfterShot = last ? 0 : remainFt / 3.28
                    });
                }
                dist = 0;
                break;
            }

            // ---------------- full shot ------------------
            shotN++;

            var club = _clubs.SelectClub(dist, lie, _dna, teeKey);
            var clubName = ClubNameMapper.GetClubName(club.ClubId);

            var shotDist = (dist <= 60 && lie != "Tee")
                ? dist * (0.9 + 0.2 * _rand.NextDouble())      // pitch/chip
                : club.GetRandomDistance(lie);

            var remaining = Math.Abs(dist - shotDist);
            var newLie = remaining < 30 ? "Green"
                                           : _lies.GetNextLie(lie, remaining, _dna);

            Log($"Shot {shotN}: Hit {clubName} {shotDist:F0} yards. Lie: {newLie}. {remaining:F0} yards remaining.");

            sh.Shots.Add(new SimulatedShot
            {
                ShotNumber = shotN,
                ClubName = clubName,
                ClubUsed = club.ClubId,
                DistanceTravelled = shotDist,
                Lie = newLie,
                DistanceToHoleAfterShot = remaining
            });

            lie = newLie;
            dist = remaining;
        }

        sh.Score = shotN;
        Log($"Hole {layout.HoleNumber} Score: {shotN}");
        return sh;
    }
    #endregion

    // ---------------------------------------------------------------------
    #region Helpers
    private void Log(string msg)
    {
        if (_verbose) Console.WriteLine(msg);
    }

    private static string FormatToPar(int diff) =>
        diff == 0 ? "E" : (diff > 0 ? $"+{diff}" : diff.ToString());
    #endregion
}