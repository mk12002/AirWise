import { Router } from 'express';
import { silentLogger } from '../logger.js';
import { UpstreamError } from '../services/airData.js';
import {
  chatRequestSchema,
  coordsQuerySchema,
  formatIssues,
  geocodeQuerySchema,
  planRequestSchema,
  simulateRequestSchema,
} from '../validation.js';

/** Sends a 400 with field-level messages the UI can show next to inputs. */
function badRequest(res, error) {
  return res.status(400).json({ error: 'Invalid request', details: formatIssues(error) });
}

/**
 * Wraps a handler so upstream (air data) outages become a friendly 502. The
 * `AIR_UNAVAILABLE` code tells the browser it may fetch the open data itself.
 * @param {{warn: Function}} logger
 */
const handler = (logger) => (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof UpstreamError) {
      // The message names the host and status (e.g. "air-quality-api.open-meteo.com returned 429"), never user data.
      logger.warn('upstream air data unavailable', { path: req.path, reason: error.message });
      return res.status(502).json({
        error: 'Live air quality data is unavailable right now. Please try again shortly.',
        code: 'AIR_UNAVAILABLE',
      });
    }
    next(error);
  }
};

/**
 * JSON API routes.
 * @param {{advisor: ReturnType<import('../services/advisor.js').createAdvisor>, aiEnabled: boolean, model: string,
 *          fallbackModel?: string, logger?: typeof silentLogger}} deps
 */
export function createApiRouter({ advisor, aiEnabled, model, fallbackModel = '', logger = silentLogger }) {
  const router = Router();
  const handle = handler(logger);

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      ai: aiEnabled,
      model: aiEnabled ? model : null,
      fallbackModel: aiEnabled && fallbackModel ? fallbackModel : null,
    });
  });

  router.get(
    '/geocode',
    handle(async (req, res) => {
      const parsed = geocodeQuerySchema.safeParse(req.query);
      if (!parsed.success) return badRequest(res, parsed.error);
      res.json({ places: await advisor.searchPlaces(parsed.data.q) });
    }),
  );

  router.get(
    '/reverse-geocode',
    handle(async (req, res) => {
      const parsed = coordsQuerySchema.safeParse(req.query);
      if (!parsed.success) return badRequest(res, parsed.error);
      res.json({ place: await advisor.reversePlace(parsed.data) });
    }),
  );

  router.get(
    '/air',
    handle(async (req, res) => {
      const parsed = coordsQuerySchema.safeParse(req.query);
      if (!parsed.success) return badRequest(res, parsed.error);
      res.json({ conditions: await advisor.getConditions(parsed.data) });
    }),
  );

  router.post(
    '/plan',
    handle(async (req, res) => {
      const parsed = planRequestSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, parsed.error);
      const { liveAir, ...profile } = parsed.data;
      res.status(201).json({ plan: await advisor.buildPlan(profile, { liveAir }) });
    }),
  );

  router.post(
    '/simulate',
    handle(async (req, res) => {
      const parsed = simulateRequestSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, parsed.error);
      const { profile, actionIds, liveAir } = parsed.data;
      res.json({ impact: await advisor.simulate(profile, actionIds, { liveAir }) });
    }),
  );

  router.post(
    '/chat',
    handle(async (req, res) => {
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, parsed.error);
      const { profile, message, history, liveAir } = parsed.data;
      res.json(await advisor.chat(profile, message, history, { liveAir }));
    }),
  );

  return router;
}
