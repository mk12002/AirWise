import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import axe from 'axe-core';
import { JSDOM } from 'jsdom';
import { createAdvisor } from '../src/services/advisor.js';
import { createAirDataClient } from '../src/services/airData.js';
import { profileSchema } from '../src/validation.js';
import { fakeFetch, validProfile } from './helpers.js';

/*
 * Frontend tests: load the real index.html in jsdom, render a plan with the
 * production render functions, and audit the result with axe-core.
 * (Colour contrast needs a layout engine, so it is checked in a real browser.)
 */

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

let dom;
let render;
let form;
let tabs;
let family;
let chat;

before(async () => {
  dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node });
  dom.window.eval(axe.source);
  render = await import('../public/js/render.js');
  form = await import('../public/js/form.js');
  tabs = await import('../public/js/tabs.js');
  family = await import('../public/js/panels/family.js');
  chat = await import('../public/js/panels/chat.js');
});

async function audit() {
  const results = await dom.window.axe.run(dom.window.document, {
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'],
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(results.violations, (v) => `${v.id}: ${Array.from(v.nodes, (n) => n.target.join(' ')).join(', ')}`);
}

async function samplePlan(overrides = {}) {
  const advisor = createAdvisor({ airData: createAirDataClient({ fetchImpl: fakeFetch() }) });
  const plan = await advisor.buildPlan(profileSchema.parse(validProfile()));
  return { ...plan, ...overrides };
}

const noopHandlers = { done: {}, onToggle() {}, onCopy() {} };
const $ = (id) => dom.window.document.getElementById(id);

function showResults() {
  $('setup-section').hidden = true;
  $('results').hidden = false;
}

describe('UI: accessibility (axe-core)', () => {
  it('the household form has no WCAG 2.2 AA violations', async () => {
    assert.deepEqual(await audit(), []);
  });

  it('every rendered plan panel has no violations', async () => {
    showResults();
    render.renderPlan(await samplePlan(), noopHandlers);
    chat.appendMessage($('chat-log'), { role: 'user', text: 'Hi' });
    chat.appendMessage($('chat-log'), { role: 'assistant', text: 'Hello!' });
    for (const panel of dom.window.document.querySelectorAll('[role="tabpanel"]')) panel.hidden = false;
    assert.deepEqual(await audit(), []);
  });

  it('labels every form control', () => {
    const controls = dom.window.document.querySelectorAll('input:not([type="radio"]), select, textarea');
    for (const control of controls) {
      const labelled = control.closest('label') || dom.window.document.querySelector(`label[for="${control.id}"]`);
      assert.ok(labelled, `missing label for #${control.id}`);
    }
  });

  it('gives the chart a text alternative and a data table', async () => {
    render.renderPlan(await samplePlan(), noopHandlers);
    const svg = $('forecast').querySelector('svg');
    assert.equal(svg.getAttribute('role'), 'img');
    assert.match(svg.querySelector('title').textContent, /Cleanest daytime window/);
    assert.equal($('forecast').querySelectorAll('tbody tr').length, 24);
  });
});

describe('UI: rendering', () => {
  it('renders AI and user text as text, never as HTML (XSS)', async () => {
    const evil = '<img src=x onerror="window.pwned=1">';
    const plan = await samplePlan({ headline: evil, kidAlert: { emoji: '😷', message: evil } });
    plan.pillars.indoor[0].why = evil;
    plan.community[0].title = evil;
    render.renderPlan(plan, noopHandlers);
    chat.appendMessage($('chat-log'), { role: 'assistant', text: evil });
    assert.equal(dom.window.document.querySelectorAll('img').length, 0);
    assert.equal(dom.window.pwned, undefined);
    assert.ok($('kid-card').textContent.includes('<img'));
  });

  it('groups indoor hacks by budget tier with measured impact', async () => {
    render.renderPlan(await samplePlan(), noopHandlers);
    const tiers = [...$('panel-indoor').querySelectorAll('.tier-title')].map((t) => t.firstChild.textContent.trim());
    assert.deepEqual(tiers, ['Free', 'Low cost', 'Medium budget']);
    assert.match($('panel-indoor').textContent, /PM2\.5 for your child/);
    assert.match($('impact-card').textContent, /cigarettes\/day/);
    assert.match($('plan-meta').textContent, /template explanations/);
  });

  it('shows an empty-state message for a pillar with no actions', async () => {
    const plan = await samplePlan();
    plan.pillars.swap = [];
    render.renderPlan(plan, noopHandlers);
    assert.match($('panel-swap').textContent, /already doing well/);
  });

  it('checklist ticks call back and show progress', async () => {
    const plan = await samplePlan();
    const toggled = [];
    family.renderFamily($('panel-family'), plan, {
      done: { [plan.checklist[0].id]: true },
      onToggle: (id, checked) => toggled.push([id, checked]),
    });
    assert.match($('progress-text').textContent, new RegExp(`1 of ${plan.checklist.length} done`));
    const box = $(`chk-${plan.checklist[1].id}`);
    box.checked = true;
    box.dispatchEvent(new dom.window.Event('change'));
    assert.deepEqual(toggled, [[plan.checklist[1].id, true]]);
  });

  it('builds a shareable neighbourhood alert and copies it', async () => {
    const plan = await samplePlan();
    const copied = [];
    family.renderCommunity($('panel-community'), plan, { onCopy: (t) => copied.push(t) });
    $('panel-community').querySelector('button').click();
    assert.match(copied[0], /Air alert for New Delhi: AQI 165 \(Unhealthy\)\. Cleanest hours today: 13:00–15:00\./);
    const noWindows = family.neighbourhoodMessage({ ...plan, windows: { best: null, worst: null } });
    assert.doesNotMatch(noWindows, /Cleanest/);
  });

  it('renders follow-up suggestions as buttons', () => {
    const picked = [];
    chat.renderSuggestions($('chat-suggestions'), ['A?', 'B?'], (q) => picked.push(q));
    $('chat-suggestions').querySelectorAll('button')[1].click();
    assert.deepEqual(picked, ['B?']);
  });
});

describe('UI: form and tabs', () => {
  it('round-trips a profile through the form', () => {
    const el = $('profile-form');
    form.fillForm(el, form.DEMO_PROFILE);
    const read = form.readProfile(el, form.DEMO_PROFILE.location);
    assert.deepEqual(read, structuredClone(form.DEMO_PROFILE));
    assert.equal($('cadr-field').hidden, true);
    assert.ok(profileSchema.safeParse(read).success, 'the form produces a server-valid profile');
  });

  it('validates required location and ranges before sending', () => {
    const el = $('profile-form');
    form.fillForm(el, form.DEMO_PROFILE);
    $('adults').value = '0';
    const problems = form.validateForm(el, null);
    assert.deepEqual(
      problems.map((p) => p.id),
      ['place-query', 'adults'],
    );
    $('adults').value = '2';
    assert.deepEqual(form.validateForm(el, form.DEMO_PROFILE.location), []);
    assert.equal(form.fieldIdFor('home.areaSqm'), 'area');
    assert.equal(form.fieldIdFor('location.lat'), 'place-query');
    assert.equal(form.fieldIdFor('unknown'), null);
  });

  it('supports arrow-key navigation between tabs', () => {
    tabs.setupTabs(dom.window.document.querySelector('[role="tablist"]'));
    const first = $('tab-routine');
    first.click();
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal($('tab-indoor').getAttribute('aria-selected'), 'true');
    assert.equal($('panel-indoor').hidden, false);
    assert.equal($('panel-routine').hidden, true);
    $('tab-indoor').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal($('tab-chat').getAttribute('aria-selected'), 'true');
    $('tab-chat').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal($('tab-routine').getAttribute('aria-selected'), 'true');
    $('tab-routine').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    assert.equal($('tab-routine').tabIndex, 0);
  });
});
