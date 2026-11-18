import { h, replaceChildren, setStyles, svg } from '../dom.js';
import { fmt } from '../labels.js';

/**
 * Bar colour from that hour's PM2.5 using the EPA PM2.5 breakpoints (mirrors
 * src/services/aqi.js). The reported hourly AQI is a 24-hour rolling value, so
 * it hides the within-day swings this chart exists to show.
 */
const PM25_BANDS = [
  [9, '#00a651'],
  [35.4, '#d4a600'],
  [55.4, '#e86f00'],
  [125.4, '#d6231f'],
  [225.4, '#8f3f97'],
  [Infinity, '#7e0023'],
];
const colorFor = (pm25) => PM25_BANDS.find(([max]) => pm25 <= max)[1];

const stat = (label, value) => h('div', { className: 'stat' }, h('dt', null, label), h('dd', null, value));
const orDash = (value, unit) => (value === null || value === undefined ? '–' : `${fmt(value)} ${unit}`);

/** Current AQI card. */
export function renderAirCard(el, plan) {
  const { current, band, observedAt, timezone } = plan.conditions;
  replaceChildren(
    el,
    h('h2', { id: 'air-title' }, `Air right now in ${plan.location.name}`),
    h(
      'div',
      { className: 'aqi-row' },
      h(
        'div',
        { className: 'aqi-dial', style: { '--band': band.color } },
        h('span', { className: 'aqi-value' }, String(current.aqi)),
        h('span', { className: 'aqi-unit' }, 'US AQI'),
      ),
      h('div', null, h('p', { className: 'band-label' }, band.label), h('p', null, band.advice)),
    ),
    h(
      'dl',
      { className: 'stats' },
      stat('PM2.5', orDash(current.pm25, 'µg/m³')),
      stat('PM10', orDash(current.pm10, 'µg/m³')),
      stat('NO₂', orDash(current.no2, 'µg/m³')),
      stat('Temperature', orDash(current.temperatureC, '°C')),
      stat('Wind', orDash(current.windKmh, 'km/h')),
      stat('Humidity', orDash(current.humidity, '%')),
    ),
    h(
      'p',
      { className: 'hint' },
      `Observed ${observedAt.replace('T', ' ')} (${timezone}). Low wind traps smog near the ground.`,
    ),
  );
}

/** Kid-friendly alert card. */
export function renderKidCard(el, plan) {
  replaceChildren(
    el,
    h('h2', { id: 'kid-title' }, 'Kid alert'),
    h(
      'p',
      { className: 'kid-message' },
      h('span', { className: 'kid-emoji', 'aria-hidden': 'true' }, plan.kidAlert.emoji),
      ' ',
      plan.kidAlert.message,
    ),
    h('p', { className: 'hint' }, 'Read this one out at breakfast.'),
  );
}

/**
 * Hourly PM2.5 bar chart with the cleanest and worst daytime windows marked,
 * plus an equivalent data table for screen-reader and keyboard users.
 */
export function renderForecast(el, plan) {
  const { hourly } = plan.conditions;
  const { best, worst } = plan.windows;
  const width = 720;
  const height = 220;
  const pad = { top: 16, right: 8, bottom: 28, left: 36 };
  const max = Math.max(...hourly.map((x) => x.pm25), 10) * 1.1;
  const slot = (width - pad.left - pad.right) / hourly.length;
  const y = (v) => pad.top + (height - pad.top - pad.bottom) * (1 - v / max);
  const inWindow = (win, item) => win && item.time >= win.start && hoursBetween(win.start, item.time) < 2;

  const bars = hourly.map((item, i) => {
    const x = pad.left + i * slot;
    const marker = (inWindow(best, item) && 'best') || (inWindow(worst, item) && 'worst') || '';
    return svg(
      'g',
      { class: `bar ${marker}` },
      svg('rect', {
        x: x + 1,
        y: y(item.pm25),
        width: Math.max(1, slot - 2),
        height: Math.max(0, height - pad.bottom - y(item.pm25)),
        fill: colorFor(item.pm25),
        rx: 2,
      }),
      i % 3 === 0
        ? svg('text', { x: x + slot / 2, y: height - 10, 'text-anchor': 'middle', class: 'axis' }, `${item.hour}h`)
        : null,
    );
  });

  const ticks = [0, 0.5, 1].map((f) => {
    const v = Math.round(max * f);
    return svg(
      'g',
      null,
      svg('line', { x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v), class: 'grid' }),
      svg('text', { x: pad.left - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, String(v)),
    );
  });

  const summary = best
    ? `Cleanest daytime window ${best.label} (PM2.5 ${fmt(best.pm25)} µg/m³). Worst ${worst.label} (${fmt(worst.pm25)} µg/m³), ${plan.windows.spreadPct}% dirtier.`
    : 'No daytime hours in the forecast window.';

  replaceChildren(
    el,
    h(
      'div',
      { className: 'window-pills' },
      best &&
        h(
          'p',
          { className: 'pill pill-best' },
          h('strong', null, 'Best time outside: '),
          `${best.label} · ${fmt(best.pm25)} µg/m³`,
        ),
      worst &&
        h(
          'p',
          { className: 'pill pill-worst' },
          h('strong', null, 'Stay in: '),
          `${worst.label} · ${fmt(worst.pm25)} µg/m³`,
        ),
    ),
    svg(
      'svg',
      { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-labelledby': 'chart-desc' },
      svg('title', { id: 'chart-desc' }, `Hourly PM2.5 forecast for the next 24 hours. ${summary}`),
      ...ticks,
      ...bars,
    ),
    h(
      'p',
      { className: 'hint' },
      'Bars show hourly PM2.5 (µg/m³), coloured by AQI band. Outlined bars mark the best (solid) and worst (dashed) daytime windows.',
    ),
    h(
      'details',
      { className: 'table-toggle' },
      h('summary', null, 'Show forecast as a table'),
      h(
        'div',
        { className: 'table-wrap' },
        h(
          'table',
          null,
          h('caption', { className: 'visually-hidden' }, 'Hourly forecast'),
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { scope: 'col' }, 'Time'),
              h('th', { scope: 'col' }, 'PM2.5 (µg/m³)'),
              h('th', { scope: 'col' }, 'AQI'),
              h('th', { scope: 'col' }, 'Wind (km/h)'),
            ),
          ),
          h(
            'tbody',
            null,
            hourly.map((item) =>
              h(
                'tr',
                null,
                h('th', { scope: 'row' }, item.time.replace('T', ' ')),
                h('td', null, fmt(item.pm25)),
                h('td', null, String(item.aqi)),
                h('td', null, item.windKmh === null ? '–' : fmt(item.windKmh)),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function hoursBetween(a, b) {
  return (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 3_600_000;
}

/** Sets a bar width as a CSS custom property (CSP-safe, no inline style attribute). */
export const meter = (pct, className = 'meter') => {
  const fill = h('span', { className: 'meter-fill' });
  setStyles(fill, { '--pct': `${Math.max(0, Math.min(100, pct))}%` });
  return h('span', { className, 'aria-hidden': 'true' }, fill);
};
