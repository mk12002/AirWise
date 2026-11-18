import { h, replaceChildren } from '../dom.js';
import { GROUP_LABELS, fmt } from '../labels.js';
import { meter } from './air.js';

const kpi = (value, label) =>
  h('div', { className: 'kpi' }, h('p', { className: 'kpi-value' }, value), h('p', { className: 'kpi-label' }, label));

/** "+8 mo" for short gains, "+2.5 yrs" once it passes two years. */
export const lifeLabel = (months) => (months >= 24 ? `+${fmt(months / 12)} yrs` : `+${fmt(months)} mo`);

/** One "Now / With plan" bar line. */
function barLine(label, values, scale, className) {
  return h(
    'p',
    { className: 'bar-line' },
    h('span', { className: 'bar-label' }, label),
    meter((values.meanUgM3 / scale) * 100, `meter ${className}`),
    h(
      'span',
      null,
      `${fmt(values.meanUgM3)} µg/m³ · ${fmt(values.whoMultiple)}× WHO limit · ≈${fmt(values.cigarettesPerDay)} cigarettes/day`,
    ),
  );
}

/**
 * Whole-plan impact: each household group's exposure before and after the
 * actions the family has chosen, framed against the WHO guideline, as
 * cigarette equivalents and as AQLI life expectancy, plus CO2 and the
 * free-only scenario.
 *
 * @param {HTMLElement} el
 * @param {object} impact
 * @param {{selected: number, total: number, pending?: boolean}} selection
 */
export function renderImpact(el, impact, { selected, total, pending = false }) {
  const scale = Math.max(...impact.groups.map((g) => g.before.meanUgM3), 1);
  const focus = impact.groups.find((g) => g.id === impact.focusGroup) ?? impact.groups[0];

  const rows = impact.groups.map((g) =>
    h(
      'li',
      { className: 'impact-row' },
      h('p', { className: 'impact-who' }, `${g.label}${g.count > 1 ? ` ×${g.count}` : ''}`),
      h(
        'div',
        { className: 'impact-bars' },
        barLine('Now', g.before, scale, 'meter-before'),
        barLine('With plan', g.after, scale, 'meter-after'),
      ),
    ),
  );

  replaceChildren(
    el,
    h('h2', { id: 'impact-title' }, 'What your choices change'),
    h(
      'p',
      { className: 'hint', id: 'impact-status', 'aria-live': 'polite' },
      pending
        ? 'Recalculating…'
        : `Based on the ${selected} of ${total} actions in your plan. Add or remove actions below to see the effect.`,
    ),
    h(
      'div',
      { className: 'kpis' },
      kpi(`−${impact.dosePctReduction}%`, 'smog your family breathes in each day'),
      kpi(`−${fmt(impact.all.pctReduction)}%`, `daily PM2.5 exposure for your ${GROUP_LABELS[impact.focusGroup]}`),
      kpi(
        lifeLabel(focus.lifeMonthsIfSustained),
        `life expectancy for your ${GROUP_LABELS[impact.focusGroup]} if this cut were sustained year-round (AQLI)`,
      ),
      kpi(`${fmt(impact.all.co2KgPerMonth, 0)} kg`, 'CO₂ saved per month'),
      kpi(`−${fmt(impact.freeOnly.pctReduction)}%`, 'from the free actions alone, starting today'),
    ),
    h('ul', { className: 'impact-list', 'aria-label': 'Daily average PM2.5 exposure by household member' }, rows),
    h(
      'p',
      { className: 'hint' },
      `Indoors: living space ${fmt(impact.indoor.before.living)} → ${fmt(impact.indoor.after.living)} µg/m³, bedroom ${fmt(impact.indoor.before.bedroom)} → ${fmt(impact.indoor.after.bedroom)} µg/m³ (outdoor 24-hour mean ${fmt(impact.outdoorAvgPm25)}). The WHO 24-hour guideline is 15 µg/m³. Cigarette equivalents use the Berkeley Earth rule of thumb (22 µg/m³ for a day ≈ 1 cigarette); life expectancy uses the Air Quality Life Index (0.098 years per sustained µg/m³). These are estimates for comparing options, not medical advice.`,
    ),
  );
}
