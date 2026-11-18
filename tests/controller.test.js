import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { createAdvisor } from '../src/services/advisor.js';
import { createAirDataClient } from '../src/services/airData.js';
import { profileSchema } from '../src/validation.js';
import { fakeFetch, openMeteoPayloads } from './helpers.js';

/*
 * End-to-end controller tests: the real index.html and main.js run in jsdom.
 * `fetch` is routed to a real advisor (with fake upstream data), so the
 * browser code, API contract and model are exercised together.
 */

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const advisor = createAdvisor({
  airData: createAirDataClient({
    fetchImpl: fakeFetch({
      ...openMeteoPayloads(),
      geo: {
        results: [
          {
            name: 'Lahore',
            admin1: 'Punjab',
            country: 'Pakistan',
            country_code: 'PK',
            latitude: 31.5,
            longitude: 74.3,
          },
          { name: 'Lahore', admin1: 'Virginia', country: 'United States', latitude: 38.2, longitude: -77.9 },
        ],
      },
    }),
  }),
});

const requests = [];
let failNext = null;

/** Minimal in-process backend for the browser code. */
async function backend(url, init = {}) {
  const { pathname, searchParams } = new URL(url, 'http://localhost');
  const body = init.body ? JSON.parse(init.body) : undefined;
  requests.push({ path: pathname, body });
  const json = (status, data) => ({ ok: status < 400, status, json: async () => structuredClone(data) });
  if (failNext) {
    const failure = failNext;
    failNext = null;
    return json(failure.status, failure.body);
  }
  switch (pathname) {
    case '/api/health':
      return json(200, { status: 'ok', ai: false, model: null });
    case '/api/geocode':
      return json(200, { places: await advisor.searchPlaces(searchParams.get('q')) });
    case '/api/plan':
      return json(201, { plan: await advisor.buildPlan(profileSchema.parse(body)) });
    case '/api/simulate':
      return json(200, { impact: await advisor.simulate(profileSchema.parse(body.profile), body.actionIds) });
    case '/api/chat':
      return json(200, await advisor.chat(profileSchema.parse(body.profile), body.message, body.history));
    default:
      return json(404, { error: 'Not found' });
  }
}

let dom;
const $ = (id) => dom.window.document.getElementById(id);
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `check` passes (async UI updates). */
async function waitFor(check, timeoutMs = 3000) {
  const start = Date.now();
  for (;;) {
    try {
      return check();
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await tick(10);
    }
  }
}

const copied = [];
let printed = 0;

before(async () => {
  dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async (text) => copied.push(text) },
  });
  window.print = () => {
    printed += 1;
  };
  Object.assign(globalThis, {
    window,
    document: window.document,
    Node: window.Node,
    localStorage: window.localStorage,
    fetch: backend,
  });
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  await import('../public/js/main.js');
  await waitFor(() => assert.match($('ai-status').textContent, /template mode/));
});

after(() => dom.window.close());

describe('controller (main.js in jsdom)', () => {
  it('shows field errors and blocks submission without a location', async () => {
    $('profile-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    assert.equal($('form-errors').hidden, false);
    assert.match($('form-errors').textContent, /Choose your city/);
    assert.equal($('place-query').getAttribute('aria-invalid'), 'true');
    assert.ok(!requests.some((r) => r.path === '/api/plan'));
  });

  it('searches places and lets the user pick one', async () => {
    $('place-query').value = 'L';
    $('place-search').click();
    await waitFor(() => assert.match($('toast').textContent, /at least two letters/));
    $('place-query').value = 'Lahore';
    $('place-query').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await waitFor(() => assert.equal($('place-results').querySelectorAll('button').length, 2));
    $('place-results').querySelector('button').click();
    assert.match($('place-selected').textContent, /Selected: Lahore, Punjab, Pakistan/);
  });

  it('shows the purifier CADR field only when there is a purifier', () => {
    const select = $('purifier');
    select.value = 'one';
    select.dispatchEvent(new dom.window.Event('change'));
    assert.equal($('cadr-field').hidden, false);
    select.value = 'none';
    select.dispatchEvent(new dom.window.Event('change'));
    assert.equal($('cadr-field').hidden, true);
  });

  it('builds a plan from the form and renders every section', async () => {
    $('profile-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await waitFor(() => assert.equal($('results').hidden, false));
    assert.equal($('setup-section').hidden, true);
    assert.equal(requests.findLast((r) => r.path === '/api/plan').body.location.name, 'Lahore');
    assert.match($('air-card').textContent, /Air right now in Lahore/);
    assert.ok($('panel-routine').querySelectorAll('.action').length > 0);
    assert.equal(dom.window.document.activeElement, $('results-title'));
  });

  it('recomputes impact when the family removes and re-adds actions', async () => {
    const initial = $('impact-card').querySelector('.kpi-value').textContent;
    const toggle = $('panel-indoor').querySelector('[data-action]');
    toggle.click();
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.match($('impact-status').textContent, /Recalculating/);
    await waitFor(() => assert.match($('impact-status').textContent, /Based on the \d+ of \d+/));
    assert.ok(requests.some((r) => r.path === '/api/simulate'));
    assert.notEqual($('impact-card').querySelector('.kpi-value').textContent, initial);
    const saved = JSON.parse(dom.window.localStorage.getItem('airwise.session.v1'));
    assert.ok(!saved.selected.includes(toggle.dataset.action));
    toggle.click();
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal($('impact-card').querySelector('.kpi-value').textContent, initial, 'full plan needs no request');
  });

  it('ticks checklist items, persists them and prints', async () => {
    const box = $('panel-family').querySelector('input[type="checkbox"]');
    box.checked = true;
    box.dispatchEvent(new dom.window.Event('change'));
    assert.match($('progress-text').textContent, /^1 of/);
    const saved = JSON.parse(dom.window.localStorage.getItem('airwise.session.v1'));
    assert.equal(Object.values(saved.done).filter(Boolean).length, 1);
    [...$('panel-family').querySelectorAll('button')].find((b) => /Print/.test(b.textContent)).click();
    assert.equal(printed, 1);
    assert.equal(dom.window.document.body.classList.contains('print-checklist'), false);
  });

  it('copies the neighbourhood alert', async () => {
    $('panel-community').querySelector('.share button').click();
    await waitFor(() => assert.match(copied[0], /Air alert for Lahore/));
    await waitFor(() => assert.match($('toast').textContent, /Copied/));
  });

  it('answers chat questions and offers follow-ups', async () => {
    $('chat-input').value = 'Do N95 masks help?';
    $('chat-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await waitFor(() => assert.equal($('chat-log').querySelectorAll('.msg-assistant:not(.msg-pending)').length, 1));
    assert.match($('chat-log').textContent, /N95/);
    assert.equal($('chat-input').value, '');
    $('chat-suggestions').querySelector('button').click();
    await waitFor(() => assert.equal($('chat-log').querySelectorAll('.msg-assistant:not(.msg-pending)').length, 2));
  });

  it('reports chat failures in the conversation', async () => {
    failNext = { status: 429, body: { error: 'Too many requests.' } };
    $('chat-input').value = 'Again?';
    $('chat-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await waitFor(() => assert.match($('chat-log').lastElementChild.textContent, /Sorry, Too many requests/));
  });

  it('returns to the form to edit, and shows server validation errors', async () => {
    $('edit-btn').click();
    assert.equal($('setup-section').hidden, false);
    failNext = {
      status: 400,
      body: { error: 'Invalid request', details: [{ field: 'home.areaSqm', message: 'Too small' }] },
    };
    $('profile-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await waitFor(() => assert.match($('form-errors').textContent, /home\.areaSqm: Too small/));
    assert.equal($('area').getAttribute('aria-invalid'), 'true');
  });

  it('runs the demo family and refreshes air data', async () => {
    $('demo-btn').click();
    await waitFor(() => assert.match($('air-card').textContent, /New Delhi/));
    assert.equal($('incense').checked, true);
    const plans = requests.filter((r) => r.path === '/api/plan').length;
    $('refresh-btn').click();
    await waitFor(() => assert.equal(requests.filter((r) => r.path === '/api/plan').length, plans + 1));
  });
});

describe('controller: geolocation', () => {
  it('uses the device location when allowed and explains when denied', async () => {
    let allow = true;
    Object.defineProperty(dom.window.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success, failure) {
          if (allow) success({ coords: { latitude: 28.61394, longitude: 77.20902 } });
          else failure(new Error('denied'));
        },
      },
    });
    $('edit-btn').click();
    $('place-locate').click();
    assert.match($('place-selected').textContent, /Selected: My location, 28\.61, 77\.21/);
    allow = false;
    $('place-locate').click();
    await waitFor(() => assert.match($('toast').textContent, /Could not get your location/));
    assert.match($('place-selected').textContent, /My location/, 'keeps the previous choice');
  });
});

describe('controller: restoring a saved session', () => {
  it('restores the plan, selections and chat after a reload, and reports an unreachable server', async () => {
    const saved = JSON.parse(dom.window.localStorage.getItem('airwise.session.v1'));
    const dropped = saved.plan.pillars.indoor[0].id;
    saved.selected = saved.selected.filter((id) => id !== dropped).concat('stale_id');
    saved.chat = [{ role: 'user', text: 'Earlier question' }];

    const reloaded = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
    reloaded.window.localStorage.setItem('airwise.session.v1', JSON.stringify(saved));
    const calls = [];
    Object.assign(globalThis, {
      window: reloaded.window,
      document: reloaded.window.document,
      Node: reloaded.window.Node,
      localStorage: reloaded.window.localStorage,
      fetch: async (url, init) => {
        calls.push(String(url));
        if (String(url).endsWith('/api/health')) throw new TypeError('offline');
        return backend(url, init);
      },
    });
    dom = reloaded;
    const { init } = await import('../public/js/main.js');
    init();

    assert.equal($('results').hidden, false);
    assert.match($('chat-log').textContent, /Earlier question/);
    const toggle = reloaded.window.document.querySelector(`[data-action="${dropped}"]`);
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    await waitFor(() => assert.ok(calls.some((u) => u.endsWith('/api/simulate'))));
    await waitFor(() => assert.match($('ai-status').textContent, /Server unreachable/));
  });
});
