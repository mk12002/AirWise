/** Display labels shared by the panels. */

export const TIER_LABELS = Object.freeze({
  free: 'Free',
  low: 'Low cost',
  medium: 'Medium budget',
  high: 'Investment',
});

export const TIER_HINTS = Object.freeze({
  free: 'Habits that cost nothing',
  low: 'Under about $15 / ₹1,000',
  medium: 'About $50–150 / ₹4,000–12,000',
  high: 'Larger one-off investment',
});

export const GROUP_LABELS = Object.freeze({ adult: 'adult', child: 'child', elderly: 'older adult' });

export const WHO_LABELS = Object.freeze({
  everyone: 'Everyone',
  adults: 'Adults',
  kids: 'Kids',
  elders: 'Grandparents',
  commuter: 'Commuter',
});

export const KIND_LABELS = Object.freeze({
  carpool: 'Carpool',
  initiative: 'Neighbourhood initiative',
  alert: 'Alert & report',
  advocacy: 'Advocacy',
});

export const HEALTH_LABELS = Object.freeze({
  children: 'Children',
  elderly: 'Older adults',
  respiratory: 'Asthma / heart & lung conditions',
  pregnant: 'Pregnancy',
  adults: 'Everyone',
});

export const PILLAR_INTROS = Object.freeze({
  routine: 'Timing and habit changes, sorted by priority. Times come from the live forecast for your location.',
  indoor:
    'Practical fixes grouped by budget, from free habits to purifiers. Each one is measured with our indoor-air model.',
  swap: 'Cleaner alternatives for daily habits, with the smog and CO2 they avoid.',
});

/** Number formatting with sensible precision. */
export const fmt = (n, digits = 1) => new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(n);
