import { h, replaceChildren } from '../dom.js';
import { GROUP_LABELS, fmt } from '../labels.js';
import { meter } from './air.js';

/**
 * Whole-plan impact: exposure for each household group before and after all
 * recommended actions, cigarette equivalents, CO2, and the free-only scenario.
 */
export function renderImpact(el, plan) {
  const { impact } = plan;
  const scale = Math.max(...impact.groups.map((g) => g.before.meanUgM3), 1);

  const rows = impact.groups.map((g) =>
    h(
      'li',
      { className: 'impact-row' },
      h('p', { className: 'impact-who' }, `${g.label}${g.count > 1 ? ` ×${g.count}` : ''}`),
      h(
        'div',
        { className: 'impact-bars' },
        h(
          'p',
          { className: 'bar-line' },
          h('span', { className: 'bar-label' }, 'Now'),
          meter((g.before.meanUgM3 / scale) * 100, 'meter meter-before'),
          h('span', null, `${fmt(g.before.meanUgM3)} µg/m³ · ≈${fmt(g.before.cigarettesPerDay)} cigarettes/day`),
        ),
        h(
          'p',
          { className: 'bar-line' },
          h('span', { className: 'bar-label' }, 'With plan'),
          meter((g.after.meanUgM3 / scale) * 100, 'meter meter-after'),
          h('span', null, `${fmt(g.after.meanUgM3)} µg/m³ · ≈${fmt(g.after.cigarettesPerDay)} cigarettes/day`),
        ),
      ),
    ),
  );

  replaceChildren(
    el,
    h('h2', { id: 'impact-title' }, 'What your plan changes'),
    h(
      'div',
      { className: 'kpis' },
      kpi(`−${impact.dosePctReduction}%`, 'smog your family breathes in each day'),
      kpi(`−${fmt(impact.all.pctReduction)}%`, `daily PM2.5 exposure for your ${GROUP_LABELS[impact.focusGroup]}`),
      kpi(`${fmt(impact.all.co2KgPerMonth, 0)} kg`, 'CO₂ saved per month'),
      kpi(`−${fmt(impact.freeOnly.pctReduction)}%`, 'from the free actions alone, starting today'),
    ),
    h('ul', { className: 'impact-list', 'aria-label': 'Daily average PM2.5 exposure by household member' }, rows),
    h(
      'p',
      { className: 'hint' },
      `Indoors: living space ${fmt(impact.indoor.before.living)} → ${fmt(impact.indoor.after.living)} µg/m³, bedroom ${fmt(impact.indoor.before.bedroom)} → ${fmt(impact.indoor.after.bedroom)} µg/m³ (outdoor 24-hour mean ${fmt(impact.outdoorAvgPm25)}). WHO's 24-hour guideline is 15 µg/m³. Cigarette equivalents use the Berkeley Earth rule of thumb (22 µg/m³ for a day ≈ 1 cigarette).`,
    ),
  );
}

const kpi = (value, label) =>
  h('div', { className: 'kpi' }, h('p', { className: 'kpi-value' }, value), h('p', { className: 'kpi-label' }, label));
