/** Shared fixtures for the test suite. Nothing here touches the network. */

export const silentLogger = { info() {}, warn() {}, error() {} };

/** A valid household profile (Delhi family), with optional deep-ish overrides. */
export function validProfile(overrides = {}) {
  const base = {
    location: { name: 'New Delhi', region: 'Delhi, India', countryCode: 'IN', lat: 28.61, lon: 77.21 },
    household: { adults: 2, children: 1, elderly: 1, respiratory: true, pregnant: false },
    commute: { mode: 'car_petrol', distanceKm: 12, daysPerWeek: 5 },
    home: {
      areaSqm: 90,
      ventilation: 'natural',
      cookingFuel: 'lpg',
      heating: 'electric',
      purifier: 'none',
      purifierCadr: 250,
      incense: true,
      indoorSmoking: false,
    },
    lifestyle: { outdoorExercise: 'morning', budget: 'medium', notes: '' },
  };
  for (const [key, value] of Object.entries(overrides)) {
    base[key] = typeof value === 'object' && !Array.isArray(value) ? { ...base[key], ...value } : value;
  }
  return base;
}

/**
 * Raw Open-Meteo payloads for 48 hours starting 2026-11-18T00:00, with a
 * typical winter-smog shape: dirty night/morning, clean mid-afternoon.
 * @param {{pm25At?: (hour: number) => number, currentHour?: number}} [options]
 */
export function openMeteoPayloads({ pm25At = smogCurve, currentHour = 10 } = {}) {
  const time = [];
  const pm25 = [];
  const aqi = [];
  const wind = [];
  for (let i = 0; i < 48; i += 1) {
    const day = 18 + Math.floor(i / 24);
    const hour = i % 24;
    time.push(`2026-11-${day}T${String(hour).padStart(2, '0')}:00`);
    pm25.push(pm25At(hour));
    aqi.push(160);
    wind.push(hour >= 12 && hour < 17 ? 9 : 3);
  }
  const now = `2026-11-18T${String(currentHour).padStart(2, '0')}:30`;
  return {
    air: {
      timezone: 'Asia/Kolkata',
      current: { time: now, pm2_5: 80, pm10: 120, us_aqi: 165, nitrogen_dioxide: 50, ozone: 40, carbon_monoxide: 900 },
      hourly: { time, pm2_5: pm25, us_aqi: aqi },
    },
    weather: {
      current: { time: now, temperature_2m: 14, relative_humidity_2m: 70, wind_speed_10m: 4 },
      hourly: { time, wind_speed_10m: wind },
    },
  };
}

/** Night-time inversion peak (~110) and an afternoon dip (~40). */
export function smogCurve(hour) {
  if (hour >= 13 && hour < 17) return 40;
  if (hour >= 6 && hour < 10) return 110;
  return 80;
}

/** fetch() stand-in that serves the given payloads by URL host. */
export function fakeFetch(payloads = openMeteoPayloads(), { status = 200 } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    const host = new URL(url).host;
    const body = { air: payloads.air, geocoding: payloads.geo }[host.split(/[-.]/)[0]] ?? payloads.weather;
    return { ok: status < 400, status, json: async () => structuredClone(body) };
  };
  return Object.assign(impl, { calls });
}

/** Air-data client stub that returns fixed conditions. */
export async function fixedAirData() {
  const { createAirDataClient } = await import('../src/services/airData.js');
  return createAirDataClient({ fetchImpl: fakeFetch() });
}

/** Fake Gemini client that answers by inspecting the request schema. */
export function fakeAi(handler) {
  const calls = [];
  return {
    model: 'fake-gemini',
    calls,
    async generateJson(request) {
      calls.push(request);
      const result = await handler(request);
      if (result instanceof Error) throw result;
      return structuredClone(result);
    },
  };
}

/** Well-formed AI responses for the two plan calls and chat. */
export function aiResponder(request) {
  if (request.schema.properties.actions) {
    const ids = request.schema.properties.actions.items.properties.id.enum;
    return {
      actions: [
        ...ids.map((id, i) => ({
          id,
          priority: i === 0 ? 'high' : 'bogus',
          why: `AI says ${id} matters.`,
          tip: 'Tip',
        })),
        { id: 'not-a-real-id', priority: 'high', why: 'Should be ignored' },
        { id: ids[0], priority: 'low', why: '' },
      ],
    };
  }
  if (request.schema.properties.reply) {
    return { reply: 'Go out between 14:00 and 16:00.', followUps: ['What about masks?', 42] };
  }
  return {
    headline: 'Smog peaks at breakfast; play after lunch',
    summary: 'Your biggest wins are a bedroom air cleaner and stopping incense.',
    kidAlert: 'Indoor games this morning, park after lunch!',
    checklist: [
      { who: 'kids', time: '14:00–16:00', task: 'Play outside' },
      { who: 'everyone', time: '07:00', task: 'Windows shut' },
      { who: 'martians', time: '21:00', task: 'Purifier on high' },
      { who: 'adults', time: '', task: 'Dropped: no time' },
    ],
    community: [
      { kind: 'carpool', title: 'School carpool', detail: 'Share the run with 2 families.' },
      { kind: 'weird', title: 'Filter bulk-buy', detail: 'Order together.' },
    ],
    healthNotes: [{ group: 'children', note: 'Keep the inhaler handy.' }],
  };
}
