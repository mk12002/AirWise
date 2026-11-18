/*
 * Reads and fills the household form. The server validates everything again;
 * the client checks only what it needs to give instant, field-level feedback.
 */

/** Demo household for the "Try a demo family" button and the video walkthrough. */
export const DEMO_PROFILE = Object.freeze({
  location: { name: 'New Delhi', region: 'Delhi, India', countryCode: 'IN', lat: 28.6139, lon: 77.209 },
  household: { adults: 2, children: 1, elderly: 1, respiratory: true, pregnant: false },
  commute: { mode: 'car_petrol', distanceKm: 12, daysPerWeek: 5 },
  home: {
    areaSqm: 90,
    ventilation: 'natural',
    cookingFuel: 'lpg',
    heating: 'electric',
    purifier: 'none',
    purifierCadr: 250,
    incense: true,
    indoorSmoking: false,
  },
  lifestyle: {
    outdoorExercise: 'morning',
    budget: 'medium',
    notes: 'Grandpa walks in the park at 6 am. Our daughter (8) has mild asthma and plays cricket after school.',
    language: 'en',
  },
});

const num = (form, name) => Number(/** @type {HTMLInputElement} */ (form.elements.namedItem(name)).value);
const str = (form, name) => /** @type {HTMLInputElement} */ (form.elements.namedItem(name)).value;
const bool = (form, name) => /** @type {HTMLInputElement} */ (form.elements.namedItem(name)).checked;

/**
 * Builds the API profile from the form and the chosen location.
 * @param {HTMLFormElement} form
 * @param {object | null} location
 */
export function readProfile(form, location) {
  const budget = /** @type {HTMLInputElement | null} */ (form.querySelector('input[name="budget"]:checked'));
  return {
    location,
    household: {
      adults: num(form, 'adults'),
      children: num(form, 'children'),
      elderly: num(form, 'elderly'),
      respiratory: bool(form, 'respiratory'),
      pregnant: bool(form, 'pregnant'),
    },
    commute: {
      mode: str(form, 'commuteMode'),
      distanceKm: num(form, 'distanceKm'),
      daysPerWeek: num(form, 'daysPerWeek'),
    },
    home: {
      areaSqm: num(form, 'areaSqm'),
      ventilation: str(form, 'ventilation'),
      cookingFuel: str(form, 'cookingFuel'),
      heating: str(form, 'heating'),
      purifier: str(form, 'purifier'),
      purifierCadr: num(form, 'purifierCadr') || 250,
      incense: bool(form, 'incense'),
      indoorSmoking: bool(form, 'indoorSmoking'),
    },
    lifestyle: {
      outdoorExercise: str(form, 'outdoorExercise'),
      budget: budget?.value ?? 'low',
      notes: str(form, 'notes').trim(),
      language: str(form, 'language'),
    },
  };
}

/** Field name → [id, label] for client-side checks and server error mapping. */
const FIELDS = {
  'household.adults': ['adults', 'Adults must be between 1 and 12'],
  'household.children': ['children', 'Children must be between 0 and 10'],
  'household.elderly': ['elderly', 'Older adults must be between 0 and 10'],
  'commute.distanceKm': ['distance', 'Distance must be between 0 and 150 km'],
  'commute.daysPerWeek': ['days', 'Days per week must be between 0 and 7'],
  'home.areaSqm': ['area', 'Home size must be between 15 and 1000 m²'],
  'home.purifierCadr': ['cadr', 'CADR must be between 50 and 1000 m³/h'],
};

/**
 * Returns `{field, message}` problems found before sending.
 * @param {HTMLFormElement} form
 * @param {object | null} location
 */
export function validateForm(form, location) {
  const problems = [];
  if (!location) problems.push({ id: 'place-query', message: 'Choose your city or use your location' });
  for (const [id, message] of Object.values(FIELDS)) {
    const input = /** @type {HTMLInputElement} */ (form.querySelector(`#${id}`));
    // The CADR input only matters (and is only shown) when the home has a purifier.
    if (id === 'cadr' && /** @type {HTMLElement} */ (form.querySelector('#cadr-field')).hidden) continue;
    const value = Number(input.value);
    const outOfRange = value < Number(input.min) || value > Number(input.max);
    if (input.value.trim() === '' || !Number.isFinite(value) || outOfRange) problems.push({ id, message });
  }
  return problems;
}

/** Maps server-side field paths (e.g. "home.areaSqm") to input ids. */
export function fieldIdFor(path) {
  if (path.startsWith('location')) return 'place-query';
  return FIELDS[path]?.[0] ?? null;
}

/**
 * Writes a profile back into the form (restore or demo).
 * @param {HTMLFormElement} form
 * @param {ReturnType<typeof readProfile>} profile
 */
export function fillForm(form, profile) {
  const set = (name, value) => {
    const el = /** @type {HTMLInputElement} */ (form.elements.namedItem(name));
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = String(value);
  };
  const { household: hh, commute, home, lifestyle } = profile;
  set('adults', hh.adults);
  set('children', hh.children);
  set('elderly', hh.elderly);
  set('respiratory', hh.respiratory);
  set('pregnant', hh.pregnant);
  set('commuteMode', commute.mode);
  set('distanceKm', commute.distanceKm);
  set('daysPerWeek', commute.daysPerWeek);
  set('areaSqm', home.areaSqm);
  set('ventilation', home.ventilation);
  set('cookingFuel', home.cookingFuel);
  set('heating', home.heating);
  set('purifier', home.purifier);
  set('purifierCadr', home.purifierCadr);
  set('incense', home.incense);
  set('indoorSmoking', home.indoorSmoking);
  set('outdoorExercise', lifestyle.outdoorExercise);
  set('notes', lifestyle.notes ?? '');
  set('language', lifestyle.language ?? 'en');
  const radio = /** @type {HTMLInputElement | null} */ (
    form.querySelector(`input[name="budget"][value="${lifestyle.budget}"]`)
  );
  if (radio) radio.checked = true;
  /** @type {HTMLElement} */ (form.querySelector('#cadr-field')).hidden = home.purifier === 'none';
}
