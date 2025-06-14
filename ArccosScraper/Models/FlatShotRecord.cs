namespace ArccosScraper.Models;

public class FlatShotRecord
{
    public long RoundId { get; set; }
    public string CourseName { get; set; } = string.Empty;
    public int HoleId { get; set; }
    public int ShotId { get; set; }
    public int ClubId { get; set; }
    public double Distance { get; set; }
    public DateTime ShotTime { get; set; }
    public int Penalties { get; set; }
}