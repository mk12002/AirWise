import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACTIONS, evaluateActions, mergeMods, transitAlternative } from '../src/services/actions.js';
import { AQI_BANDS, aqiBand, pm25ToAqi } from '../src/services/aqi.js';
import { householdCo2, householdExposure, indoorConcentrations, mostVulnerable } from '../src/services/exposure.js';
import { findWindows, pm25AtPreference } from '../src/services/windows.js';
import { profileSchema } from '../src/validation.js';
import { validProfile } from './helpers.js';

const profile = (overrides) => profileSchema.parse(validProfile(overrides));
const air = { avgPm25: 80, exercisePm: 110 };

describe('AQI', () => {
  it('maps PM2.5 to the 2024 EPA breakpoints', () => {
    assert.equal(pm25ToAqi(0), 0);
    assert.equal(pm25ToAqi(9), 50);
    assert.equal(pm25ToAqi(9.1), 51);
    assert.equal(pm25ToAqi(35.4), 100);
    assert.equal(pm25ToAqi(55.5), 151);
    assert.equal(pm25ToAqi(125.4), 200);
    assert.equal(pm25ToAqi(325.4), 500);
    assert.equal(pm25ToAqi(900), 500);
    assert.equal(pm25ToAqi(-1), 0);
    assert.equal(pm25ToAqi(Number.NaN), 0);
  });

  it('picks a band with kid-friendly text for every AQI', () => {
    assert.equal(aqiBand(42).id, 'good');
    assert.equal(aqiBand(101).id, 'usg');
    assert.equal(aqiBand(450).id, 'hazardous');
    for (const band of AQI_BANDS) assert.ok(band.kid.length > 10 && band.advice.length > 10);
  });
});

describe('forecast windows', () => {
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const hour = (10 + i) % 24;
    let pm25 = 70;
    if (hour >= 14 && hour < 16) pm25 = 30;
    if (hour >= 7 && hour < 9) pm25 = 120;
    return { time: `t${i}`, hour, pm25, aqi: pm25ToAqi(pm25) };
  });

  it('finds the cleanest and dirtiest daytime two-hour windows', () => {
    const { best, worst, spreadPct } = findWindows(hourly);
    assert.equal(best.label, '14:00–16:00');
    assert.equal(best.pm25, 30);
    assert.equal(worst.label, '07:00–09:00');
    assert.equal(spreadPct, 75);
  });

  it('ignores night hours and non-contiguous slices', () => {
    const night = [0, 1, 2, 3].map((hour) => ({ time: `n${hour}`, hour, pm25: 1, aqi: 1 }));
    assert.deepEqual(findWindows(night), { best: null, worst: null, spreadPct: 0 });
    const gap = [
      { time: 'a', hour: 10, pm25: 5, aqi: 20 },
      { time: 'b', hour: 12, pm25: 5, aqi: 20 },
    ];
    assert.equal(findWindows(gap).best, null);
  });

  it('averages PM2.5 over the preferred exercise slot', () => {
    assert.equal(pm25AtPreference(hourly, 'morning'), 103.3);
    assert.equal(pm25AtPreference(hourly, 'evening'), 70);
    assert.ok(pm25AtPreference(hourly, 'flexible') < 80);
    const nightOnly = [{ time: 'x', hour: 2, pm25: 50, aqi: 1 }];
    assert.equal(pm25AtPreference(nightOnly, 'morning'), 50);
  });
});

describe('exposure model', () => {
  const home = profile().home;

  it('follows the mass balance: more outdoor smog means more indoor smog', () => {
    const low = indoorConcentrations(home, 20);
    const high = indoorConcentrations(home, 200);
    assert.ok(high.living > low.living);
    assert.ok(high.living < 200, 'walls and deposition keep indoor below outdoor');
  });

  it('purifiers, sealing and removing sources each lower indoor PM2.5', () => {
    const base = indoorConcentrations(home, 100);
    assert.ok(indoorConcentrations(home, 100, { bedroomCadr: 300 }).bedroom < base.bedroom / 2);
    assert.ok(indoorConcentrations(home, 100, { noIncense: true }).living < base.living);
    assert.ok(indoorConcentrations(home, 100, { homeCadrExtra: 150 }).living < base.living);
    assert.ok(indoorConcentrations(home, 100, { airingAt: 40 }).living < base.living);
    assert.equal(indoorConcentrations(home, 10, { airingAt: 40 }).living, indoorConcentrations(home, 10).living);
  });

  it('sealing drafts helps only when outdoor smog outweighs indoor sources', () => {
    const clean = { ...home, incense: false };
    assert.ok(
      indoorConcentrations(clean, 300, { achMultiplier: 0.6 }).living < indoorConcentrations(clean, 300).living,
    );
    // With incense burning, a tighter home traps the smoke: the model says so.
    assert.ok(indoorConcentrations(home, 60, { achMultiplier: 0.6 }).living > indoorConcentrations(home, 60).living);
  });

  it('solid-fuel cooking dominates indoor air', () => {
    const lpg = indoorConcentrations(home, 50).living;
    const wood = indoorConcentrations({ ...home, cookingFuel: 'biomass' }, 50).living;
    assert.ok(wood > lpg * 3);
  });

  it('reports exposure, dose and cigarette equivalents per group present', () => {
    const result = householdExposure(profile(), air);
    assert.deepEqual(Object.keys(result.groups).sort(), ['adult', 'child', 'elderly']);
    const child = result.groups.child;
    assert.ok(child.meanUgM3 > 0 && child.doseUg > 0);
    assert.equal(child.cigarettesPerDay, Math.round((child.meanUgM3 / 22) * 10) / 10);
    const solo = householdExposure(profile({ household: { children: 0, elderly: 0 } }), air);
    assert.deepEqual(Object.keys(solo.groups), ['adult']);
  });

  it('counts commute exposure only for commuters', () => {
    const metro = householdExposure(profile({ commute: { mode: 'metro' } }), air).groups.adult.meanUgM3;
    const scooter = householdExposure(profile({ commute: { mode: 'two_wheeler' } }), air).groups.adult.meanUgM3;
    const remote = householdExposure(profile({ commute: { mode: 'wfh' } }), air).groups.adult.meanUgM3;
    assert.ok(scooter > metro);
    assert.ok(remote > 0);
  });

  it('identifies the most vulnerable member', () => {
    assert.equal(mostVulnerable(profile()), 'child');
    assert.equal(mostVulnerable(profile({ household: { children: 0 } })), 'elderly');
    assert.equal(mostVulnerable(profile({ household: { children: 0, elderly: 0 } })), 'adult');
  });

  it('computes household CO2 and the effect of swaps', () => {
    const p = profile();
    const base = householdCo2(p);
    assert.ok(base > 0);
    assert.ok(householdCo2(p, { commuteMode: 'metro' }) < base);
    assert.ok(householdCo2(p, { carpoolShare: 3 }) < base);
    assert.ok(householdCo2(p, { noIdling: true }) < base);
    assert.ok(householdCo2(p, { kwhSavedPerDay: 1 }) < base);
    assert.equal(householdCo2(p, { carpoolShare: 3, commuteMode: 'bus' }), householdCo2(p, { commuteMode: 'bus' }));
  });
});

describe('action catalogue', () => {
  const best = { pm25: 40, label: '14:00–16:00' };
  const ctx = (p) => ({ profile: p, best, air });

  it('every action has the fields the UI needs', () => {
    const ids = new Set();
    for (const a of ACTIONS) {
      assert.ok(!ids.has(a.id), `duplicate ${a.id}`);
      ids.add(a.id);
      assert.ok(['routine', 'indoor', 'swap'].includes(a.pillar));
      assert.ok(a.steps.length >= 2 && a.why.length > 20 && a.title.length > 5);
    }
  });

  it('respects the budget', () => {
    const free = evaluateActions(ctx(profile({ lifestyle: { budget: 'free' } })));
    assert.ok(free.length > 0);
    assert.ok(free.every((a) => a.tier === 'free'));
    const high = evaluateActions(ctx(profile({ lifestyle: { budget: 'high' } })));
    assert.ok(high.some((a) => a.tier === 'high'));
  });

  it('only suggests what applies to the household', () => {
    const ids = (p) => evaluateActions(ctx(p)).map((a) => a.id);
    const metroFamily = ids(profile({ commute: { mode: 'metro' }, home: { incense: false, purifier: 'one' } }));
    assert.ok(!metroFamily.includes('carpool'));
    assert.ok(!metroFamily.includes('no_incense'));
    assert.ok(!metroFamily.includes('bedroom_purifier'));
    assert.ok(metroFamily.includes('purifier_schedule'));
    const woodHome = ids(profile({ home: { cookingFuel: 'biomass', heating: 'wood_coal' } }));
    assert.ok(woodHome.includes('clean_cooking_lpg') && woodHome.includes('clean_heating'));
    const lpg = evaluateActions(ctx(profile({ home: { cookingFuel: 'biomass' } }))).find(
      (a) => a.id === 'clean_cooking_lpg',
    );
    assert.ok(lpg.metrics.co2KgPerMonth < 0 && lpg.metrics.pctReduction > 30, 'health-first trade-off is kept');
    assert.ok(!ids(profile()).includes('seal_drafts'), 'not suggested when it would trap incense smoke');
  });

  it('attaches computed, non-negative metrics and sorts by score', () => {
    const results = evaluateActions(ctx(profile()));
    for (const a of results) {
      assert.ok(a.metrics.doseSavedUgPerDay >= 0);
      assert.ok(a.metrics.afterUgM3 <= a.metrics.beforeUgM3);
    }
    for (let i = 1; i < results.length; i += 1) assert.ok(results[i - 1].score >= results[i].score);
    const purifier = results.find((a) => a.id === 'bedroom_purifier');
    assert.equal(purifier.metrics.group, 'child');
    assert.ok(purifier.metrics.pctReduction > 20);
    const exercise = results.find((a) => a.id === 'time_exercise');
    assert.equal(exercise.metrics.group, 'adult', 'reports the member who actually benefits');
  });

  it('chooses a sensible transit alternative', () => {
    assert.equal(transitAlternative(2), 'cycle_walk');
    assert.equal(transitAlternative(4), 'bus');
    assert.equal(transitAlternative(15), 'metro');
  });

  it('merges mods keeping the strongest of each kind', () => {
    const merged = mergeMods([
      { bedroomCadr: 200, cookingFuel: 'lpg', commuteMode: 'bus', achMultiplier: 0.6, wetMop: true, airingAt: 50 },
      { bedroomCadr: 300, cookingFuel: 'induction', commuteMode: 'ev', heating: 'electric', airingAt: 40 },
      { heating: 'gas', commuteMode: 'metro' },
    ]);
    assert.deepEqual(merged, {
      bedroomCadr: 300,
      cookingFuel: 'induction',
      commuteMode: 'metro',
      achMultiplier: 0.6,
      wetMop: true,
      airingAt: 40,
      heating: 'electric',
    });
  });
});
