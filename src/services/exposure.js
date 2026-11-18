import { COMMUTE_MODES, COOKING_FUELS, GROUPS, HEATING, OTHER_SOURCES, PHYSICS, VENTILATION } from '../constants.js';

/*
 * Deterministic exposure and emissions model.
 *
 * Indoor air uses the standard single-zone steady-state mass balance:
 *
 *   C_in = (P · a · C_out + G) / (a + k + CADR / V)
 *
 * P = particle penetration, a = air changes per hour, k = deposition,
 * G = indoor source generation, CADR/V = purifier clean-air delivery per volume.
 * A closed bedroom with its own purifier is a second zone fed by the home.
 *
 * Personal exposure is the time-weighted mean over bedroom, rest of home,
 * outdoors and commute; inhaled dose multiplies by breathing rate. Every
 * recommendation is a set of `mods` applied to this model, so its impact is a
 * real before/after difference rather than an invented number.
 */

/**
 * @typedef {object} Mods
 * @property {string} [cookingFuel]      replace the cooking fuel
 * @property {number} [cookingCut]       share of cooking emissions captured (lids, exhaust)
 * @property {string} [heating]          replace the heating source
 * @property {number} [heatingCut]       share of heating hours avoided
 * @property {boolean} [noIncense]
 * @property {boolean} [noSmoking]
 * @property {boolean} [wetMop]
 * @property {number} [achMultiplier]    draft sealing (< 1)
 * @property {string} [ventilation]      replace the ventilation type
 * @property {number} [homeCadrExtra]    extra 24-h-average purifier CADR in living areas (m³/h)
 * @property {number} [bedroomCadr]      purifier running all night in a closed bedroom (m³/h)
 * @property {number} [airingAt]         PM2.5 when windows are aired (best window)
 * @property {number} [exerciseConc]     PM2.5 during the daily outdoor workout
 * @property {number} [errandConc]       PM2.5 during one hour of errands
 * @property {string} [commuteMode]
 * @property {number} [carpoolShare]     people sharing the car
 * @property {boolean} [noIdling]
 * @property {number} [kwhSavedPerDay]
 */

const round1 = (value) => Math.round(value * 10) / 10;

/** Purifier CADR averaged over a day in the shared living space, as currently used. */
function baselineHomeCadr(home) {
  if (home.purifier === 'none') return 0;
  const units = home.purifier === 'multiple' ? 2 : 1;
  // Typical use: a few hours a day, door open, in the living room.
  return (units * home.purifierCadr * 6) / 24;
}

/** Total indoor source increment (µg/m³ at the reference removal rate). */
function sourceIncrement(home, mods) {
  const cooking = COOKING_FUELS[mods.cookingFuel ?? home.cookingFuel].pm25Increment * (1 - (mods.cookingCut ?? 0));
  const heating = HEATING[mods.heating ?? home.heating].pm25Increment * (1 - (mods.heatingCut ?? 0));
  const incense = home.incense && !mods.noIncense ? OTHER_SOURCES.incense.pm25Increment : 0;
  const smoking = home.indoorSmoking && !mods.noSmoking ? OTHER_SOURCES.smoking.pm25Increment : 0;
  const dust = PHYSICS.dustIncrement * (mods.wetMop ? 1 - PHYSICS.wetMopShare : 1);
  return cooking + heating + incense + smoking + dust;
}

/**
 * Steady-state indoor PM2.5 in the main living space and the bedroom.
 * @param {object} home validated profile.home
 * @param {number} outdoor 24-h mean outdoor PM2.5
 * @param {Mods} [mods]
 */
export function indoorConcentrations(home, outdoor, mods = {}) {
  const vent = VENTILATION[mods.ventilation ?? home.ventilation];
  const volume = home.areaSqm * PHYSICS.ceilingHeightM;
  const ach = vent.ach * (mods.achMultiplier ?? 1);
  const cadr = (baselineHomeCadr(home) + (mods.homeCadrExtra ?? 0)) * PHYSICS.purifierEffectiveness;
  const removal = ach + PHYSICS.depositionRate + cadr / volume;
  const generation = sourceIncrement(home, mods) * PHYSICS.referenceRemoval;

  let living = (vent.penetration * ach * outdoor + generation) / removal;
  if (mods.airingAt !== undefined) {
    // Airing at the cleanest hour instead of a random one brings in less smog.
    const avoided = (PHYSICS.airingAch * PHYSICS.airingHours * Math.max(0, outdoor - mods.airingAt)) / (24 * removal);
    living = Math.max(0, living - avoided);
  }

  const bedroomVolume = PHYSICS.bedroomAreaSqm * PHYSICS.ceilingHeightM;
  const exchange = mods.bedroomCadr ? PHYSICS.bedroomDoorClosedExchange : PHYSICS.bedroomDoorOpenExchange;
  const bedroom =
    (exchange * living) /
    (exchange + PHYSICS.depositionRate + ((mods.bedroomCadr ?? 0) * PHYSICS.purifierEffectiveness) / bedroomVolume);

  return { living: round1(living), bedroom: round1(bedroom) };
}

/** Daily hours on the road for the household's main commuter. */
function commuteHours(commute, mode) {
  if (mode === 'wfh' || commute.daysPerWeek === 0 || commute.distanceKm === 0) return 0;
  const roundTrip = Math.min(4, (2 * commute.distanceKm) / PHYSICS.commuteSpeedKmh);
  return (roundTrip * commute.daysPerWeek) / 7;
}

/**
 * Time-weighted exposure and inhaled dose for one person in `groupId`.
 * @param {'adult'|'child'|'elderly'} groupId
 */
function personExposure(groupId, ctx) {
  const group = GROUPS[groupId];
  const { indoor, outdoor, mods, profile, exercisePm } = ctx;
  const commute = groupId === 'adult' ? commuteHours(profile.commute, mods.commuteMode ?? profile.commute.mode) : 0;
  const mode = COMMUTE_MODES[mods.commuteMode ?? profile.commute.mode];
  const home = 24 - group.bedroom - group.outdoor - commute;

  // One outdoor hour may be an errand or workout timed by the plan.
  const exercising = groupId === 'adult' && profile.lifestyle.outdoorExercise !== 'none';
  const timedHourPm = exercising ? (mods.exerciseConc ?? exercisePm) : (mods.errandConc ?? outdoor);
  const timedBreathing = exercising ? group.exerciseBreathing : group.breathing;

  const concHours =
    group.bedroom * indoor.bedroom +
    home * indoor.living +
    (group.outdoor - 1) * outdoor +
    timedHourPm +
    commute * outdoor * mode.exposureFactor;
  const dose = group.breathing * (concHours - timedHourPm) + timedBreathing * timedHourPm;
  const meanUgM3 = concHours / 24;
  return {
    meanUgM3: round1(meanUgM3),
    doseUg: Math.round(dose),
    cigarettesPerDay: round1(meanUgM3 / PHYSICS.cigaretteUgM3),
  };
}

/**
 * Exposure for every group present in the household.
 *
 * @param {object} profile validated profile
 * @param {{avgPm25: number, exercisePm: number}} air outdoor 24-h mean and mean during the exercise slot
 * @param {Mods} [mods]
 */
export function householdExposure(profile, air, mods = {}) {
  const outdoor = air.avgPm25;
  const indoor = indoorConcentrations(profile.home, outdoor, mods);
  const ctx = { indoor, outdoor, mods, profile, exercisePm: air.exercisePm };
  const counts = {
    adult: profile.household.adults,
    child: profile.household.children,
    elderly: profile.household.elderly,
  };

  const groups = {};
  let totalDoseUg = 0;
  for (const [id, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const person = personExposure(/** @type {'adult'|'child'|'elderly'} */ (id), ctx);
    groups[id] = { ...person, count };
    totalDoseUg += person.doseUg * count;
  }
  return { indoor, groups, totalDoseUg };
}

/** The household member most at risk: children, then older adults, then adults. */
export function mostVulnerable(profile) {
  if (profile.household.children > 0) return 'child';
  if (profile.household.elderly > 0) return 'elderly';
  return 'adult';
}

/**
 * Household CO2e in kg/month for commuting, cooking and heating.
 * @param {object} profile
 * @param {Mods} [mods]
 */
export function householdCo2(profile, mods = {}) {
  const { commute, home } = profile;
  const mode = COMMUTE_MODES[mods.commuteMode ?? commute.mode];
  const monthlyKm = 2 * commute.distanceKm * commute.daysPerWeek * PHYSICS.weeksPerMonth;
  const sharing = mode.private && mods.carpoolShare ? mods.carpoolShare : 1;
  const commuteKg = (monthlyKm * mode.co2PerKm) / sharing;

  const idlingKg =
    mode.private && mode.motorised && mode.co2PerKm > 0.1 && !mods.noIdling
      ? // ~10 minutes of idling at signals / school gates per commuting day
        (PHYSICS.idleLitresPerHour / 6) * PHYSICS.co2PerLitre * commute.daysPerWeek * PHYSICS.weeksPerMonth
      : 0;

  const cookingKg = COOKING_FUELS[mods.cookingFuel ?? home.cookingFuel].co2KgPerDay * 30;
  const heatingKg = HEATING[mods.heating ?? home.heating].co2KgPerDay * 30 * (1 - (mods.heatingCut ?? 0));
  const savedKg = (mods.kwhSavedPerDay ?? 0) * PHYSICS.gridKgPerKwh * 30;

  return Math.round(commuteKg + idlingKg + cookingKg + heatingKg - savedKg);
}
