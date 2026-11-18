import { GoogleGenAI } from '@google/genai';

/** HTTP statuses worth another attempt (rate-limit spikes, overload). */
const RETRYABLE_STATUSES = new Set([429, 500, 503]);
const RETRY_DELAY_MS = 500;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for transient Gemini failures such as "503 model overloaded" or an attempt timing out. */
export function isRetryable(error) {
  const status = Number(error?.status ?? error?.code);
  return (
    RETRYABLE_STATUSES.has(status) ||
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    /\b(UNAVAILABLE|RESOURCE_EXHAUSTED)\b/.test(String(error?.message))
  );
}

/**
 * Thin wrapper around the Gemini API that returns parsed JSON.
 * The advisor depends only on the `{ model, generateJson }` interface, so
 * tests can inject a fake client without touching the network.
 *
 * Resilience: each attempt gets an equal slice of `timeoutMs`, and a
 * transient failure (overload, quota spike, slow response) is retried on
 * `fallbackModel` when one is configured, so a busy model degrades to a
 * different model before it degrades to templates.
 *
 * @param {{apiKey: string, model: string, fallbackModel?: string, timeoutMs: number, thinkingLevel?: string,
 *          maxAttempts?: number, sleep?: (ms: number) => Promise<void>, client?: object}} options
 *   `thinkingLevel` (MINIMAL | LOW | MEDIUM | HIGH) trades reasoning depth for
 *   latency. `client` and `sleep` are injectable for tests.
 */
export function createGeminiClient({
  apiKey,
  model,
  fallbackModel = '',
  timeoutMs,
  thinkingLevel,
  maxAttempts = 2,
  sleep = wait,
  client = new GoogleGenAI({ apiKey }),
}) {
  const models = [model, fallbackModel].filter(Boolean);
  const attemptMs = Math.max(1000, Math.floor(timeoutMs / maxAttempts));

  return {
    model,
    fallbackModel: fallbackModel || null,
    /**
     * @param {{system: string, prompt: string, schema: object, temperature?: number}} request
     * @returns {Promise<unknown>} parsed JSON response
     */
    async generateJson({ system, prompt, schema, temperature = 0.7 }) {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const response = await client.models.generateContent({
            model: models[Math.min(attempt, models.length) - 1],
            contents: prompt,
            config: {
              systemInstruction: system,
              responseMimeType: 'application/json',
              responseJsonSchema: schema,
              temperature,
              maxOutputTokens: 6144,
              ...(thinkingLevel && { thinkingConfig: { thinkingLevel } }),
              abortSignal: AbortSignal.timeout(attemptMs),
            },
          });
          const text = response.text;
          if (!text) throw new Error('Gemini returned an empty response');
          return JSON.parse(text);
        } catch (error) {
          if (attempt >= maxAttempts || !isRetryable(error)) throw error;
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    },
  };
}
