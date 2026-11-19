import { aqiBand, pm25ToAqi } from './aqi.js';

const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
/** OpenStreetMap Nominatim, used only to name a device location (Open-Meteo has no reverse geocoding). */
const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
/** Nominatim's usage policy allows at most one request per second. */
const REVERSE_MIN_INTERVAL_MS = 1000;
/** Lookups that would have to queue this long or longer give up (the UI then shows coordinates). */
const REVERSE_MAX_WAIT_MS = 3000;
const REVERSE_USER_AGENT = 'clean-air-assistant/1.0 (open-source demo)';

/** Hours of forecast kept for charts and timing (next 24 h from now). */
export const FORECAST_HOURS = 24;

const round1 = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null);

/** Error raised when the upstream air/weather provider cannot be reached. */
export class UpstreamError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * Client for Open-Meteo's free, key-less air quality, weather and geocoding
 * APIs (CAMS model data). `fetchImpl` is injectable so tests never hit the
 * network; results are cached per ~1 km grid cell.
 * `now` is injectable for testing the reverse-geocoding throttle.
 *
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number,
 *          cache?: {get: (k: string) => any, set: (k: string, v: any) => void}, now?: () => number,
 *          retryDelayMs?: number, sleep?: (ms: number) => Promise<void>}} [options]
 */
export function createAirDataClient({
  fetchImpl = fetch,
  timeoutMs = 8000,
  cache,
  now = Date.now,
  retryDelayMs = 400,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  /** Next time slot a reverse lookup may use (queues requests to one per second). */
  let nextReverseAt = -Infinity;
  /** In-flight requests by cache key: concurrent identical lookups share one upstream call. */
  const inflight = new Map();

  /** Cache-or-fetch with request coalescing. */
  async function cached(key, load) {
    const hit = cache?.get(key);
    if (hit) return hit;
    if (!inflight.has(key)) {
      const promise = load()
        .then((value) => {
          cache?.set(key, value);
          return value;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, promise);
    }
    return inflight.get(key);
  }

  /** One retry after a short pause smooths over brief upstream blips (resets, 5xx). */
  async function getJsonWithRetry(url) {
    try {
      return await getJson(url);
    } catch {
      await sleep(retryDelayMs);
      return getJson(url);
    }
  }

  async function getJson(url, headers = {}) {
    let response;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json', ...headers },
      });
    } catch {
      throw new UpstreamError(`${new URL(url).host} is unreachable`);
    }
    if (!response.ok) throw new UpstreamError(`${new URL(url).host} returned ${response.status}`);
    return response.json();
  }

  return {
    /**
     * Current conditions plus a 24-hour hourly forecast for a coordinate.
     * @param {{lat: number, lon: number}} point
     */
    getConditions({ lat, lon }) {
      return cached(`air:${lat.toFixed(2)},${lon.toFixed(2)}`, async () => {
        const coords = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&timezone=auto&forecast_days=2`;
        // Air quality is essential; weather only adds wind and temperature, so its outage is tolerated.
        const [air, weather] = await Promise.all([
          getJsonWithRetry(
            `${AIR_URL}?${coords}&current=pm2_5,pm10,us_aqi,nitrogen_dioxide,ozone,carbon_monoxide&hourly=pm2_5,us_aqi`,
          ),
          getJsonWithRetry(
            `${WEATHER_URL}?${coords}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&hourly=wind_speed_10m`,
          ).catch(() => null),
        ]);
        return normaliseConditions(air, weather);
      });
    },

    /**
     * City search. Returns at most five matches with coordinates.
     * @param {string} query
     */
    searchPlaces(query) {
      return cached(`geo:${query.toLowerCase()}`, async () => {
        const data = await getJsonWithRetry(
          `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`,
        );
        const places = (Array.isArray(data?.results) ? data.results : []).map((place) => ({
          name: String(place.name ?? '').slice(0, 80),
          region: [place.admin1, place.country].filter(Boolean).join(', ').slice(0, 120),
          countryCode: /^[A-Z]{2}$/.test(place.country_code ?? '') ? place.country_code : undefined,
          lat: Number(place.latitude),
          lon: Number(place.longitude),
        }));
        return places.filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon));
      });
    },

    /**
     * Names a coordinate at city level ("Gurugram, Haryana, India"). Coordinates are
     * rounded to ~1 km before leaving the server. Returns null (never throws) when the
     * place can't be named, so callers can fall back to showing coordinates.
     * @param {{lat: number, lon: number}} point
     */
    async reversePlace({ lat, lon }) {
      const key = `rev:${lat.toFixed(2)},${lon.toFixed(2)}`;
      const shared = cache?.get(key) || inflight.has(key);
      const wait = shared ? 0 : Math.max(0, nextReverseAt - now());
      if (wait >= REVERSE_MAX_WAIT_MS) return null;
      try {
        return await cached(key, async () => {
          nextReverseAt = now() + wait + REVERSE_MIN_INTERVAL_MS;
          if (wait > 0) await sleep(wait);
          const data = await getJson(
            `${REVERSE_URL}?format=jsonv2&lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&zoom=10&accept-language=en`,
            { 'user-agent': REVERSE_USER_AGENT },
          );
          const place = placeFromAddress(data?.address);
          if (!place) throw new UpstreamError('Location could not be named');
          return place;
        });
      } catch {
        return null;
      }
    },
  };
}

/** City-level name and region from a Nominatim address, or null. */
function placeFromAddress(address) {
  if (!address || typeof address !== 'object') return null;
  const name = [
    address.city,
    address.town,
    address.village,
    address.suburb,
    address.county,
    address.state_district,
  ].find((part) => typeof part === 'string' && part.trim());
  if (!name) return null;
  const code = String(address.country_code ?? '').toUpperCase();
  return {
    name: name.trim().slice(0, 80),
    region: [address.state, address.country]
      .filter((part) => typeof part === 'string' && part && part !== name)
      .join(', ')
      .slice(0, 120),
    countryCode: /^[A-Z]{2}$/.test(code) ? code : undefined,
  };
}

/** Number or NaN; unlike `Number()`, missing values never become 0. */
const num = (value) => (value === null || value === undefined || value === '' ? Number.NaN : Number(value));

/** Aligned hourly series starting at the current local hour. */
function extractHourly(air, weather) {
  const nowHour = String(air.current.time ?? '').slice(0, 13);
  const times = air.hourly?.time ?? [];
  const wind = new Map((weather?.hourly?.time ?? []).map((t, i) => [t, weather.hourly.wind_speed_10m?.[i]]));
  const start = Math.max(
    0,
    times.findIndex((t) => t.slice(0, 13) >= nowHour),
  );

  const hourly = [];
  for (let i = start; i < times.length && hourly.length < FORECAST_HOURS; i += 1) {
    const pm25 = num(air.hourly.pm2_5?.[i]);
    if (!Number.isFinite(pm25)) continue;
    const reported = num(air.hourly.us_aqi?.[i]);
    hourly.push({
      time: times[i],
      hour: Number(times[i].slice(11, 13)),
      pm25: round1(pm25),
      aqi: Number.isFinite(reported) ? Math.round(reported) : pm25ToAqi(pm25),
      windKmh: round1(num(wind.get(times[i]))),
    });
  }
  return hourly;
}

/** Current pollutant and weather readings (null when the provider omits one). */
function currentReadings(air, weather) {
  const c = air.current;
  const w = weather?.current ?? {};
  const reportedAqi = num(c.us_aqi);
  const aqi = Number.isFinite(reportedAqi) ? Math.round(reportedAqi) : pm25ToAqi(num(c.pm2_5));
  return {
    aqi,
    band: aqiBand(aqi).id,
    pm25: round1(num(c.pm2_5)),
    pm10: round1(num(c.pm10)),
    no2: round1(num(c.nitrogen_dioxide)),
    o3: round1(num(c.ozone)),
    co: round1(num(c.carbon_monoxide)),
    temperatureC: round1(num(w.temperature_2m)),
    humidity: round1(num(w.relative_humidity_2m)),
    windKmh: round1(num(w.wind_speed_10m)),
  };
}

/**
 * Converts the two raw Open-Meteo payloads into one compact, validated shape.
 * Forecast hours start at the current local hour.
 */
export function normaliseConditions(air, weather) {
  if (!Number.isFinite(num(air?.current?.pm2_5))) {
    throw new UpstreamError('Air quality data is unavailable for this location');
  }
  const hourly = extractHourly(air, weather);
  if (hourly.length === 0) throw new UpstreamError('Air quality forecast is unavailable for this location');

  return {
    source: 'open-meteo',
    timezone: String(air.timezone ?? 'UTC'),
    observedAt: String(air.current.time),
    current: currentReadings(air, weather),
    avgPm25: round1(hourly.reduce((sum, h) => sum + h.pm25, 0) / hourly.length),
    hourly,
  };
}
