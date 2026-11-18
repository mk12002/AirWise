import { renderActionPillars } from './panels/pillars.js';
import { renderAirCard, renderForecast, renderKidCard } from './panels/air.js';
import { renderCommunity, renderFamily } from './panels/family.js';
import { renderImpact } from './panels/impact.js';

const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * Draws every section of a plan. Pure DOM output from plan data, so it can
 * be exercised in jsdom tests without a server.
 *
 * @param {object} plan
 * @param {{done: Record<string, boolean>, onToggle: (id: string, checked: boolean) => void,
 *          onCopy: (text: string) => void}} handlers
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
  renderImpact(byId('impact-card'), plan);
  renderActionPillars(plan, byId);
  renderFamily(byId('panel-family'), plan, handlers);
  renderCommunity(byId('panel-community'), plan, handlers);
}
