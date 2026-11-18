import { EXERCISE_HOURS } from '../constants.js';

/** Waking hours (local) considered for outdoor errands and exercise. */
const DAY_START = 6;
const DAY_END = 21;

const avg = (items) => items.reduce((sum, h) => sum + h.pm25, 0) / items.length;
const round1 = (value) => Math.round(value * 10) / 10;

/** "07:00" style label for an hourly entry, extended by `length` hours. */
function windowOf(slice) {
  const first = slice[0];
  const endHour = (slice.at(-1).hour + 1) % 24;
  return {
    start: first.time,
    label: `${String(first.hour).padStart(2, '0')}:00–${String(endHour).padStart(2, '0')}:00`,
    pm25: round1(avg(slice)),
    aqi: Math.round(slice.reduce((sum, h) => sum + h.aqi, 0) / slice.length),
  };
}

/**
 * Finds the cleanest and dirtiest consecutive daytime windows in the forecast.
 * Winter smog is usually worst at night and early morning (temperature
 * inversions trap pollution) and lifts in the afternoon, but the live
 * forecast decides.
 *
 * @param {Array<{time: string, hour: number, pm25: number, aqi: number}>} hourly
 * @param {number} [length] window length in hours
 */
export function findWindows(hourly, length = 2) {
  const candidates = [];
  for (let i = 0; i + length <= hourly.length; i += 1) {
    const slice = hourly.slice(i, i + length);
    const contiguous = slice.every((h, j) => j === 0 || (slice[j - 1].hour + 1) % 24 === h.hour);
    const daytime = slice.every((h) => h.hour >= DAY_START && h.hour < DAY_END);
    if (contiguous && daytime) candidates.push(windowOf(slice));
  }
  if (candidates.length === 0) return { best: null, worst: null, spreadPct: 0 };

  const sorted = [...candidates].sort((a, b) => a.pm25 - b.pm25);
  const best = sorted[0];
  const worst = sorted.at(-1);
  const spreadPct = worst.pm25 > 0 ? Math.round(((worst.pm25 - best.pm25) / worst.pm25) * 100) : 0;
  return { best, worst, spreadPct };
}

/**
 * Mean PM2.5 during the user's habitual exercise slot (falls back to the
 * daytime mean for "flexible", and to the whole-forecast mean otherwise).
 *
 * @param {Array<{hour: number, pm25: number}>} hourly
 * @param {string} preference one of EXERCISE_TIMES
 */
export function pm25AtPreference(hourly, preference) {
  const range = EXERCISE_HOURS[preference];
  const inRange = range
    ? hourly.filter((h) => h.hour >= range[0] && h.hour < range[1])
    : hourly.filter((h) => h.hour >= DAY_START && h.hour < DAY_END);
  const pool = inRange.length > 0 ? inRange : hourly;
  return round1(avg(pool));
}
