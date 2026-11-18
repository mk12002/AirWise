/*
 * US EPA Air Quality Index helpers (PM2.5 breakpoints from the 2024 NAAQS
 * revision) plus plain-language and kid-friendly guidance per band.
 */

/** [concLow, concHigh, aqiLow, aqiHigh] for 24-h PM2.5 in µg/m³. */
const PM25_BREAKPOINTS = Object.freeze([
  [0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
]);

export const AQI_BANDS = Object.freeze([
  {
    id: 'good',
    max: 50,
    label: 'Good',
    color: '#00a651',
    emoji: '😊',
    kid: 'The air is fresh and clean today. Go play outside!',
    advice: 'Air quality is satisfactory. Enjoy outdoor activities and air out your home.',
  },
  {
    id: 'moderate',
    max: 100,
    label: 'Moderate',
    color: '#d4a600',
    emoji: '🙂',
    kid: 'The air is okay. Play outside, but take breaks if your chest feels funny.',
    advice: 'Unusually sensitive people should reduce prolonged heavy exertion outdoors.',
  },
  {
    id: 'usg',
    max: 150,
    label: 'Unhealthy for sensitive groups',
    color: '#e86f00',
    emoji: '😐',
    kid: 'The air is a bit dusty. Pick calm games and come in early. Tell a grown-up if you cough.',
    advice: 'Children, older adults and people with asthma or heart disease should limit long outdoor exertion.',
  },
  {
    id: 'unhealthy',
    max: 200,
    label: 'Unhealthy',
    color: '#d6231f',
    emoji: '😷',
    kid: 'The air has lots of tiny smoke bits today. Indoor play day! Keep windows shut.',
    advice: 'Everyone should cut outdoor exertion; sensitive groups should stay indoors with clean air.',
  },
  {
    id: 'very_unhealthy',
    max: 300,
    label: 'Very unhealthy',
    color: '#8f3f97',
    emoji: '🤢',
    kid: 'Smog alert! Stay inside where the air cleaner is running. Wear your mask if you must go out.',
    advice: 'Health alert: avoid outdoor activity. Run purifiers, seal windows, wear N95 masks outside.',
  },
  {
    id: 'hazardous',
    max: Infinity,
    label: 'Hazardous',
    color: '#7e0023',
    emoji: '🚨',
    kid: 'Danger air today. Stay in the clean-air room, and only go out with a grown-up and a mask.',
    advice: 'Emergency conditions: stay indoors in a filtered room; postpone travel and exercise.',
  },
]);

/** Immediate protective steps shown when the AQI reaches emergency levels. */
export const EMERGENCY_STEPS = Object.freeze([
  'Pick one room as the clean room: close it up, run the purifier on high, and keep kids and elders there.',
  'Postpone outdoor exercise, school walks and errands. Reschedule to the cleanest window or another day.',
  'Wear a well-fitted N95/FFP2 for any trip outside; cloth and surgical masks do not filter smog.',
  'Do not burn anything indoors: no incense, candles, angithi or frying without the exhaust on.',
  'Watch for wheezing, chest tightness or breathlessness and keep reliever inhalers within reach.',
]);

/**
 * Converts a PM2.5 concentration (µg/m³) to the US AQI (0–500).
 * @param {number} pm25
 */
export function pm25ToAqi(pm25) {
  if (!Number.isFinite(pm25) || pm25 < 0) return 0;
  // EPA truncates concentrations to one decimal place before the lookup.
  const c = Math.floor(pm25 * 10) / 10;
  for (const [cLo, cHi, iLo, iHi] of PM25_BREAKPOINTS) {
    if (c <= cHi) return Math.round(((iHi - iLo) / (cHi - cLo)) * (Math.max(c, cLo) - cLo) + iLo);
  }
  return 500;
}

/** Band (label, colour, advice) for an AQI value. */
export function aqiBand(aqi) {
  return AQI_BANDS.find((band) => aqi <= band.max) ?? AQI_BANDS.at(-1);
}
