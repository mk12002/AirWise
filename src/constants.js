/*
 * Domain constants for the exposure and emissions engine.
 *
 * Numbers are deliberately conservative, published-order-of-magnitude
 * estimates (sources listed in docs/methodology.md). They are used for
 * *relative* comparisons ("this swap cuts your child's dose by ~30%"), not as
 * medical measurements, and the UI says so.
 */

/** Commute modes with CO2e per passenger-km and in-transit exposure vs ambient air. */
export const COMMUTE_MODES = Object.freeze({
  car_petrol: { label: 'Petrol car', co2PerKm: 0.17, exposureFactor: 0.8, motorised: true, private: true },
  car_diesel: { label: 'Diesel car', co2PerKm: 0.17, exposureFactor: 0.8, motorised: true, private: true },
  car_cng: { label: 'CNG car', co2PerKm: 0.13, exposureFactor: 0.8, motorised: true, private: true },
  two_wheeler: { label: 'Motorbike / scooter', co2PerKm: 0.06, exposureFactor: 1.3, motorised: true, private: true },
  auto_rickshaw: { label: 'Auto-rickshaw / taxi', co2PerKm: 0.1, exposureFactor: 1.2, motorised: true, private: false },
  ev: { label: 'Electric car / scooter', co2PerKm: 0.05, exposureFactor: 0.8, motorised: true, private: true },
  bus: { label: 'Bus', co2PerKm: 0.04, exposureFactor: 1.1, motorised: true, private: false },
  metro: { label: 'Metro / train', co2PerKm: 0.03, exposureFactor: 0.6, motorised: true, private: false },
  cycle_walk: { label: 'Cycle / walk', co2PerKm: 0, exposureFactor: 1.2, motorised: false, private: false },
  wfh: { label: 'Work / study from home', co2PerKm: 0, exposureFactor: 0, motorised: false, private: false },
});

/**
 * Household combustion sources: 24-hour-average indoor PM2.5 added at a
 * reference removal rate, plus daily household CO2e.
 */
export const COOKING_FUELS = Object.freeze({
  biomass: { label: 'Wood / dung / crop waste', pm25Increment: 250, co2KgPerDay: 0.8 },
  coal: { label: 'Coal', pm25Increment: 150, co2KgPerDay: 3.5 },
  kerosene: { label: 'Kerosene', pm25Increment: 60, co2KgPerDay: 1.9 },
  lpg: { label: 'LPG cylinder', pm25Increment: 10, co2KgPerDay: 1.4 },
  piped_gas: { label: 'Piped natural gas', pm25Increment: 8, co2KgPerDay: 1.2 },
  induction: { label: 'Induction / electric', pm25Increment: 3, co2KgPerDay: 1.1 },
});

export const HEATING = Object.freeze({
  none: { label: 'No heating', pm25Increment: 0, co2KgPerDay: 0 },
  electric: { label: 'Electric heater', pm25Increment: 0, co2KgPerDay: 4 },
  gas: { label: 'Gas heater', pm25Increment: 5, co2KgPerDay: 3 },
  kerosene: { label: 'Kerosene heater', pm25Increment: 40, co2KgPerDay: 4.5 },
  wood_coal: { label: 'Wood / coal / angithi', pm25Increment: 80, co2KgPerDay: 6 },
});

/** Air changes per hour and outdoor-particle penetration by ventilation type. */
export const VENTILATION = Object.freeze({
  sealed: { label: 'Well sealed, windows kept shut', ach: 0.3, penetration: 0.8 },
  natural: { label: 'Leaky windows / doors (typical)', ach: 0.8, penetration: 0.8 },
  exhaust: { label: 'Kitchen / bath exhaust fans', ach: 1.0, penetration: 0.8 },
  mechanical: { label: 'Filtered fresh-air system', ach: 1.5, penetration: 0.3 },
});

export const OTHER_SOURCES = Object.freeze({
  incense: { label: 'Incense / mosquito coils', pm25Increment: 15 },
  smoking: { label: 'Indoor smoking', pm25Increment: 30 },
});

export const BUDGET_TIERS = Object.freeze(['free', 'low', 'medium', 'high']);
export const EXERCISE_TIMES = Object.freeze(['none', 'morning', 'evening', 'flexible']);
export const PURIFIER_OPTIONS = Object.freeze(['none', 'one', 'multiple']);

/** Local hours each preference maps to when looking up the forecast. */
export const EXERCISE_HOURS = Object.freeze({ morning: [6, 9], evening: [17, 20] });

export const PHYSICS = Object.freeze({
  /** Particle deposition loss rate indoors (1/h). */
  depositionRate: 0.2,
  /** Removal rate at which source increments are defined (natural ACH + deposition). */
  referenceRemoval: 1.0,
  ceilingHeightM: 2.6,
  bedroomAreaSqm: 12,
  /** Air exchange between a closed bedroom and the rest of the home (1/h). */
  bedroomDoorClosedExchange: 1.0,
  /** Real-world purifier effectiveness vs rated CADR (auto/low fan modes, bypass, filter loading). */
  purifierEffectiveness: 0.6,
  bedroomDoorOpenExchange: 3,
  /** Indoor PM2.5 from resuspended dust (µg/m³) and the share daily wet mopping removes. */
  dustIncrement: 8,
  wetMopShare: 0.5,
  /** Extra air changes and duration of one daily window-airing session. */
  airingAch: 3,
  airingHours: 0.5,
  /** Average commute speed used to turn km into time on the road (km/h). */
  commuteSpeedKmh: 25,
  /** Fuel burnt idling (litres/hour) and CO2 per litre of petrol (kg). */
  idleLitresPerHour: 0.6,
  co2PerLitre: 2.3,
  /** Berkeley Earth rule of thumb: 22 µg/m³ PM2.5 for 24 h ≈ 1 cigarette. */
  cigaretteUgM3: 22,
  /** Grid CO2e (kg/kWh), a mid-range global/South-Asian value. */
  gridKgPerKwh: 0.7,
  weeksPerMonth: 4.33,
});

/** Hours per day in each micro-environment and breathing rates (m³/h). */
export const GROUPS = Object.freeze({
  adult: { label: 'Adult', bedroom: 8, outdoor: 1.5, breathing: 0.65, exerciseBreathing: 2.5 },
  child: { label: 'Child', bedroom: 10, outdoor: 3, breathing: 0.45, exerciseBreathing: 1.5 },
  elderly: { label: 'Older adult', bedroom: 9, outdoor: 1, breathing: 0.55, exerciseBreathing: 1.6 },
});

export const AI_TEXT_LIMITS = Object.freeze({ short: 140, medium: 400, long: 900 });
