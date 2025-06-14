using Microsoft.Extensions.Configuration;

namespace ArccosScraper.Configuration;

public class AppSettings
{
    public string UserId { get; set; }
    public string BearerToken { get; set; }

    public static AppSettings Load()
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: false)
            .Build();

        return new AppSettings
        {
            UserId = configuration["ArccosApi:UserId"] 
                ?? throw new InvalidOperationException("ArccosApi:UserId is not set in appsettings.json"),
            BearerToken = configuration["ArccosApi:BearerToken"] 
                ?? throw new InvalidOperationException("ArccosApi:BearerToken is not set in appsettings.json")
        };
    }
} 