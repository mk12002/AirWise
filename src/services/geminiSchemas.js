import { z } from 'zod';

/*
 * JSON Schemas sent to Gemini (structured output) and the Zod parsers that
 * re-validate whatever comes back. The parsers are forgiving: over-long text
 * is truncated, unknown enum values are dropped, and anything malformed falls
 * back to template content instead of failing the request.
 */

export const CHECKLIST_WHO = Object.freeze(['everyone', 'adults', 'kids', 'elders', 'commuter']);
export const COMMUNITY_KINDS = Object.freeze(['carpool', 'initiative', 'alert', 'advocacy']);
export const HEALTH_GROUPS = Object.freeze(['children', 'elderly', 'respiratory', 'pregnant', 'adults']);
export const PRIORITIES = Object.freeze(['high', 'medium', 'low']);

const str = (maxLength) => ({ type: 'string', maxLength });

/**
 * Part 1 of the plan: personalised explanation and priority per action.
 * @param {string[]} actionIds candidate ids for this request (used as an enum).
 */
export function actionsResponseSchema(actionIds) {
  return {
    type: 'object',
    properties: {
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: actionIds },
            priority: { type: 'string', enum: PRIORITIES },
            why: str(320),
            tip: str(160),
          },
          required: ['id', 'priority', 'why'],
        },
      },
    },
    required: ['actions'],
  };
}

/** Part 2 of the plan: intro, kid alert, family checklist, community ideas and health notes. */
export const FAMILY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    headline: str(140),
    summary: str(600),
    kidAlert: str(220),
    checklist: {
      type: 'array',
      minItems: 4,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          who: { type: 'string', enum: CHECKLIST_WHO },
          time: { type: 'string', maxLength: 20, description: 'HH:MM, a window such as 14:00–16:00, or "Anytime"' },
          task: str(140),
        },
        required: ['who', 'time', 'task'],
      },
    },
    community: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'object',
        properties: { kind: { type: 'string', enum: COMMUNITY_KINDS }, title: str(80), detail: str(300) },
        required: ['kind', 'title', 'detail'],
      },
    },
    healthNotes: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: { group: { type: 'string', enum: HEALTH_GROUPS }, note: str(300) },
        required: ['group', 'note'],
      },
    },
  },
  required: ['headline', 'summary', 'kidAlert', 'checklist', 'community', 'healthNotes'],
};

export const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: str(1400),
    followUps: { type: 'array', maxItems: 3, items: str(90) },
  },
  required: ['reply'],
};

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Lenient string: coerces, strips control chars, truncates. */
const text = (max) =>
  z.unknown().transform((v) => (typeof v === 'string' ? v.replace(CONTROL, '').trim().slice(0, max) : ''));

/** True when a parsed item is an empty string or lacks any `required` field. */
const isBlank = (data, required) => (typeof data === 'string' ? data === '' : required.some((key) => !data[key]));

/** Keeps array items that parse and have their required text, dropping the rest. */
const listOf = (item, max, required = []) =>
  z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v : []))
    .transform((items) =>
      items
        .map((i) => item.safeParse(i))
        .filter((r) => r.success && !isBlank(r.data, required))
        .map((r) => r.data)
        .slice(0, max),
    );

const oneOf = (values) => z.enum(/** @type {[string, ...string[]]} */ ([...values]));

export const aiActionsParser = z.object({
  actions: listOf(
    z.object({ id: z.string(), priority: oneOf(PRIORITIES).catch('medium'), why: text(320), tip: text(160) }),
    40,
    ['id', 'why'],
  ),
});

export const aiFamilyParser = z.object({
  headline: text(140),
  summary: text(600),
  kidAlert: text(220),
  checklist: listOf(z.object({ who: oneOf(CHECKLIST_WHO).catch('everyone'), time: text(20), task: text(140) }), 8, [
    'time',
    'task',
  ]),
  community: listOf(
    z.object({ kind: oneOf(COMMUNITY_KINDS).catch('initiative'), title: text(80), detail: text(300) }),
    4,
    ['title', 'detail'],
  ),
  healthNotes: listOf(z.object({ group: oneOf(HEALTH_GROUPS), note: text(300) }), 5, ['note']),
});

export const aiChatParser = z.object({
  reply: text(1400),
  followUps: listOf(text(90), 3),
});
