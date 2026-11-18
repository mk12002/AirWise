import { Router } from 'express';
import { UpstreamError } from '../services/airData.js';
import {
  chatRequestSchema,
  coordsQuerySchema,
  formatIssues,
  geocodeQuerySchema,
  profileSchema,
  simulateRequestSchema,
} from '../validation.js';

/** Sends a 400 with field-level messages the UI can show next to inputs. */
function badRequest(res, error) {
  return res.status(400).json({ error: 'Invalid request', details: formatIssues(error) });
}

/** Wraps a handler so upstream (air data) outages become a friendly 502. */
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof UpstreamError) {
      return res
        .status(502)
        .json({ error: 'Live air quality data is unavailable right now. Please try again shortly.' });
    }
    next(error);
  }
};

/**
 * JSON API routes.
 * @param {{advisor: ReturnType<import('../services/advisor.js').createAdvisor>, aiEnabled: boolean, model: string,
 *          fallbackModel?: string}} deps
 */
export function createApiRouter({ advisor, aiEnabled, model, fallbackModel = '' }) {
  const router = Router();

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
      const parsed = profileSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, parsed.error);
      res.status(201).json({ plan: await advisor.buildPlan(parsed.data) });
    }),
  );

  router.post(
    '/simulate',
    handle(async (req, res) => {
      const parsed = simulateRequestSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, parsed.error);
      res.json({ impact: await advisor.simulate(parsed.data.profile, parsed.data.actionIds) });
    }),
  );

  router.post(
    '/chat',
    handle(async (req, res) => {
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) return badRequest(res, parsed.error);
      const { profile, message, history } = parsed.data;
      res.json(await advisor.chat(profile, message, history));
    }),
  );

  return router;
}
