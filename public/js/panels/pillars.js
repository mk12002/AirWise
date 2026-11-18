import { h } from '../dom.js';
import { renderPillar } from './actions.js';

/**
 * Renders the three recommendation pillars, each opening with the plan's
 * AI headline/summary on the first tab so the narrative leads the numbers.
 *
 * @param {object} plan
 * @param {(id: string) => HTMLElement} byId
 */
export function renderActionPillars(plan, byId) {
  for (const pillar of ['routine', 'indoor', 'swap']) {
    renderPillar(byId(`panel-${pillar}`), pillar, plan.pillars[pillar] ?? []);
  }
  const first = byId('panel-routine');
  first.prepend(
    h(
      'div',
      { className: 'summary card-inset' },
      h('p', { className: 'summary-headline' }, plan.headline),
      h('p', null, plan.summary),
    ),
  );
}
