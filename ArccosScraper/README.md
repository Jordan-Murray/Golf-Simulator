# Arccos Golf Data Scraper

A .NET application for extracting and analyzing golf data from the Arccos Golf API. This tool allows you to fetch comprehensive shot data, smart distances, and dashboard analysis from your Arccos account.

## Features

- Fetch comprehensive shot data with detailed metrics
- Retrieve smart distances for your clubs
- Get dashboard analysis statistics
- Export data to CSV and JSON formats
- Interactive console menu for easy data access

## Project Structure

```
ArccosScraper/
├── Configuration/
│   └── AppSettings.cs      # Configuration management
├── Models/
│   └── ComprehensiveShotRecord.cs  # Data models
├── Services/
│   ├── ArccosDataService.cs    # API interaction
│   └── CsvWriterService.cs     # CSV export functionality
├── Program.cs              # Application entry point
├── appsettings.json       # Configuration file (git-ignored)
└── appsettings.example.json # Example configuration template
```

## Prerequisites

- .NET 8.0 SDK or later
- Arccos Golf account with API access
- Valid Arccos API credentials

## Setup

1. Clone the repository
2. Copy `appsettings.example.json` to `appsettings.json`
3. Update `appsettings.json` with your Arccos API credentials:
   ```json
   {
     "ArccosApi": {
       "UserId": "your-user-id-here",
       "BearerToken": "your-bearer-token-here"
     }
   }
   ```

## Running the Application

```bash
dotnet run
```

The application provides an interactive menu with the following options:
1. Fetch All Data (Shots, Distances, Analysis)
2. Fetch Shot Data Only
3. Fetch Smart Distances Only
4. Fetch Dashboard Analysis Only
5. Exit

## Output Files

The application generates the following output files:
- `arccos_shot_data_comprehensive.csv`: Detailed shot data
- `smart_distances.json`: Club distance statistics
- `dashboard_analysis.json`: Performance analysis data

## Security Notes

- The `appsettings.json` file containing sensitive API credentials is git-ignored
- Never commit your actual API credentials to version control
- Use the provided `appsettings.example.json` as a template

## Architecture

The application follows clean architecture principles:
- Separation of concerns with distinct service layers
- Configuration management through dependency injection
- Interface-based design for better testability
- SOLID principles implementation

## Error Handling

The application includes robust error handling:
- Configuration validation
- API response validation
- Graceful error reporting
- Rate limiting protection (250ms delay between API calls)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

[Add your license information here] 