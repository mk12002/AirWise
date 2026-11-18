const THINKING_LEVELS = new Set(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']);

/**
 * Reads runtime configuration from environment variables.
 * Accepting `env` as a parameter keeps the function pure and easy to test.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
  const positiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const thinking = (env.AI_THINKING_LEVEL ?? 'LOW').toUpperCase();

  return Object.freeze({
    port: positiveInt(env.PORT, 8080),
    nodeEnv: env.NODE_ENV || 'development',
    geminiApiKey: (env.GEMINI_API_KEY || '').trim(),
    geminiModel: (env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim(),
    // Tried automatically when the primary model is overloaded or slow; "none" disables it.
    geminiFallbackModel:
      (env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.1-flash-lite').trim() === 'none'
        ? ''
        : (env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.1-flash-lite').trim(),
    // Total budget per AI call, split evenly between the primary and fallback attempts.
    aiTimeoutMs: positiveInt(env.AI_TIMEOUT_MS, 40_000),
    // Empty string disables the override (for models without thinking levels).
    aiThinkingLevel: THINKING_LEVELS.has(thinking) ? thinking : '',
    airTimeoutMs: positiveInt(env.AIR_TIMEOUT_MS, 8_000),
    rateLimitPerMinute: positiveInt(env.RATE_LIMIT_PER_MINUTE, 20),
    cacheTtlMs: positiveInt(env.CACHE_TTL_MS, 10 * 60_000),
    // Number of reverse proxies in front of the app (Render / Cloud Run = 1).
    trustProxy: positiveInt(env.TRUST_PROXY, 1),
  });
}
