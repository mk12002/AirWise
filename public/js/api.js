/** Error carrying the server's message and optional field-level details. */
export class ApiError extends Error {
  constructor(message, { status = 0, details = [] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
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
    });
  }
  return data;
}

export const getHealth = () => request('/api/health');

/** @param {string} query */
export const searchPlaces = (query) => request(`/api/geocode?q=${encodeURIComponent(query)}`);

export const createPlan = (profile) => request('/api/plan', { method: 'POST', body: profile });

/** What-if impact for the actions the family has chosen (pure model maths, no AI). */
export const simulateImpact = (profile, actionIds) =>
  request('/api/simulate', { method: 'POST', body: { profile, actionIds } });

export const askAdvisor = (profile, message, history) =>
  request('/api/chat', { method: 'POST', body: { profile, message, history } });
