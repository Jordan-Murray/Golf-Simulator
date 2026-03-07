using Simulation.Models;

namespace Simulation.Services;

public class SimulationService
{
    private readonly GolferDna _dna;
    private readonly IClubSelector _clubs;
    private readonly ILieManager _lies;
    private readonly IPuttingModel _putts;
    private readonly IPenaltyManager _pen;
    private readonly SimulationSettings _settings;

    private readonly Random _rand = new();
    private bool _verbose;

    public SimulationService(
        GolferDna dna,
        IClubSelector clubs,
        ILieManager lies,
        IPuttingModel putts,
        IPenaltyManager pen,
        SimulationSettings settings)
    {
        _dna = dna;
        _clubs = clubs;
        _lies = lies;
        _putts = putts;
        _pen = pen;
        _settings = settings;
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
        var lie = LieType.Tee;
        var shotN = 0;
        var extraTotal = SampleExtraStrokes(_settings.ExtraStrokesPerHole);
        var extraPutts = 0;
        for (int i = 0; i < extraTotal; i++)
        {
            if (_rand.NextDouble() < 0.6) extraPutts++;
        }
        var extraNonPutt = extraTotal - extraPutts;

        while (dist > 0.1)
        {
            if (lie != LieType.Green && extraNonPutt > 0 && _rand.NextDouble() < 0.35)
            {
                var addPenalty = _rand.NextDouble() < 0.45;
                shotN++;

                if (addPenalty)
                {
                    Log("Penalty stroke (calibration): lost ball / hazard.");
                    sh.Shots.Add(new SimulatedShot
                    {
                        ShotNumber = shotN,
                        ClubName = "Penalty",
                        ClubUsed = -1,
                        DistanceTravelled = 0,
                        Lie = lie,
                        DistanceToHoleAfterShot = dist
                    });
                }
                else
                {
                    var duffTravel = Math.Min(dist, 1 + (_rand.NextDouble() * 9));
                    dist = Math.Max(0, dist - duffTravel);
                    Log($"Duffed shot (calibration): advanced only {duffTravel:F0} yards.");
                    sh.Shots.Add(new SimulatedShot
                    {
                        ShotNumber = shotN,
                        ClubName = "Duff Shot",
                        ClubUsed = -3,
                        DistanceTravelled = duffTravel,
                        Lie = lie,
                        DistanceToHoleAfterShot = dist
                    });
                }

                extraNonPutt--;
                if (dist <= 0.1) break;
                continue;
            }

            // ---------------- penalties -----------------
            if (_pen.IsPenalty(lie))
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
            if (lie == LieType.Green)
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
                    if (extraPutts > 0)
                    {
                        extraPutts--;
                        var remainFtForced = _rand.Next(1, 4);
                        dist = remainFtForced / 3.0;
                        var forcedTravel = Math.Max(0, startFt / 3.0 - dist);
                        sh.Shots[^1].DistanceTravelled = forcedTravel;
                        sh.Shots[^1].DistanceToHoleAfterShot = dist;
                        Log($"Shot {shotN} (Putt): Burned the edge from {startFt:F1} ft. {remainFtForced:F1} ft remaining.");
                    }
                    else
                    {
                    Log($"Shot {shotN} (Putt): Sunk a {startFt:F1} footer!");
                    break;
                    }
                }

                var remainFt = dist.ToFeet();
                Log($"Shot {shotN} (Putt): Lagged a {startFt:F1} footer close. {remainFt:F1} feet remaining.");

                // tap-ins
                var totalTapAttempts = taps + extraPutts;
                extraPutts = 0;
                var remainYards = dist;
                for (int i = 0; i < totalTapAttempts; i++)
                {
                    shotN++;
                    bool last = i == totalTapAttempts - 1;
                    var verb = last ? "Sunk" : "Missed";
                    var puttStartFt = remainYards.ToFeet();
                    Log($"Shot {shotN} (Putt): {verb} a {puttStartFt:F1} footer!");

                    double travelYards;
                    double afterYards;
                    if (last)
                    {
                        travelYards = remainYards;
                        afterYards = 0;
                    }
                    else
                    {
                        // Misses from short range usually leave a very short follow-up.
                        var leaveYards = Math.Min(remainYards, (0.5 + (_rand.NextDouble() * 1.5)) / 3.0);
                        travelYards = Math.Max(0, remainYards - leaveYards);
                        afterYards = leaveYards;
                    }

                    sh.Shots.Add(new SimulatedShot
                    {
                        ShotNumber = shotN,
                        ClubName = "Putter",
                        ClubUsed = GolferDna.PutterClubId,
                        DistanceTravelled = travelYards,
                        Lie = LieType.Green,
                        DistanceToHoleAfterShot = afterYards
                    });

                    remainYards = afterYards;
                }
                dist = 0;
                break;
            }

            // ---------------- full shot ------------------
            shotN++;

            var club = _clubs.SelectClub(dist, lie, _dna, teeKey);
            var clubName = ClubNameMapper.GetClubName(club.ClubId);

            var shotDist = (dist <= 60 && lie != LieType.Tee)
                ? dist * (0.9 + 0.2 * _rand.NextDouble())      // pitch/chip
                : club.GetRandomDistance(lie, _settings.OverallAccuracyMultiplier);

            // Apply driver distance boost from settings
            if (club.ClubId == 1)
                shotDist += _settings.DriverDistanceBoostYards;

            var rawRemaining = dist - shotDist;
            var remaining = Math.Abs(rawRemaining);

            LieType newLie;
            if (rawRemaining <= 0)
            {
                // Overshot the flag: often off green unless the miss is very small.
                newLie = remaining switch
                {
                    <= 5 => LieType.Green,
                    <= 20 => _rand.NextDouble() < 0.65 ? LieType.Green : LieType.Rough,
                    _ => _rand.NextDouble() < 0.85 ? LieType.Rough : LieType.Sand
                };
            }
            else
            {
                newLie = remaining < 30
                    ? LieType.Green
                    : _lies.GetNextLie(lie, remaining, _dna);
            }

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

    private int SampleExtraStrokes(double expectedPerHole)
    {
        if (expectedPerHole <= 0) return 0;
        var whole = (int)Math.Floor(expectedPerHole);
        var fractional = expectedPerHole - whole;
        return whole + (_rand.NextDouble() < fractional ? 1 : 0);
    }
    #endregion
}
