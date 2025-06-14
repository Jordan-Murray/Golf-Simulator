# Golf Performance Analysis Suite

A comprehensive suite of tools for analyzing and simulating golf performance using real-world data from Arccos Golf.

## Projects

### 1. ArccosScraper
A data collection tool that fetches your golf performance data from Arccos Golf.

**Key Features:**
- Fetches comprehensive shot data
- Retrieves smart distances
- Gets dashboard analysis
- Exports data to CSV and JSON formats

**Setup:**
1. Copy `appsettings.example.json` to `appsettings.json`
2. Add your Arccos API credentials to `appsettings.json`
3. Run the application to collect your data

### 2. Simulation
A performance simulation tool that uses your Arccos data to simulate rounds and analyze performance.

**Key Features:**
- Simulates golf shots based on real data
- Configurable performance parameters
- Performance analysis and statistics
- Integration with Arccos data

**Setup:**
1. Run ArccosScraper first to collect your data
2. Configure simulation parameters in `simulation_settings.json`
3. Run the simulation to analyze performance

## Getting Started

1. **Clone the Repository**
   ```bash
   git clone [repository-url]
   cd GolfSimulation
   ```

2. **Setup ArccosScraper**
   ```bash
   cd ArccosScraper
   cp appsettings.example.json appsettings.json
   # Edit appsettings.json with your credentials
   ```

3. **Collect Your Data**
   ```bash
   dotnet run
   # Select option 1 to fetch all data
   ```

4. **Configure Simulation**
   ```bash
   cd ../Simulation
   # Edit simulation_settings.json as needed
   ```

5. **Run Simulation**
   ```bash
   dotnet run
   ```

## Configuration Files

### ArccosScraper
`appsettings.json`:
```json
{
  "ArccosApi": {
    "UserId": "your-user-id-here",
    "BearerToken": "your-bearer-token-here"
  }
}
```

### Simulation
`simulation_settings.json`:
```json
{
  "AveragePenaltiesPer18Holes": 4.0,        // Average penalties per round
  "MakePercentageInside6Feet": 90.0,        // Short putt success rate
  "DriverDistanceBoostYards": 0,            // Driver distance adjustment
  "OverallAccuracyMultiplier": 1.0          // Overall shot accuracy
}
```

## Output Files

### ArccosScraper Outputs
- `arccos_shot_data_comprehensive.csv`: Detailed shot data
- `smart_distances.json`: Club distance statistics
- `dashboard_analysis.json`: Performance analysis data

### Simulation Outputs
- Performance analysis based on simulated rounds
- Statistical insights into your game
- Potential improvement areas

## Prerequisites

- .NET 8.0 SDK or later
- Arccos Golf account with API access
- Valid Arccos API credentials

## Security Notes

- Never commit `appsettings.json` to version control
- Keep your Arccos API credentials secure
- Use the provided example configuration files as templates 