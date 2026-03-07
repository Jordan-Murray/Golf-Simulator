using ArccosScraper.Models;
using System.Net;
using System.Text.Json;

namespace ArccosScraper.Services;

public class ArccosDataService : IArccosDataService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string _userId;

    // We use dependency injection to get the HttpClientFactory and the userId
    public ArccosDataService(IHttpClientFactory httpClientFactory, string userId)
    {
        _httpClientFactory = httpClientFactory;
        _userId = userId;
    }

    public async Task<List<Round>> GetAllRoundsAsync()
    {
        var url = $"/v2/users/{_userId}/rounds?limit=30&offSet=0&roundType=flagship";

        var client = _httpClientFactory.CreateClient("ArccosApiClient");
        var response = await client.GetAsync(url);

        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        var apiResponse = JsonSerializer.Deserialize<RoundsApiResponse>(content);

        return apiResponse?.Rounds ?? [];
    }

    public async Task<RoundDetail?> GetRoundDetailAsync(long roundId)
    {
        var url = $"/users/{_userId}/rounds/{roundId}";

        var client = _httpClientFactory.CreateClient("ArccosApiClient");
        var response = await client.GetAsync(url);

        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<RoundDetail>(content);
    }

    public async Task<List<SmartClubData>> GetSmartDistancesAsync()
    {
        var url = $"/v4/clubs/user/{_userId}/smart-distances?numberOfShots=100&units=IMPERIAL";
        var client = _httpClientFactory.CreateClient("ArccosApiClient");
        var response = await client.GetAsync(url);
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        var apiResponse = JsonSerializer.Deserialize<SmartDistancesApiResponse>(content);

        return apiResponse?.Clubs ?? [];
    }

    public async Task<DashboardAnalysis?> GetDashboardAnalysisAsync()
    {
        var url = $"/sga/getDashboardAnalysis/{_userId}?goalHcp=-18&noOfRounds=20";
        var client = _httpClientFactory.CreateClient("ArccosApiClient");
        var response = await client.GetAsync(url);

        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            return null;

        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<DashboardAnalysis>(content);
    }
}
