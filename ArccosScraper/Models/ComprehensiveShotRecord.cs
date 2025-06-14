namespace ArccosScraper.Models;

public class ComprehensiveShotRecord
{
    // Round-level data
    public long RoundId { get; set; }
    public string RoundUUID { get; set; } = string.Empty;
    public string CourseName { get; set; } = string.Empty;
    public long CourseId { get; set; }
    public DateTime RoundStartTime { get; set; }
    public int RoundPar { get; set; }
    public int RoundOverUnder { get; set; }
    public double? DriveHcp { get; set; }
    public double? ApproachHcp { get; set; }
    public double? ChipHcp { get; set; }
    public double? SandHcp { get; set; }
    public double? PuttHcp { get; set; }

    // Hole-level data
    public int HoleNumber { get; set; }
    public int HolePutts { get; set; }
    public bool HoleIsGir { get; set; }
    public bool HoleIsFairway { get; set; }
    public double? PinLat { get; set; }
    public double? PinLong { get; set; }

    // Shot-level data
    public int ShotNumberInHole { get; set; }
    public string ShotUUID { get; set; } = string.Empty;
    public int ClubId { get; set; }
    public DateTime ShotTime { get; set; }
    public double Distance { get; set; }
    public bool IsHalfSwing { get; set; }
    public int Penalties { get; set; }
    public double? StartLat { get; set; }
    public double? StartLong { get; set; }
    public double? EndLat { get; set; }
    public double? EndLong { get; set; }
    public double? StartAltitude { get; set; }
    public double? EndAltitude { get; set; }
}