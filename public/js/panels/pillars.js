import { h } from '../dom.js';
import { renderPillar } from './actions.js';

export const PILLAR_IDS = Object.freeze(['routine', 'indoor', 'swap']);

/**
 * Renders the three recommendation pillars. The first tab opens with the
 * plan's AI headline and summary so the narrative leads the numbers.
 *
 * @param {object} plan
 * @param {(id: string) => HTMLElement} byId
 * @param {{selected: Set<string>, onSelect: (id: string) => void}} options
 */
export function renderActionPillars(plan, byId, { selected, onSelect }) {
  const lang = plan.lang?.actions ?? 'en';
  for (const pillar of PILLAR_IDS) {
    renderPillar(byId(`panel-${pillar}`), pillar, plan.pillars[pillar] ?? [], { selected, onSelect, lang });
  }
  byId('panel-routine').prepend(
    h(
      'div',
      { className: 'summary card-inset', lang: plan.lang?.family ?? 'en' },
      h('p', { className: 'summary-headline' }, plan.headline),
      h('p', null, plan.summary),
    ),
  );
}

/** Every action id in the plan (the default selection). */
export const allActionIds = (plan) => PILLAR_IDS.flatMap((p) => (plan.pillars[p] ?? []).map((a) => a.id));
