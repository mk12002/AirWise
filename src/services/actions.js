import { BUDGET_TIERS, COMMUTE_MODES, COOKING_FUELS, HEATING } from '../constants.js';
import { householdCo2, householdExposure, mostVulnerable } from './exposure.js';

/*
 * Catalogue of candidate actions across the three pillars. Each action says
 * when it applies and which model `mods` it represents; `evaluateActions`
 * runs the exposure/emissions model before and after, so every metric shown
 * to the user is computed, never guessed by the LLM.
 */

export const PILLARS = Object.freeze({
  routine: 'Low-emission daily routines',
  indoor: 'Indoor air quality hacks',
  swap: 'Sustainable alternatives',
});

const COMBUSTION_FUELS = new Set(['biomass', 'coal', 'kerosene', 'lpg', 'piped_gas']);
const DIRTY_FUELS = new Set(['biomass', 'coal', 'kerosene']);
const SMOKY_HEATING = new Set(['wood_coal', 'kerosene']);

const isPrivateCar = (mode) => COMMUTE_MODES[mode].private && COMMUTE_MODES[mode].co2PerKm > 0.1;
const commutes = (p) => p.commute.mode !== 'wfh' && p.commute.distanceKm > 0 && p.commute.daysPerWeek > 0;

/** Cleaner commute option for a trip length. */
export function transitAlternative(distanceKm) {
  if (distanceKm <= 3) return 'cycle_walk';
  return distanceKm >= 6 ? 'metro' : 'bus';
}

/**
 * @typedef {{profile: any, best: {pm25: number, label: string} | null, air: {avgPm25: number, exercisePm: number}}} Ctx
 * @typedef {{id: string, pillar: keyof typeof PILLARS, tier: typeof BUDGET_TIERS[number], title: string,
 *            applies: (ctx: Ctx) => boolean, mods: (ctx: Ctx) => import('./exposure.js').Mods,
 *            steps: string[], why: string}} ActionDef
 */

/** @type {ActionDef[]} */
export const ACTIONS = [
  // --- Low-emission daily routines -------------------------------------------------------
  {
    id: 'time_exercise',
    pillar: 'routine',
    tier: 'free',
    title: 'Move your workout to the cleanest hours',
    applies: ({ profile, best, air }) =>
      profile.lifestyle.outdoorExercise !== 'none' && best && air.exercisePm - best.pm25 > 2,
    mods: ({ best }) => ({ exerciseConc: best.pm25 }),
    steps: [
      'Check the forecast chart each evening',
      'Exercise in the green window',
      'Go indoors (yoga, stairs) on red days',
    ],
    why: 'You breathe 3–4× more air while exercising, so timing matters more than for any other hour of the day.',
  },
  {
    id: 'time_errands',
    pillar: 'routine',
    tier: 'free',
    title: 'Schedule errands and outdoor play in the clean window',
    applies: ({ best, air }) => best && air.avgPm25 - best.pm25 > 2,
    mods: ({ best }) => ({ errandConc: best.pm25 }),
    steps: [
      'Batch shopping and school-run walks into the clean window',
      'Avoid busy roads at rush hour',
      'Keep kids indoors at peak hours',
    ],
    why: 'Smog often peaks at night and early morning when cold air traps pollution near the ground.',
  },
  {
    id: 'air_smart',
    pillar: 'routine',
    tier: 'free',
    title: 'Air out the house only during the clean window',
    applies: ({ best, air }) => best && air.avgPm25 - best.pm25 > 2,
    mods: ({ best }) => ({ airingAt: best.pm25 }),
    steps: [
      'Keep windows shut at peak hours',
      'Open opposite windows for 15–30 minutes of cross-ventilation in the clean window',
      'Close up again once the window ends',
    ],
    why: 'Fresh air still matters for CO2 and humidity: just let it in when the outdoor air is cleanest.',
  },
  {
    id: 'carpool',
    pillar: 'routine',
    tier: 'free',
    title: 'Carpool with neighbours or colleagues',
    applies: ({ profile }) => commutes(profile) && isPrivateCar(profile.commute.mode),
    mods: () => ({ carpoolShare: 3 }),
    steps: [
      'Post your route in the society / building group',
      'Rotate drivers weekly',
      'Share school drop-offs with 2 other families',
    ],
    why: 'Three people in one car cuts each person’s commute emissions by two thirds and takes cars off smoggy roads.',
  },
  {
    id: 'no_idling',
    pillar: 'routine',
    tier: 'free',
    title: 'Switch off the engine at signals and school gates',
    applies: ({ profile }) => commutes(profile) && isPrivateCar(profile.commute.mode),
    mods: () => ({ noIdling: true }),
    steps: ['Turn off if stopped for more than 10 seconds', 'Never wait at school gates with the engine running'],
    why: 'Idling burns fuel for zero distance and pumps exhaust exactly where children gather.',
  },
  {
    id: 'energy_routine',
    pillar: 'routine',
    tier: 'free',
    title: 'Cut standby power and shift heavy appliances',
    applies: () => true,
    mods: () => ({ kwhSavedPerDay: 0.6 }),
    steps: [
      'Switch off TVs, set-top boxes and chargers at the wall',
      'Run washing machines with full loads',
      'Use a timer on water heaters',
    ],
    why: 'Most winter electricity comes from coal power plants, which add to regional smog.',
  },
  // --- Indoor air quality hacks ----------------------------------------------------------
  {
    id: 'wet_mop',
    pillar: 'indoor',
    tier: 'free',
    title: 'Wet-mop and dust with a damp cloth daily',
    applies: () => true,
    mods: () => ({ wetMop: true }),
    steps: [
      'Damp-mop floors instead of sweeping',
      'Wipe window sills where smog dust settles',
      'Leave shoes at the door',
    ],
    why: 'Dry sweeping kicks fine dust back into the air; a damp cloth traps it.',
  },
  {
    id: 'no_incense',
    pillar: 'indoor',
    tier: 'free',
    title: 'Pause incense and mosquito coils on smog days',
    applies: ({ profile }) => profile.home.incense,
    mods: () => ({ noIncense: true }),
    steps: [
      'Use an electric diya or LED lamp for prayers',
      'Switch coils to nets or plug-in vaporisers',
      'If you burn incense, open a window in the clean window',
    ],
    why: 'One incense stick can push indoor PM2.5 above a busy roadside for an hour.',
  },
  {
    id: 'smoke_free',
    pillar: 'indoor',
    tier: 'free',
    title: 'Make the home 100% smoke-free',
    applies: ({ profile }) => profile.home.indoorSmoking,
    mods: () => ({ noSmoking: true }),
    steps: ['Smoke only outside, away from doors', 'Never smoke near children or in the car'],
    why: 'Second-hand smoke is the largest avoidable indoor source of PM2.5.',
  },
  {
    id: 'kitchen_capture',
    pillar: 'indoor',
    tier: 'free',
    title: 'Capture cooking smoke at the source',
    applies: ({ profile }) => COMBUSTION_FUELS.has(profile.home.cookingFuel),
    mods: () => ({ cookingCut: 0.3 }),
    steps: [
      'Run the chimney/exhaust fan from start to 10 minutes after cooking',
      'Cook with lids on',
      'Keep the kitchen door closed',
    ],
    why: 'Burning fuel and frying release bursts of fine particles that spread through the home.',
  },
  {
    id: 'seal_drafts',
    pillar: 'indoor',
    tier: 'low',
    title: 'Seal window and door gaps with weather-strip',
    applies: ({ profile }) => ['natural', 'exhaust'].includes(profile.home.ventilation),
    mods: () => ({ achMultiplier: 0.6 }),
    steps: [
      'Fit foam strips on window frames',
      'Add a door-bottom draft stopper',
      'Keep up the daily airing in the clean window',
    ],
    why: 'Most smog enters through gaps; sealing them also keeps the home warmer.',
  },
  {
    id: 'diy_purifier',
    pillar: 'indoor',
    tier: 'low',
    title: 'Build a DIY box-fan air cleaner for the bedroom',
    applies: ({ profile }) => profile.home.purifier === 'none',
    mods: () => ({ bedroomCadr: 200 }),
    steps: [
      'Tape a MERV-13 / HEPA-grade filter to the back of a box or pedestal fan',
      'Run it in the bedroom all night with the door closed',
      'Replace the filter when it turns grey',
    ],
    why: 'Children and older adults spend 9–10 hours a night in the bedroom, which makes it the best room to clean first.',
  },
  {
    id: 'bedroom_purifier',
    pillar: 'indoor',
    tier: 'medium',
    title: 'Get a HEPA purifier for the bedroom',
    applies: ({ profile }) => profile.home.purifier === 'none',
    mods: () => ({ bedroomCadr: 300 }),
    steps: [
      'Choose CADR ≥ 300 m³/h (≈ 5 air changes/hour for a 12 m² room)',
      'Run on auto/high overnight, door closed',
      'Check the filter every 3 months in smog season',
    ],
    why: 'A true-HEPA unit sized to the room removes over 99% of particles that pass through it.',
  },
  {
    id: 'purifier_schedule',
    pillar: 'indoor',
    tier: 'free',
    title: 'Run your purifier on a smarter schedule',
    applies: ({ profile }) => profile.home.purifier !== 'none',
    mods: ({ profile }) => ({ bedroomCadr: profile.home.purifierCadr }),
    steps: [
      'Move it to the bedroom 1 hour before sleep, door closed',
      'Run it on high during peak smog hours',
      'Turn it down, not off, during the clean window',
    ],
    why: 'The same machine cleans a closed bedroom several times faster than an open living room.',
  },
  {
    id: 'second_purifier',
    pillar: 'indoor',
    tier: 'medium',
    title: 'Add a second purifier for the living area',
    applies: ({ profile }) => profile.home.purifier === 'one',
    mods: () => ({ homeCadrExtra: 150 }),
    steps: ['Place it where the family spends the evening', 'Run it 12 hours a day in smog season'],
    why: 'Daytime exposure happens in shared rooms, so one bedroom unit can’t cover it.',
  },
  {
    id: 'filtered_ventilation',
    pillar: 'indoor',
    tier: 'high',
    title: 'Install filtered fresh-air ventilation',
    applies: ({ profile }) => profile.home.ventilation !== 'mechanical',
    mods: () => ({ ventilation: 'mechanical' }),
    steps: [
      'Ask for an ERV/HRV with a MERV-13+ filter on the intake',
      'Keep slight positive pressure so unfiltered air can’t leak in',
    ],
    why: 'You get fresh air without the smog: outdoor particles are filtered before they come in.',
  },
  {
    id: 'plants_myth',
    pillar: 'indoor',
    tier: 'free',
    title: 'Keep plants for joy, not as an air purifier',
    applies: () => true,
    mods: () => ({}),
    steps: [
      'Enjoy snake plants and pothos for wellbeing',
      'Don’t rely on them for PM2.5; overwatering can even add mould',
    ],
    why: 'Studies show you would need hundreds of plants per room to match one small purifier.',
  },
  // --- Sustainable alternatives ----------------------------------------------------------
  {
    id: 'transit_commute',
    pillar: 'swap',
    tier: 'free',
    title: 'Switch the daily commute to metro, bus or cycling',
    applies: ({ profile }) => commutes(profile) && COMMUTE_MODES[profile.commute.mode].co2PerKm > 0.05,
    mods: ({ profile }) => ({ commuteMode: transitAlternative(profile.commute.distanceKm) }),
    steps: ['Try it two days a week first', 'Use a monthly pass', 'Wear an N95 on walk/cycle legs on red days'],
    why: 'Public transport moves many people per vehicle, and metro carriages often have lower particle levels than roadside air.',
  },
  {
    id: 'ev_commute',
    pillar: 'swap',
    tier: 'high',
    title: 'Go electric for the vehicle you keep',
    applies: ({ profile }) =>
      commutes(profile) && COMMUTE_MODES[profile.commute.mode].private && profile.commute.mode !== 'ev',
    mods: () => ({ commuteMode: 'ev' }),
    steps: ['Start with an e-scooter for short trips', 'Charge off-peak or with rooftop solar'],
    why: 'EVs emit no exhaust on your street, which matters most in smog season.',
  },
  {
    id: 'clean_cooking_lpg',
    pillar: 'swap',
    tier: 'low',
    title: 'Move from solid fuel or kerosene to LPG',
    applies: ({ profile }) => DIRTY_FUELS.has(profile.home.cookingFuel),
    mods: () => ({ cookingFuel: 'lpg' }),
    steps: [
      'Check subsidised LPG connection schemes (e.g. PM Ujjwala in India)',
      'Keep a backup cylinder so you don’t slip back to wood',
    ],
    why: 'Solid-fuel smoke is the most harmful indoor exposure for children under five.',
  },
  {
    id: 'induction',
    pillar: 'swap',
    tier: 'medium',
    title: 'Cook on induction',
    applies: ({ profile }) => profile.home.cookingFuel !== 'induction',
    mods: () => ({ cookingFuel: 'induction' }),
    steps: ['Start with a single plug-in induction plate', 'Use flat-bottomed steel or cast-iron pans'],
    why: 'Induction burns nothing indoors, so there’s no combustion smoke or NO2.',
  },
  {
    id: 'clean_heating',
    pillar: 'swap',
    tier: 'low',
    title: 'Replace the angithi / kerosene heater with an electric one',
    applies: ({ profile }) => SMOKY_HEATING.has(profile.home.heating),
    mods: () => ({ heating: 'electric' }),
    steps: [
      'Oil-filled radiators are safe overnight',
      'Never sleep in a closed room with a burning fire (carbon monoxide risk)',
    ],
    why: 'Open fires and kerosene heaters fill closed rooms with soot and carbon monoxide.',
  },
  {
    id: 'warm_layers',
    pillar: 'swap',
    tier: 'free',
    title: 'Heat people, not rooms',
    applies: ({ profile }) => profile.home.heating !== 'none',
    mods: () => ({ heatingCut: 0.25 }),
    steps: ['Thermal curtains at dusk', 'Layered clothing and warm bedding', 'Heat one room the family shares'],
    why: 'Each hour the heater stays off saves fuel and, for combustion heaters, indoor smoke.',
  },
  {
    id: 'green_cleaning',
    pillar: 'swap',
    tier: 'free',
    title: 'Swap sprays and air fresheners for simple cleaners',
    applies: () => true,
    mods: () => ({}),
    steps: [
      'Vinegar, baking soda and soap handle most cleaning',
      'Skip aerosol fresheners: they react with ozone to make fine particles',
    ],
    why: 'Scented sprays release VOCs that form secondary particles indoors.',
  },
];

const tierRank = (tier) => BUDGET_TIERS.indexOf(tier);
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Evaluates every applicable, affordable action against the model.
 *
 * @param {Ctx} ctx
 * @returns {Array<{id: string, pillar: string, tier: string, title: string, steps: string[], why: string,
 *   mods: object, metrics: {group: string, beforeUgM3: number, afterUgM3: number, pctReduction: number,
 *   doseSavedUgPerDay: number, co2KgPerMonth: number}, score: number}>}
 */
export function evaluateActions(ctx) {
  const { profile, air } = ctx;
  const budget = tierRank(profile.lifestyle.budget);
  const baseline = householdExposure(profile, air);
  const baseCo2 = householdCo2(profile);
  const focus = mostVulnerable(profile);

  const results = [];
  for (const def of ACTIONS) {
    if (tierRank(def.tier) > budget || !def.applies(ctx)) continue;
    const mods = def.mods(ctx);
    const metrics = measure({ profile, air, baseline, baseCo2, focus }, mods);
    // Never recommend something that raises exposure, or that adds CO2 without a health gain.
    // (Wood -> LPG adds a little fossil CO2 but removes the worst indoor smoke: kept, flagged in the UI.)
    if (metrics.doseSavedUgPerDay < 0 || (metrics.co2KgPerMonth < -1 && metrics.doseSavedUgPerDay <= 0)) continue;
    const { id, pillar, tier, title, steps, why } = def;
    const score = metrics.doseSavedUgPerDay + metrics.co2KgPerMonth * 20;
    results.push({ id, pillar, tier, title, steps, why, mods, metrics, score });
  }
  return results.sort((a, b) => b.score - a.score);
}

const pct = (before, after) => (before > 0 ? round1(((before - after) / before) * 100) : 0);

/**
 * Before/after metrics for one set of mods, reported for the household member
 * who benefits most (ties go to the most vulnerable, `focus`).
 */
export function measure({ profile, air, baseline, baseCo2, focus }, mods) {
  const after = householdExposure(profile, air, mods);
  const gain = (id) => pct(baseline.groups[id].meanUgM3, after.groups[id].meanUgM3);
  const group = Object.keys(baseline.groups).reduce((best, id) => (gain(id) > gain(best) + 0.05 ? id : best), focus);
  const before = baseline.groups[group];
  const now = after.groups[group];
  return {
    group,
    beforeUgM3: before.meanUgM3,
    afterUgM3: now.meanUgM3,
    pctReduction: pct(before.meanUgM3, now.meanUgM3),
    doseSavedUgPerDay: baseline.totalDoseUg - after.totalDoseUg,
    co2KgPerMonth: baseCo2 - householdCo2(profile, mods),
  };
}

/** Rules for merging mods from several actions into one "whole plan" scenario. */
const MERGE = {
  bedroomCadr: Math.max,
  homeCadrExtra: Math.max,
  cookingCut: Math.max,
  heatingCut: Math.max,
  achMultiplier: Math.min,
  carpoolShare: Math.max,
  kwhSavedPerDay: Math.max,
};
const cleanerFuel = (a, b) => (COOKING_FUELS[a].pm25Increment <= COOKING_FUELS[b].pm25Increment ? a : b);
const cleanerHeat = (a, b) => (HEATING[a].pm25Increment <= HEATING[b].pm25Increment ? a : b);
const lowerCo2Mode = (a, b) => (COMMUTE_MODES[a].co2PerKm <= COMMUTE_MODES[b].co2PerKm ? a : b);

/** Combines the mods of several actions, keeping the strongest of each kind. */
export function mergeMods(modsList) {
  const merged = {};
  for (const mods of modsList) {
    for (const [key, value] of Object.entries(mods)) {
      if (merged[key] === undefined) merged[key] = value;
      else if (MERGE[key]) merged[key] = MERGE[key](merged[key], value);
      else if (key === 'cookingFuel') merged[key] = cleanerFuel(merged[key], value);
      else if (key === 'heating') merged[key] = cleanerHeat(merged[key], value);
      else if (key === 'commuteMode') merged[key] = lowerCo2Mode(merged[key], value);
      else if (typeof value === 'number') merged[key] = Math.min(merged[key], value);
      else merged[key] = merged[key] || value;
    }
  }
  return merged;
}
