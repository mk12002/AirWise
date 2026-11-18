import { GROUPS } from '../constants.js';
import { aqiBand } from './aqi.js';

/*
 * Template content used when Gemini is unavailable (no key, quota, timeout
 * or malformed output). The plan stays fully useful: numbers come from the
 * model either way, only the wording is less personal.
 */

const fmt = (n) => new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(n);

/** Plain-language explanation built from an action's computed metrics. */
export function templateWhy(action) {
  const m = action.metrics;
  const parts = [action.why];
  if (m.pctReduction >= 0.5) {
    parts.push(
      `For your ${GROUPS[m.group].label.toLowerCase()}, daily PM2.5 exposure drops from ${fmt(m.beforeUgM3)} to ${fmt(m.afterUgM3)} µg/m³ (−${fmt(m.pctReduction)}%).`,
    );
  }
  if (m.co2KgPerMonth >= 1) parts.push(`It also saves about ${fmt(m.co2KgPerMonth)} kg of CO2 a month.`);
  if (m.co2KgPerMonth <= -1) {
    parts.push(`It adds about ${fmt(-m.co2KgPerMonth)} kg of CO2 a month, a trade-off worth making for your lungs.`);
  }
  return parts.join(' ');
}

/** Headline, summary and kid alert for the current conditions. */
export function templateIntro({ profile, conditions, windows }) {
  const band = aqiBand(conditions.current.aqi);
  const city = profile.location.name;
  const clean = windows.best ? ` The cleanest hours today are ${windows.best.label}.` : '';
  return {
    headline: `${band.label} air in ${city} right now (AQI ${conditions.current.aqi})`,
    summary: `${band.advice}${clean} Below are the changes that matter most for your household, ranked by how much they cut your family's smog exposure.`,
    kidAlert: band.kid,
  };
}

/** Family checklist anchored on the forecast windows. */
export function templateChecklist({ profile, windows, actions }) {
  const best = windows.best?.label ?? 'Afternoon';
  const worst = windows.worst?.label ?? 'Early morning';
  const has = (id) => actions.some((a) => a.id === id);
  const items = [
    { who: 'everyone', time: worst, task: 'Keep windows and doors shut during the peak smog hours' },
    { who: 'everyone', time: best, task: 'Air out the house for 15–30 minutes with windows on opposite sides open' },
    { who: 'adults', time: 'Morning', task: 'Damp-mop floors and wipe window sills' },
  ];
  if (profile.household.children > 0) {
    items.push({ who: 'kids', time: best, task: 'Outdoor play time, then wash hands and face' });
  }
  if (profile.household.elderly > 0) {
    items.push({ who: 'elders', time: best, task: 'Short walk only in the clean window; keep inhalers handy' });
  }
  if (has('purifier_schedule') || has('bedroom_purifier') || has('diy_purifier')) {
    items.push({ who: 'everyone', time: '21:00', task: 'Close the bedroom door and switch the air cleaner to high' });
  }
  if (profile.commute.mode !== 'wfh') {
    items.push({
      who: 'commuter',
      time: 'Commute',
      task: 'Wear a well-fitted N95 on walking legs; keep car windows up on recirculate',
    });
  }
  return items.slice(0, 10);
}

export const TEMPLATE_COMMUNITY = Object.freeze([
  {
    kind: 'carpool',
    title: 'Start a building carpool board',
    detail:
      'Post routes and timings in your society or WhatsApp group. Three people in one car cut each person’s commute emissions by two thirds.',
  },
  {
    kind: 'initiative',
    title: 'Bulk-buy purifier filters',
    detail:
      'Neighbours ordering HEPA / MERV-13 filters together often get 20–30% off, and nobody runs a clogged filter.',
  },
  {
    kind: 'advocacy',
    title: 'No-idling zone at the school gate',
    detail:
      'Ask the school to put up “engines off” signs at pick-up time, when children stand right next to exhaust pipes.',
  },
  {
    kind: 'alert',
    title: 'Report garbage and leaf burning',
    detail:
      'Open burning is a major winter source. Report it to your municipal helpline or pollution control board app.',
  },
]);

/** Health notes for the vulnerable groups present in the household. */
export function templateHealthNotes(profile) {
  const notes = [];
  const { household } = profile;
  if (household.children > 0) {
    notes.push({
      group: 'children',
      note: 'Children breathe more air per kg of body weight. Keep outdoor play to the clean window and use a closed bedroom with an air cleaner at night.',
    });
  }
  if (household.elderly > 0) {
    notes.push({
      group: 'elderly',
      note: 'Smog raises heart and lung strain in older adults. Avoid early-morning walks in winter and watch for breathlessness.',
    });
  }
  if (household.respiratory) {
    notes.push({
      group: 'respiratory',
      note: 'Keep reliever inhalers handy and follow your asthma action plan. See a doctor if symptoms increase on high-AQI days.',
    });
  }
  if (household.pregnant) {
    notes.push({
      group: 'pregnant',
      note: 'PM2.5 exposure in pregnancy is linked to low birth weight. Prioritise a filtered bedroom and an N95 outdoors.',
    });
  }
  notes.push({
    group: 'adults',
    note: 'A well-fitted N95/FFP2 mask filters most fine particles; cloth and surgical masks do not.',
  });
  return notes;
}

const TOPICS = [
  {
    match: /mask|n95|ffp2/i,
    answer:
      'A well-fitted N95 or FFP2 mask filters over 90% of fine particles. Make sure it seals around the nose and chin. Cloth and surgical masks leak at the sides. Children need child-size masks.',
  },
  {
    match: /purif|filter|cadr|hepa/i,
    answer:
      'Size a purifier so its CADR (m³/h) is about 5 times the room volume. For a 12 m² bedroom that means roughly 300 m³/h. Run it with the door closed, on high during peak smog, and change the filter when it greys.',
  },
  {
    match: /plant/i,
    answer:
      'Plants are lovely, but you would need hundreds per room to match even a small purifier for PM2.5. Keep them for wellbeing, not as an air cleaner.',
  },
  {
    match: /school|kid|child|play/i,
    answer:
      'Plan outdoor play in the clean window shown on the forecast chart, choose calm games on orange or red days, and keep a closed, filtered bedroom for sleep. Kids breathe more air per kg than adults.',
  },
  {
    match: /window|ventilat|fresh air/i,
    answer:
      'Keep windows shut during peak smog and open opposite windows for 15–30 minutes in the cleanest window of the day. You get fresh air with far less smog.',
  },
  {
    match: /cook|stove|induction|gas|lpg/i,
    answer:
      'Run the kitchen exhaust from start to 10 minutes after cooking, use lids, and keep the kitchen door shut. Induction removes combustion smoke and NO2 completely.',
  },
  {
    match: /exercise|run|walk|jog|gym/i,
    answer:
      'You breathe 3–4× more air while exercising. Move workouts to the cleanest window or indoors on very unhealthy days.',
  },
];

/** Rule-based answer used when Gemini is not available. */
export function templateChat(message, { conditions, windows }) {
  const topic = TOPICS.find((t) => t.match.test(message));
  const band = aqiBand(conditions.current.aqi);
  const now = `Right now the AQI is ${conditions.current.aqi} (${band.label.toLowerCase()}).`;
  const clean = windows.best ? ` Today's cleanest window is ${windows.best.label}.` : '';
  return {
    reply: `${topic ? topic.answer : band.advice} ${now}${clean}`,
    followUps: ['Which purifier size do I need?', 'When can the kids play outside?', 'Is cooking smoke a big deal?'],
  };
}
