// Club visual configuration: colors and arc height multipliers

const CLUB_CONFIG = {
    // [color, arcHeightMultiplier, category]
    1:  { color: 0xe53935, arc: 0.12, name: 'Driver' },
    17: { color: 0xf4511e, arc: 0.14, name: '3 Wood' },
    2:  { color: 0xff9800, arc: 0.16, name: '4 Hybrid' },
    3:  { color: 0x1e88e5, arc: 0.20, name: '5 Iron' },
    4:  { color: 0x1e88e5, arc: 0.22, name: '6 Iron' },
    5:  { color: 0x1e88e5, arc: 0.24, name: '7 Iron' },
    6:  { color: 0x1e88e5, arc: 0.26, name: '8 Iron' },
    7:  { color: 0x1e88e5, arc: 0.28, name: '9 Iron' },
    8:  { color: 0xfdd835, arc: 0.30, name: 'PW' },
    10: { color: 0xfdd835, arc: 0.35, name: 'AW' },
    9:  { color: 0xfdd835, arc: 0.38, name: 'GW' },
    11: { color: 0xfdd835, arc: 0.40, name: 'SW' },
    12: { color: 0xfdd835, arc: 0.45, name: 'LW' },
    13: { color: 0xffffff, arc: 0.0,  name: 'Putter' },
    99: { color: 0xff5252, arc: 0.0,  name: 'Penalty' }
};

const DEFAULT_CONFIG = { color: 0xaaaaaa, arc: 0.20, name: '?' };

export function getClubConfig(clubId) {
    return CLUB_CONFIG[clubId] || DEFAULT_CONFIG;
}

export function getClubColor(clubId) {
    return (CLUB_CONFIG[clubId] || DEFAULT_CONFIG).color;
}

export function getArcHeight(clubId, distance) {
    const config = CLUB_CONFIG[clubId] || DEFAULT_CONFIG;
    // Arc height = distance * multiplier (in meters, same units as coordinates)
    return distance * config.arc;
}
