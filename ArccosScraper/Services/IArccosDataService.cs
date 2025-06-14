using ArccosScraper.Models;

namespace ArccosScraper.Services;

public interface IArccosDataService
{
    Task<List<Round>> GetAllRoundsAsync();
    Task<RoundDetail?> GetRoundDetailAsync(long roundId);
    Task<List<SmartClubData>> GetSmartDistancesAsync();
    Task<DashboardAnalysis?> GetDashboardAnalysisAsync();
}
