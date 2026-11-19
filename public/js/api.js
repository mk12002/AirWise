/** Error carrying the server's message and optional field-level details. */
export class ApiError extends Error {
  constructor(message, { status = 0, details = [], code = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

const TIMEOUT_MS = 60_000;

/**
 * @param {string} path
 * @param {{method?: string, body?: unknown}} [options]
 */
async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError';
    throw new ApiError(
      timedOut
        ? 'AirWise took too long to respond. Please try again.'
        : 'Network error. Check your connection and try again.',
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || `Request failed (${response.status})`, {
      status: response.status,
      details: data.details ?? [],
      code: typeof data.code === 'string' ? data.code : '',
    });
  }
  return data;
}

export const getHealth = () => request('/api/health');

/** @param {string} query */
export const searchPlaces = (query) => request(`/api/geocode?q=${encodeURIComponent(query)}`);

/** City-level name for a coordinate; resolves to null when it can't be named. */
export const reversePlace = (lat, lon) =>
  request(`/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`)
    .then((data) => data.place ?? null)
    .catch(() => null);

export const createPlan = (profile, liveAir) =>
  request('/api/plan', { method: 'POST', body: liveAir ? { ...profile, liveAir } : profile });

/** What-if impact for the actions the family has chosen (pure model maths, no AI). */
export const simulateImpact = (profile, actionIds, liveAir) =>
  request('/api/simulate', { method: 'POST', body: { profile, actionIds, ...(liveAir && { liveAir }) } });

export const askAdvisor = (profile, message, history, liveAir) =>
  request('/api/chat', { method: 'POST', body: { profile, message, history, ...(liveAir && { liveAir }) } });

const OPEN_METEO_AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OPEN_METEO_WEATHER = 'https://api.open-meteo.com/v1/forecast';

/**
 * Fetches Open-Meteo's open air-quality and weather data straight from the browser.
 * Used only when the server reports AIR_UNAVAILABLE (e.g. its shared cloud IP is
 * rate-limited); the server still validates and models the data. Weather is optional.
 * @param {{lat: number, lon: number}} point
 */
export async function fetchLiveAir({ lat, lon }) {
  const coords = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&timezone=auto&forecast_days=2`;
  const getJson = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  try {
    const [air, weather] = await Promise.all([
      getJson(
        `${OPEN_METEO_AIR}?${coords}&current=pm2_5,pm10,us_aqi,nitrogen_dioxide,ozone,carbon_monoxide&hourly=pm2_5,us_aqi`,
      ),
      getJson(
        `${OPEN_METEO_WEATHER}?${coords}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&hourly=wind_speed_10m`,
      ).catch(() => null),
    ]);
    return { air: pickAir(air), weather: weather && pickWeather(weather) };
  } catch {
    throw new ApiError('Live air quality data is unavailable right now. Please try again shortly.', { status: 502 });
  }
}

/** Keeps only the parts the server reads, so the request stays small. */
const pickAir = (air) => ({ timezone: air.timezone, current: air.current, hourly: air.hourly });
const pickWeather = (weather) => ({ current: weather.current, hourly: weather.hourly });
