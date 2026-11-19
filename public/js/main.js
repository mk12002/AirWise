import { ApiError, askAdvisor, createPlan, getHealth, reversePlace, searchPlaces, simulateImpact } from './api.js';
import { h, replaceChildren } from './dom.js';
import { DEMO_PROFILE, fieldIdFor, fillForm, readProfile, setAreaUnit, validateForm } from './form.js';
import { STARTER_QUESTIONS, appendMessage, renderSuggestions } from './panels/chat.js';
import { renderFamily } from './panels/family.js';
import { allActionIds } from './panels/pillars.js';
import { renderImpactCard, renderPlan } from './render.js';
import { loadSession, saveSession } from './storage.js';
import { setupTabs } from './tabs.js';

const $ = (id) => /** @type {any} */ (document.getElementById(id));

/** App state (single source of truth for the controller). */
const state = {
  location: null,
  profile: null,
  plan: null,
  /** @type {Record<string, boolean>} */
  done: {},
  /** @type {Array<{role: 'user' | 'assistant', text: string, lang?: string}>} */
  chat: [],
  /** Action ids the family has committed to (drives the what-if impact). */
  selected: new Set(),
  /** Impact for `selected` when it differs from the full plan. */
  impact: null,
  busy: false,
};

const persist = () =>
  saveSession({
    profile: state.profile,
    plan: state.plan,
    done: state.done,
    chat: state.chat.slice(-12),
    selected: [...state.selected],
    areaUnit: $('area-unit').value,
  });

const SIMULATE_DEBOUNCE_MS = 250;

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// --- Location -------------------------------------------------------------------------

function setLocation(location) {
  state.location = location;
  $('place-selected').textContent = location
    ? `Selected: ${location.name}${location.region ? `, ${location.region}` : ''}`
    : 'No location selected yet.';
  $('place-query').removeAttribute('aria-invalid');
}

async function onSearch() {
  const query = $('place-query').value.trim();
  if (query.length < 2) return toast('Type at least two letters of your city.');
  const results = $('place-results');
  replaceChildren(results, h('p', { className: 'hint' }, 'Searching…'));
  try {
    const { places } = await searchPlaces(query);
    if (places.length === 0) return replaceChildren(results, h('p', null, 'No matches. Try a nearby larger city.'));
    if (places.length === 1) {
      replaceChildren(results);
      return setLocation(places[0]);
    }
    replaceChildren(
      results,
      h(
        'ul',
        { className: 'place-list', 'aria-label': 'Matching places' },
        places.map((place) =>
          h(
            'li',
            null,
            h(
              'button',
              {
                type: 'button',
                className: 'btn btn-ghost place-option',
                onclick: () => {
                  setLocation(place);
                  replaceChildren(results);
                  $('place-selected').focus?.();
                },
              },
              `${place.name}, ${place.region}`,
            ),
          ),
        ),
      ),
    );
  } catch (error) {
    replaceChildren(results, h('p', { className: 'alert alert-error' }, error.message));
  }
}

function onLocate() {
  if (!navigator.geolocation) return toast('Location is not available in this browser.');
  $('place-selected').textContent = 'Finding your location…';
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const point = { lat: Number(coords.latitude.toFixed(4)), lon: Number(coords.longitude.toFixed(4)) };
      const fallback = { name: 'My location', region: `${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}`, ...point };
      setLocation(fallback);
      const place = await reversePlace(point.lat, point.lon);
      // Only apply the name if the user hasn't picked another place meanwhile.
      if (place && state.location === fallback) setLocation({ ...place, ...point });
    },
    () => {
      setLocation(state.location);
      toast('Could not get your location. Search for your city instead.');
    },
    { timeout: 10_000, maximumAge: 600_000 },
  );
}

// --- Plan ------------------------------------------------------------------------------

/** Shows a temporary service problem (not the family's fault) with a retry button. */
function showServiceError(message) {
  const box = $('form-errors');
  for (const el of document.querySelectorAll('[aria-invalid="true"]')) el.removeAttribute('aria-invalid');
  replaceChildren(
    box,
    h('p', null, h('strong', null, 'Something went wrong on our side')),
    h('p', null, message),
    h(
      'button',
      { type: 'button', className: 'btn btn-secondary', onclick: () => $('profile-form').requestSubmit() },
      'Try again',
    ),
  );
  box.hidden = false;
  box.focus();
}

function showErrors(problems) {
  const box = $('form-errors');
  for (const el of document.querySelectorAll('[aria-invalid="true"]')) el.removeAttribute('aria-invalid');
  if (problems.length === 0) {
    box.hidden = true;
    return;
  }
  for (const p of problems) $(p.id)?.setAttribute('aria-invalid', 'true');
  replaceChildren(
    box,
    h('p', null, h('strong', null, 'Please fix the following:')),
    h(
      'ul',
      null,
      problems.map((p) => h('li', null, h('a', { href: `#${p.id}` }, p.message))),
    ),
  );
  box.hidden = false;
  box.focus();
}

function setView(view) {
  $('setup-section').hidden = view !== 'setup';
  $('loading').hidden = view !== 'loading';
  $('results').hidden = view !== 'results';
}

async function buildPlan(profile) {
  if (state.busy) return;
  state.busy = true;
  setView('loading');
  try {
    const { plan } = await createPlan(profile);
    const isNewDay = state.plan?.generatedAt?.slice(0, 10) !== plan.generatedAt.slice(0, 10);
    state.profile = profile;
    state.plan = plan;
    state.selected = new Set(allActionIds(plan));
    state.impact = null;
    if (isNewDay) state.done = {};
    persist();
    showPlan();
  } catch (error) {
    setView('setup');
    const details = error instanceof ApiError ? error.details : [];
    const mapped = details.map((d) => ({
      id: fieldIdFor(d.field) ?? 'profile-form',
      message: `${d.field}: ${d.message}`,
    }));
    if (mapped.length) showErrors(mapped);
    else showServiceError(error.message);
  } finally {
    state.busy = false;
  }
}

// --- What-if simulator -------------------------------------------------------------------

let simulateTimer;
let simulateSeq = 0;

/** Recomputes impact for the chosen actions on the server (debounced, stale replies ignored). */
function scheduleSimulate() {
  clearTimeout(simulateTimer);
  const everything = allActionIds(state.plan).every((id) => state.selected.has(id));
  if (everything) {
    state.impact = null;
    renderImpactCard(state.plan, state.plan.impact, state.selected);
    return;
  }
  renderImpactCard(state.plan, state.impact ?? state.plan.impact, state.selected, true);
  simulateTimer = setTimeout(async () => {
    const seq = (simulateSeq += 1);
    try {
      const { impact } = await simulateImpact(state.profile, [...state.selected]);
      if (seq !== simulateSeq) return;
      state.impact = impact;
      renderImpactCard(state.plan, impact, state.selected);
    } catch (error) {
      if (seq === simulateSeq) toast(`Could not update the impact: ${error.message}`);
    }
  }, SIMULATE_DEBOUNCE_MS);
}

/** Updates one toggle in place so keyboard focus stays on it. */
function syncToggle(id) {
  const on = state.selected.has(id);
  const button = document.querySelector(`[data-action="${id}"]`);
  if (!button) return;
  button.setAttribute('aria-pressed', String(on));
  button.classList.toggle('is-on', on);
  button.textContent = on ? '✓ In my plan' : '+ Add to my plan';
}

const handlers = {
  get done() {
    return state.done;
  },
  get selected() {
    return state.selected;
  },
  get impact() {
    return state.impact;
  },
  onSelect(id) {
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    syncToggle(id);
    persist();
    scheduleSimulate();
  },
  onPrint() {
    document.body.classList.add('print-checklist');
    window.print();
    document.body.classList.remove('print-checklist');
  },
  onToggle(id, checked) {
    state.done[id] = checked;
    persist();
    renderFamily($('panel-family'), state.plan, handlers);
    document.getElementById(`chk-${id}`)?.focus();
  },
  async onCopy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied. Paste it into your group chat.');
    } catch {
      toast('Copy failed. Select the text and copy it manually.');
    }
  },
};

function showPlan() {
  renderPlan(state.plan, handlers);
  replaceChildren($('chat-log'));
  for (const message of state.chat) appendMessage($('chat-log'), message);
  renderSuggestions($('chat-suggestions'), STARTER_QUESTIONS, ask);
  setView('results');
  $('results-title').focus();
}

// --- Chat ------------------------------------------------------------------------------

async function ask(question) {
  const message = question.trim();
  if (!message || !state.profile) return;
  const log = $('chat-log');
  const history = state.chat.slice(-8);
  state.chat.push({ role: 'user', text: message });
  appendMessage(log, { role: 'user', text: message });
  const pending = appendMessage(log, { role: 'assistant', text: 'Thinking…', pending: true });
  $('chat-input').value = '';
  try {
    const result = await askAdvisor(state.profile, message, history);
    pending.remove();
    const reply = { role: /** @type {const} */ ('assistant'), text: result.reply, lang: result.lang };
    state.chat.push(reply);
    appendMessage(log, reply);
    renderSuggestions($('chat-suggestions'), result.followUps?.length ? result.followUps : STARTER_QUESTIONS, ask);
    persist();
  } catch (error) {
    pending.remove();
    appendMessage(log, { role: 'assistant', text: `Sorry, ${error.message}` });
  }
}

// --- Wiring ----------------------------------------------------------------------------

/** Wires the page and restores any saved session. Exported so tests can boot a fresh document. */
export function init() {
  const form = /** @type {HTMLFormElement} */ ($('profile-form'));
  setupTabs(document.querySelector('[role="tablist"]'));

  $('place-search').addEventListener('click', onSearch);
  $('place-query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSearch();
    }
  });
  $('place-locate').addEventListener('click', onLocate);
  $('area-unit').addEventListener('change', (e) => {
    setAreaUnit(form, e.target.value);
    persist();
  });
  $('purifier').addEventListener('change', (e) => {
    $('cadr-field').hidden = e.target.value === 'none';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const problems = validateForm(form, state.location);
    showErrors(problems);
    if (problems.length === 0) buildPlan(readProfile(form, state.location));
  });
  $('demo-btn').addEventListener('click', () => {
    fillForm(form, DEMO_PROFILE);
    setLocation(DEMO_PROFILE.location);
    buildPlan(structuredClone(DEMO_PROFILE));
  });
  $('edit-btn').addEventListener('click', () => {
    setView('setup');
    $('setup-title').scrollIntoView?.();
    $('adults').focus();
  });
  $('refresh-btn').addEventListener('click', () => state.profile && buildPlan(state.profile));
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    ask($('chat-input').value);
  });

  const saved = loadSession();
  if (saved?.areaUnit === 'sqft') setAreaUnit(form, 'sqft');
  if (saved?.profile) {
    fillForm(form, saved.profile);
    setLocation(saved.profile.location);
    Object.assign(state, {
      profile: saved.profile,
      plan: saved.plan ?? null,
      done: saved.done ?? {},
      chat: saved.chat ?? [],
    });
    if (state.plan) {
      const ids = allActionIds(state.plan);
      state.selected = new Set(Array.isArray(saved.selected) ? saved.selected.filter((id) => ids.includes(id)) : ids);
      showPlan();
      scheduleSimulate();
    }
  }

  getHealth()
    .then(({ ai, model }) => {
      const badge = $('ai-status');
      badge.textContent = ai ? `Gemini AI on · ${model}` : 'AI offline: template mode';
      badge.className = `badge ${ai ? 'badge-ok' : 'badge-muted'}`;
    })
    .catch(() => {
      $('ai-status').textContent = 'Server unreachable';
    });
}

init();
