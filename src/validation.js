import { z } from 'zod';
import {
  BUDGET_TIERS,
  COMMUTE_MODES,
  COOKING_FUELS,
  EXERCISE_TIMES,
  HEATING,
  PURIFIER_OPTIONS,
  VENTILATION,
} from './constants.js';

// Strip ASCII control characters (keeps \n and \t) from any user text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Trimmed, control-character-free string with a length cap. */
export const cleanText = (max, min = 0) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL_CHARS, '').trim())
    .pipe(z.string().min(min).max(max));

const keysOf = (obj) => /** @type {[string, ...string[]]} */ (Object.keys(obj));
const int = (min, max) => z.number().int().min(min).max(max);

export const locationSchema = z.strictObject({
  name: cleanText(80, 1),
  region: cleanText(120).optional(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const profileSchema = z.strictObject({
  location: locationSchema,
  household: z.strictObject({
    adults: int(1, 12),
    children: int(0, 10),
    elderly: int(0, 10),
    respiratory: z.boolean().default(false),
    pregnant: z.boolean().default(false),
  }),
  commute: z.strictObject({
    mode: z.enum(keysOf(COMMUTE_MODES)),
    distanceKm: z.number().min(0).max(150),
    daysPerWeek: int(0, 7),
  }),
  home: z.strictObject({
    areaSqm: z.number().min(15).max(1000),
    ventilation: z.enum(keysOf(VENTILATION)),
    cookingFuel: z.enum(keysOf(COOKING_FUELS)),
    heating: z.enum(keysOf(HEATING)),
    purifier: z.enum(PURIFIER_OPTIONS),
    purifierCadr: z.number().min(50).max(1000).default(250),
    incense: z.boolean().default(false),
    indoorSmoking: z.boolean().default(false),
  }),
  lifestyle: z.strictObject({
    outdoorExercise: z.enum(EXERCISE_TIMES),
    budget: z.enum(BUDGET_TIERS),
    notes: cleanText(400).default(''),
  }),
});

export const coordsQuerySchema = z.strictObject({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

export const geocodeQuerySchema = z.strictObject({ q: cleanText(80, 2) });

export const chatRequestSchema = z.strictObject({
  profile: profileSchema,
  message: cleanText(600, 1),
  history: z
    .array(z.strictObject({ role: z.enum(['user', 'assistant']), text: cleanText(2000, 1) }))
    .max(12)
    .default([]),
});

/**
 * Flattens Zod issues into `{field, message}` pairs for the UI.
 * @param {z.ZodError} error
 */
export function formatIssues(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}
