import { h, replaceChildren } from '../dom.js';
import { GROUP_LABELS, PILLAR_INTROS, TIER_HINTS, TIER_LABELS, fmt } from '../labels.js';

const PILLAR_TITLES = {
  routine: 'Low-emission daily routines',
  indoor: 'Indoor air quality hacks',
  swap: 'Sustainable alternatives',
};
const TIERS = ['free', 'low', 'medium', 'high'];

/**
 * @typedef {{selected: Set<string>, onSelect: (id: string) => void, lang: string}} CardOptions
 */

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

/** Toggle that adds or removes the action from the family's plan (drives the what-if impact). */
function selectButton(action, { selected, onSelect }) {
  const on = selected.has(action.id);
  return h(
    'button',
    {
      type: 'button',
      className: `btn btn-toggle${on ? ' is-on' : ''}`,
      'aria-pressed': String(on),
      'aria-describedby': `act-${action.id}`,
      dataset: { action: action.id },
      onclick: () => onSelect(action.id),
    },
    on ? '✓ In my plan' : '+ Add to my plan',
  );
}

/**
 * One recommendation card.
 * @param {object} action
 * @param {CardOptions} options
 * @param {'h3' | 'h4'} [level] heading level, so the outline stays valid inside tier sections
 */
export function actionCard(action, options, level = 'h3') {
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
    h('p', { className: 'why', lang: options.lang }, h('strong', { lang: 'en' }, 'Why it matters: '), action.why),
    h(
      'ol',
      { className: 'steps', 'aria-label': 'How to do it' },
      action.steps.map((s) => h('li', null, s)),
    ),
    action.tip &&
      h('p', { className: 'tip', lang: options.lang }, h('strong', { lang: 'en' }, 'Local tip: '), action.tip),
    selectButton(action, options),
  );
}

/**
 * Renders a pillar panel. The indoor pillar is grouped by budget tier so
 * families can see what they can do for free before spending anything.
 *
 * @param {HTMLElement} el
 * @param {string} pillar
 * @param {object[]} actions
 * @param {CardOptions} options
 */
export function renderPillar(el, pillar, actions, options) {
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
        actions.map((a) => actionCard(a, options)),
      ),
    );
    return;
  }
  /** @type {Array<[string, object[]]>} */
  const groups = TIERS.map(
    (tier) => /** @type {[string, object[]]} */ ([tier, actions.filter((a) => a.tier === tier)]),
  );
  replaceChildren(
    el,
    heading,
    intro,
    groups
      .filter(([, list]) => list.length > 0)
      .map(([tier, list]) =>
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
            list.map((a) => actionCard(a, options, 'h4')),
          ),
        ),
      ),
  );
}
