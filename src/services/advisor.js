import { createHash, randomUUID } from 'node:crypto';
import { BUDGET_TIERS, GROUPS } from '../constants.js';
import { silentLogger } from '../logger.js';
import { PILLARS, evaluateActions, measure, mergeMods } from './actions.js';
import { aqiBand } from './aqi.js';
import { householdCo2, householdExposure, mostVulnerable } from './exposure.js';
import {
  TEMPLATE_COMMUNITY,
  templateChat,
  templateChecklist,
  templateHealthNotes,
  templateIntro,
  templateWhy,
} from './fallback.js';
import {
  CHAT_RESPONSE_SCHEMA,
  FAMILY_RESPONSE_SCHEMA,
  actionsResponseSchema,
  aiActionsParser,
  aiChatParser,
  aiFamilyParser,
} from './geminiSchemas.js';
import { CHAT_SYSTEM, PLAN_SYSTEM, buildActionsPrompt, buildChatPrompt, buildFamilyPrompt } from './prompts.js';
import { findWindows, pm25AtPreference } from './windows.js';

/** Maximum actions shown per pillar (keeps the plan focused and the prompt small). */
const PER_PILLAR = 6;
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * Orchestrates live air data, the exposure model and Gemini.
 * "The model calculates, the AI explains": every number comes from the
 * deterministic engine; Gemini prioritises and personalises the wording.
 *
 * @param {{airData: ReturnType<import('./airData.js').createAirDataClient>,
 *          ai?: ReturnType<import('./gemini.js').createGeminiClient> | null,
 *          logger?: typeof silentLogger,
 *          cache?: import('./cache.js').TtlCache}} deps
 */
export function createAdvisor({ airData, ai = null, logger = silentLogger, cache }) {
  /** Shared analysis for plan and chat. */
  async function analyse(profile) {
    const conditions = await airData.getConditions(profile.location);
    const windows = findWindows(conditions.hourly);
    const air = {
      avgPm25: conditions.avgPm25,
      exercisePm: pm25AtPreference(conditions.hourly, profile.lifestyle.outdoorExercise),
    };
    const ctx = { profile, best: windows.best, air };
    const actions = selectActions(evaluateActions(ctx));
    return { conditions, windows, air, actions };
  }

  /** One structured Gemini call; any failure resolves to null (template fallback). */
  async function ask(label, request, parser) {
    try {
      return parser.parse(await ai.generateJson({ system: PLAN_SYSTEM, temperature: 0.6, ...request }));
    } catch (error) {
      logger.warn(`AI ${label} failed; using templates`, error);
      return null;
    }
  }

  /**
   * Two smaller calls in parallel (action explanations | family content)
   * roughly halve latency versus one large response, and each part falls
   * back to templates independently.
   */
  async function enrichPlan(analysis, profile) {
    if (!ai) return null;
    const input = { profile, ...analysis };
    const [actionsPart, familyPart] = await Promise.all([
      ask(
        'actions',
        { prompt: buildActionsPrompt(input), schema: actionsResponseSchema(analysis.actions.map((a) => a.id)) },
        aiActionsParser,
      ),
      ask('family', { prompt: buildFamilyPrompt(input), schema: FAMILY_RESPONSE_SCHEMA }, aiFamilyParser),
    ]);
    if (!actionsPart && !familyPart) return null;
    return { ...familyPart, actions: actionsPart?.actions ?? [] };
  }

  return {
    getConditions: (coords) => airData.getConditions(coords),
    searchPlaces: (query) => airData.searchPlaces(query),

    /** Builds the full personalised plan for a validated profile. */
    async buildPlan(profile) {
      const analysis = await analyse(profile);
      const key = `plan:${digest(profile)}:${analysis.conditions.observedAt}`;
      const cached = cache?.get(key);
      if (cached) return cached;

      const aiPlan = await enrichPlan(analysis, profile);
      const plan = assemblePlan({ profile, analysis, aiPlan, model: aiPlan ? ai.model : null });
      cache?.set(key, plan);
      return plan;
    },

    /** Answers a follow-up question in the context of the family's live plan. */
    async chat(profile, message, history) {
      const analysis = await analyse(profile);
      if (ai) {
        try {
          const raw = await ai.generateJson({
            system: CHAT_SYSTEM,
            prompt: buildChatPrompt({ profile, ...analysis, message, history }),
            schema: CHAT_RESPONSE_SCHEMA,
            temperature: 0.5,
          });
          const parsed = aiChatParser.parse(raw);
          if (parsed.reply) return { ...parsed, aiGenerated: true };
        } catch (error) {
          logger.warn('AI chat failed; using rule-based answer', error);
        }
      }
      return { ...templateChat(message, analysis), aiGenerated: false };
    },
  };
}

/** Stable hash of the profile, so the cache never stores raw personal input as a key. */
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('base64url').slice(0, 22);
}

/** Top actions per pillar by computed score. */
export function selectActions(evaluated) {
  return Object.keys(PILLARS).flatMap((pillar) => evaluated.filter((a) => a.pillar === pillar).slice(0, PER_PILLAR));
}

/** Actions with AI (or template) wording, grouped by pillar and sorted by priority. */
export function buildPillars(actions, aiActions = []) {
  const aiById = new Map(aiActions.map((a) => [a.id, a]));
  const enriched = actions.map((action) => {
    const fromAi = aiById.get(action.id);
    const { metrics } = action;
    const fallbackPriority = metrics.pctReduction >= 10 || metrics.co2KgPerMonth >= 20 ? 'high' : 'medium';
    return {
      id: action.id,
      pillar: action.pillar,
      tier: action.tier,
      title: action.title,
      steps: action.steps,
      metrics,
      priority: fromAi?.priority ?? fallbackPriority,
      why: fromAi?.why || templateWhy(action),
      tip: fromAi?.tip || '',
    };
  });

  const pillars = {};
  for (const pillar of Object.keys(PILLARS)) {
    pillars[pillar] = enriched
      .filter((a) => a.pillar === pillar)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }
  return pillars;
}

/** Intro, kid alert, checklist, community and health content: AI when usable, templates otherwise. */
function familyContent({ profile, conditions, windows, actions }, ai = {}) {
  const intro = templateIntro({ profile, conditions, windows });
  return {
    headline: ai.headline || intro.headline,
    summary: ai.summary || intro.summary,
    kidAlert: ai.kidAlert || intro.kidAlert,
    checklist: withIds(ai.checklist?.length >= 3 ? ai.checklist : templateChecklist({ profile, windows, actions })),
    community: ai.community?.length >= 2 ? ai.community : [...TEMPLATE_COMMUNITY],
    healthNotes: ai.healthNotes?.length ? ai.healthNotes : templateHealthNotes(profile),
  };
}

/** Combines the computed analysis with (optional) AI wording into the response. */
export function assemblePlan({ profile, analysis, aiPlan, model, now = new Date() }) {
  const { conditions, windows, air, actions } = analysis;
  const band = aqiBand(conditions.current.aqi);
  const { kidAlert, ...family } = familyContent({ profile, conditions, windows, actions }, aiPlan ?? {});
  return {
    id: randomUUID(),
    generatedAt: now.toISOString(),
    aiGenerated: Boolean(aiPlan),
    model,
    location: profile.location,
    conditions: { ...conditions, band: { id: band.id, label: band.label, color: band.color, advice: band.advice } },
    windows,
    ...family,
    kidAlert: { emoji: band.emoji, message: kidAlert },
    pillars: buildPillars(actions, aiPlan?.actions),
    impact: computeImpact(profile, air, actions),
  };
}

const withIds = (items) => items.map((item, i) => ({ id: `task-${i + 1}`, ...item }));

/**
 * Whole-plan impact: every group's exposure before/after all recommended
 * actions together (mods merged, not naively summed), plus a "free actions
 * only" scenario so families on any budget see what they can do today.
 */
export function computeImpact(profile, air, actions) {
  const baseline = householdExposure(profile, air);
  const baseCo2 = householdCo2(profile);
  const focus = mostVulnerable(profile);
  const ctx = { profile, air, baseline, baseCo2, focus };

  const allMods = mergeMods(actions.map((a) => a.mods));
  const freeMods = mergeMods(actions.filter((a) => a.tier === BUDGET_TIERS[0]).map((a) => a.mods));
  const after = householdExposure(profile, air, allMods);
  const all = measure(ctx, allMods);
  const free = measure(ctx, freeMods);

  return {
    focusGroup: focus,
    outdoorAvgPm25: air.avgPm25,
    indoor: { before: baseline.indoor, after: after.indoor },
    groups: Object.entries(baseline.groups).map(([id, before]) => ({
      id,
      label: GROUPS[id].label,
      count: before.count,
      before,
      after: after.groups[id],
    })),
    dosePctReduction:
      baseline.totalDoseUg > 0
        ? Math.round(((baseline.totalDoseUg - after.totalDoseUg) / baseline.totalDoseUg) * 100)
        : 0,
    all: { pctReduction: all.pctReduction, co2KgPerMonth: all.co2KgPerMonth },
    freeOnly: { pctReduction: free.pctReduction, co2KgPerMonth: free.co2KgPerMonth },
    co2BaselineKgPerMonth: baseCo2,
  };
}
