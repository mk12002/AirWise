import { renderAirCard, renderForecast, renderKidCard } from './panels/air.js';
import { renderCommunity, renderFamily } from './panels/family.js';
import { renderImpact } from './panels/impact.js';
import { allActionIds, renderActionPillars } from './panels/pillars.js';

const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @typedef {object} Handlers
 * @property {Record<string, boolean>} done          checklist ticks
 * @property {Set<string>} selected                  action ids in the family's plan
 * @property {object | null} [impact]                what-if impact for `selected` (defaults to the plan's)
 * @property {(id: string, checked: boolean) => void} onToggle
 * @property {(id: string) => void} onSelect
 * @property {(text: string) => void} onCopy
 * @property {() => void} [onPrint]
 */

/** Re-renders only the impact card (used by the what-if simulator). */
export function renderImpactCard(plan, impact, selected, pending = false) {
  renderImpact(byId('impact-card'), impact, {
    selected: selected.size,
    total: allActionIds(plan).length,
    pending,
  });
}

/**
 * Draws every section of a plan. Pure DOM output from plan data, so it can
 * be exercised in jsdom tests without a server.
 *
 * @param {object} plan
 * @param {Handlers} handlers
 */
export function renderPlan(plan, handlers) {
  const when = new Date(plan.generatedAt).toLocaleString();
  byId('plan-meta').textContent =
    `${plan.location.name}${plan.location.region ? `, ${plan.location.region}` : ''} · updated ${when} · ${
      plan.aiGenerated ? `explanations by Gemini (${plan.model})` : 'template explanations (AI offline)'
    }`;
  renderAirCard(byId('air-card'), plan);
  renderKidCard(byId('kid-card'), plan);
  renderForecast(byId('forecast'), plan);
  renderImpactCard(plan, handlers.impact ?? plan.impact, handlers.selected);
  renderActionPillars(plan, byId, handlers);
  renderFamily(byId('panel-family'), plan, handlers);
  renderCommunity(byId('panel-community'), plan, handlers);
}
