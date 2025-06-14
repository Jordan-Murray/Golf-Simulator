# Golf Simulation

A .NET application for simulating golf shots and analyzing performance based on real-world data from Arccos Golf.

## Project Structure

```
Simulation/
├── Models/          # Data models and entities
├── Services/        # Business logic and simulation services
├── Program.cs       # Application entry point
└── simulation_settings.json  # Configuration file
```

## Features

- Golf shot simulation based on real-world data
- Performance analysis and statistics
- Configurable simulation parameters
- Integration with Arccos Golf data

## Prerequisites

- .NET 8.0 SDK or later
- Access to Arccos Golf shot data (via ArccosScraper)

## Setup

1. Ensure you have the ArccosScraper project set up and configured
2. Run the ArccosScraper to generate shot data
3. Configure simulation parameters in `simulation_settings.json`

## Running the Application

```bash
dotnet run
```

## Configuration

The `simulation_settings.json` file contains the following simulation parameters:

```json
{
  "AveragePenaltiesPer18Holes": 4.0,        // Average number of penalty strokes per 18 holes
  "MakePercentageInside6Feet": 90.0,        // Percentage of putts made from inside 6 feet
  "DriverDistanceBoostYards": 0,            // Additional yards to add to driver distance
  "OverallAccuracyMultiplier": 1.0          // Multiplier for overall shot accuracy
}
```

### Parameter Descriptions

- `AveragePenaltiesPer18Holes`: Sets the expected number of penalty strokes per round
- `MakePercentageInside6Feet`: Defines the success rate for short putts
- `DriverDistanceBoostYards`: Allows for distance adjustments to driver shots
- `OverallAccuracyMultiplier`: Adjusts the overall accuracy of all shots (1.0 = normal, >1.0 = more accurate, <1.0 = less accurate)

## Architecture

The application follows clean architecture principles:
- Separation of concerns with distinct service layers
- Model-based data representation
- Service-oriented design for simulation logic
- SOLID principles implementation

## Integration with Arccos Data

This simulation project works in conjunction with the ArccosScraper project:
1. Use ArccosScraper to fetch real-world shot data
2. Import the generated data into the simulation
3. Run simulations based on actual performance metrics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

[Add your license information here] 