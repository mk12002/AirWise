import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';
import { createLogger } from './src/logger.js';
import { createAdvisor } from './src/services/advisor.js';
import { createAirDataClient } from './src/services/airData.js';
import { TtlCache } from './src/services/cache.js';
import { createGeminiClient } from './src/services/gemini.js';

const config = loadConfig();
const logger = createLogger();

const ai = config.geminiApiKey
  ? createGeminiClient({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      fallbackModel: config.geminiFallbackModel,
      timeoutMs: config.aiTimeoutMs,
      thinkingLevel: config.aiThinkingLevel,
    })
  : null;

if (!ai) {
  logger.warn('GEMINI_API_KEY is not set; running with template explanations only');
}

const airData = createAirDataClient({
  timeoutMs: config.airTimeoutMs,
  cache: new TtlCache({ ttlMs: config.cacheTtlMs, maxEntries: 500 }),
});
const advisor = createAdvisor({ airData, ai, logger, cache: new TtlCache({ ttlMs: config.cacheTtlMs }) });
const app = createApp({ advisor, config, logger });

const server = app.listen(config.port, () => {
  logger.info('server started', { url: `http://localhost:${config.port}`, ai: ai ? config.geminiModel : 'off' });
});

// Graceful shutdown for container platforms (Cloud Run / Render send SIGTERM).
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
