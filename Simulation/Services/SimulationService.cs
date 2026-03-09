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
    private double _roundAccuracyFactor = 1.0;
    private double _roundTroubleFactor = 1.0;
    private double _roundPuttFeetAdjustment;
    private string _roundMode = "Normal";

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
        SetRoundMode();
        Log($"--- Starting Simulation at {course.CourseName} ---\n");
        Log($"Round Form: {_roundMode}");

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
        var extraTotal = SampleExtraStrokes(_settings.ExtraStrokesPerHole * _roundTroubleFactor);
        var extraPutts = 0;
        for (int i = 0; i < extraTotal; i++)
        {
            if (_rand.NextDouble() < 0.6) extraPutts++;
        }
        var extraNonPutt = extraTotal - extraPutts;
        var blowupHole = _rand.NextDouble() < Clamp(_settings.BlowupHoleChancePerHole * _roundTroubleFactor, 0.01, 0.85);
        if (blowupHole)
        {
            var blowupExtra = _rand.Next(
                Math.Max(0, _settings.BlowupExtraStrokesMin),
                Math.Max(_settings.BlowupExtraStrokesMin + 1, _settings.BlowupExtraStrokesMax + 1));
            extraNonPutt += blowupExtra;
            if (_rand.NextDouble() < 0.5) extraPutts++;
            Log("Blow-up hole risk triggered.");
        }

        while (dist > 0.1)
        {
            var troubleTriggerChance = blowupHole ? 0.6 : 0.35;
            if (lie != LieType.Green && extraNonPutt > 0 && _rand.NextDouble() < troubleTriggerChance)
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
            if (_pen.IsPenalty(lie) || (blowupHole && lie != LieType.Green && _rand.NextDouble() < 0.08))
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
                var puttInputDist = Math.Max(0.2, dist + (_roundPuttFeetAdjustment / 3.0));
                var (travelModel, holed, taps) = _putts.Putt(puttInputDist);
                var travel = Math.Min(dist, travelModel * (dist / puttInputDist));
                if (holed && _roundPuttFeetAdjustment > 0 && _rand.NextDouble() < 0.15)
                {
                    holed = false;
                    taps++;
                }
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

            if (dist <= 60 && lie != LieType.Tee)
            {
                var shortGame = SimulateShortGame(dist, lie);
                var shortRemaining = Math.Abs(shortGame.Remaining);
                var shortNewLie = shortGame.NewLie;
                var shortDist = shortGame.DistanceTravelled;

                Log($"Shot {shotN}: Hit {clubName} {shortDist:F0} yards. Lie: {shortNewLie}. {shortRemaining:F0} yards remaining.");

                sh.Shots.Add(new SimulatedShot
                {
                    ShotNumber = shotN,
                    ClubName = clubName,
                    ClubUsed = club.ClubId,
                    DistanceTravelled = shortDist,
                    Lie = shortNewLie,
                    DistanceToHoleAfterShot = shortRemaining
                });

                lie = shortNewLie;
                dist = shortRemaining;
                continue;
            }

            var shotDist = club.GetRandomDistance(lie, _settings.OverallAccuracyMultiplier * _roundAccuracyFactor);

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

    private void SetRoundMode()
    {
        var r = _rand.NextDouble();
        if (r < _settings.GoodRoundChance)
        {
            _roundMode = "Good";
            _roundAccuracyFactor = _settings.GoodRoundAccuracyFactor;
            _roundTroubleFactor = _settings.GoodRoundTroubleFactor;
            _roundPuttFeetAdjustment = -0.5;
            return;
        }

        if (r < _settings.GoodRoundChance + _settings.OffRoundChance)
        {
            _roundMode = "Off";
            _roundAccuracyFactor = _settings.OffRoundAccuracyFactor;
            _roundTroubleFactor = _settings.OffRoundTroubleFactor;
            _roundPuttFeetAdjustment = 0.8;
            return;
        }

        _roundMode = "Normal";
        _roundAccuracyFactor = 1.0;
        _roundTroubleFactor = 1.0;
        _roundPuttFeetAdjustment = 0.0;
    }

    private (double DistanceTravelled, double Remaining, LieType NewLie) SimulateShortGame(double distanceToHole, LieType lie)
    {
        var profile = _dna.ShortGameProfile;
        var duffChance = Clamp(profile.DuffChance * _roundTroubleFactor, 0.02, 0.45);
        if (_rand.NextDouble() < duffChance)
        {
            var travel = Math.Min(distanceToHole, 1 + (_rand.NextDouble() * 7));
            var remain = Math.Max(0, distanceToHole - travel);
            return (travel, remain, lie);
        }

        var greenHitChance = Clamp(profile.GreenHitRate * (2.0 - _roundTroubleFactor), 0.2, 0.95);
        if (_rand.NextDouble() < greenHitChance)
        {
            var leaveFeet = SampleNormal(
                profile.LeaveDistanceMeanFeet,
                Math.Max(1.0, profile.LeaveDistanceStdFeet * _roundTroubleFactor),
                1.0,
                45.0);
            var remain = leaveFeet / 3.0;
            var travel = Math.Max(0.5, distanceToHole - remain);
            return (travel, remain, LieType.Green);
        }

        var missFeet = SampleNormal(
            profile.LeaveDistanceMeanFeet + 10,
            Math.Max(2.0, profile.LeaveDistanceStdFeet * 1.2),
            6.0,
            60.0);
        var remaining = missFeet / 3.0;
        var shot = Math.Max(0.5, distanceToHole - remaining);
        var newLie = _rand.NextDouble() < 0.78 ? LieType.Rough : LieType.Sand;
        return (shot, remaining, newLie);
    }

    private double SampleNormal(double mean, double stdDev, double min, double max)
    {
        var u1 = 1.0 - _rand.NextDouble();
        var u2 = 1.0 - _rand.NextDouble();
        var randStdNormal = Math.Sqrt(-2.0 * Math.Log(u1)) * Math.Sin(2.0 * Math.PI * u2);
        var value = mean + (stdDev * randStdNormal);
        return Clamp(value, min, max);
    }

    private static double Clamp(double value, double min, double max) =>
        Math.Min(max, Math.Max(min, value));

    private int SampleExtraStrokes(double expectedPerHole)
    {
        if (expectedPerHole <= 0) return 0;
        var whole = (int)Math.Floor(expectedPerHole);
        var fractional = expectedPerHole - whole;
        return whole + (_rand.NextDouble() < fractional ? 1 : 0);
    }
    #endregion
}
