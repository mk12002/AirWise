import { h, replaceChildren } from '../dom.js';
import { GROUP_LABELS, PILLAR_INTROS, TIER_HINTS, TIER_LABELS, fmt } from '../labels.js';

const PILLAR_TITLES = {
  routine: 'Low-emission daily routines',
  indoor: 'Indoor air quality hacks',
  swap: 'Sustainable alternatives',
};
const TIERS = ['free', 'low', 'medium', 'high'];

/** Impact chips: exposure change for the member who benefits most, inhaled dose, CO2. */
function impactChips(metrics) {
  const chips = [];
  if (metrics.pctReduction >= 0.5) {
    chips.push(
      h(
        'li',
        { className: 'chip chip-health' },
        `−${fmt(metrics.pctReduction)}% PM2.5 for your ${GROUP_LABELS[metrics.group]} (${fmt(metrics.beforeUgM3)} → ${fmt(metrics.afterUgM3)} µg/m³)`,
      ),
    );
  }
  if (metrics.doseSavedUgPerDay >= 10) {
    chips.push(
      h(
        'li',
        { className: 'chip chip-dose' },
        `${fmt(metrics.doseSavedUgPerDay, 0)} µg less smog inhaled by the family each day`,
      ),
    );
  }
  if (metrics.co2KgPerMonth >= 1) {
    chips.push(h('li', { className: 'chip chip-co2' }, `${fmt(metrics.co2KgPerMonth, 0)} kg CO₂ saved / month`));
  } else if (metrics.co2KgPerMonth <= -1) {
    chips.push(
      h(
        'li',
        { className: 'chip' },
        `Adds ~${fmt(-metrics.co2KgPerMonth, 0)} kg CO₂ / month: a health-first trade-off`,
      ),
    );
  }
  if (chips.length === 0) chips.push(h('li', { className: 'chip' }, 'Little measurable PM2.5 effect: see why below'));
  return h('ul', { className: 'chips', 'aria-label': 'Measured impact' }, chips);
}

/**
 * One recommendation card.
 * @param {object} action
 * @param {'h3' | 'h4'} [level] heading level, so the outline stays valid inside tier sections
 */
export function actionCard(action, level = 'h3') {
  return h(
    'article',
    { className: `action priority-${action.priority}`, 'aria-labelledby': `act-${action.id}` },
    h(
      'header',
      { className: 'action-head' },
      h(level, { id: `act-${action.id}` }, action.title),
      h(
        'p',
        { className: 'badges' },
        h('span', { className: `badge badge-${action.priority}` }, `${action.priority} priority`),
        h('span', { className: 'badge badge-muted' }, TIER_LABELS[action.tier]),
      ),
    ),
    impactChips(action.metrics),
    h('p', { className: 'why' }, h('strong', null, 'Why it matters: '), action.why),
    h(
      'ol',
      { className: 'steps', 'aria-label': 'How to do it' },
      action.steps.map((s) => h('li', null, s)),
    ),
    action.tip && h('p', { className: 'tip' }, h('strong', null, 'Local tip: '), action.tip),
  );
}

/**
 * Renders a pillar panel. The indoor pillar is grouped by budget tier so
 * families can see what they can do for free before spending anything.
 */
export function renderPillar(el, pillar, actions) {
  const heading = h('h2', { className: 'panel-title' }, PILLAR_TITLES[pillar]);
  const intro = h('p', { className: 'hint' }, PILLAR_INTROS[pillar]);
  if (actions.length === 0) {
    replaceChildren(el, heading, intro, h('p', null, 'Nothing to change here. Your household is already doing well.'));
    return;
  }
  if (pillar !== 'indoor') {
    replaceChildren(
      el,
      heading,
      intro,
      h(
        'div',
        { className: 'action-grid' },
        actions.map((a) => actionCard(a)),
      ),
    );
    return;
  }
  const groups = TIERS.map((tier) => [tier, actions.filter((a) => a.tier === tier)]).filter(([, list]) => list.length);
  replaceChildren(
    el,
    heading,
    intro,
    groups.map(([tier, list]) =>
      h(
        'section',
        { className: 'tier', 'aria-labelledby': `tier-${tier}` },
        h(
          'h3',
          { id: `tier-${tier}`, className: 'tier-title' },
          `${TIER_LABELS[tier]} `,
          h('small', null, TIER_HINTS[tier]),
        ),
        h(
          'div',
          { className: 'action-grid' },
          list.map((a) => actionCard(a, 'h4')),
        ),
      ),
    ),
  );
}
