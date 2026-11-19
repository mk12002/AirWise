import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createLogger, silentLogger } from '../src/logger.js';
import { TtlCache } from '../src/services/cache.js';
import { templateChecklist, templateHealthNotes, templateWhy } from '../src/services/fallback.js';
import { describeActions, describeProfile } from '../src/services/prompts.js';
import { chatRequestSchema, liveAirSchema, profileSchema } from '../src/validation.js';
import { openMeteoPayloads, validProfile } from './helpers.js';

describe('config', () => {
  it('uses safe defaults', () => {
    const c = loadConfig({});
    assert.equal(c.port, 8080);
    assert.equal(c.geminiApiKey, '');
    assert.equal(c.geminiModel, 'gemini-3.5-flash-lite');
    assert.equal(c.geminiFallbackModel, 'gemini-3.1-flash-lite');
    assert.equal(loadConfig({ GEMINI_FALLBACK_MODEL: 'none' }).geminiFallbackModel, '');
    assert.equal(c.aiThinkingLevel, 'LOW');
    assert.equal(c.rateLimitPerMinute, 20);
    assert.ok(Object.isFrozen(c));
  });

  it('parses overrides and ignores invalid values', () => {
    const c = loadConfig({
      PORT: '3000',
      GEMINI_API_KEY: ' k ',
      AI_THINKING_LEVEL: 'none',
      RATE_LIMIT_PER_MINUTE: '-4',
    });
    assert.equal(c.port, 3000);
    assert.equal(c.geminiApiKey, 'k');
    assert.equal(c.aiThinkingLevel, '');
    assert.equal(c.rateLimitPerMinute, 20);
    assert.equal(loadConfig({ AI_THINKING_LEVEL: 'high' }).aiThinkingLevel, 'HIGH');
  });
});

describe('structured logger', () => {
  it('writes one JSON line per entry', () => {
    const lines = [];
    const logger = createLogger({ write: (line) => lines.push(JSON.parse(line)), now: () => new Date(0) });
    logger.info('request', { status: 200 });
    logger.warn('plain');
    logger.error('failed', new Error('boom'));
    assert.deepEqual(lines, [
      { time: '1970-01-01T00:00:00.000Z', level: 'info', message: 'request', meta: { status: 200 } },
      { time: '1970-01-01T00:00:00.000Z', level: 'warn', message: 'plain' },
      { time: '1970-01-01T00:00:00.000Z', level: 'error', message: 'failed', error: 'boom' },
    ]);
    assert.doesNotThrow(() => silentLogger.info('x'));
  });
});

describe('TtlCache', () => {
  it('expires entries and evicts the least recently used', () => {
    let now = 0;
    const cache = new TtlCache({ ttlMs: 100, maxEntries: 2, now: () => now });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.size, 2);
    now = 150;
    assert.equal(cache.get('a'), undefined);
  });
});

describe('validation', () => {
  it('accepts browser-fetched Open-Meteo data, bounds every value and strips extras', () => {
    const { air, weather } = openMeteoPayloads();
    const parsed = liveAirSchema.parse({
      air: { ...air, latitude: 1, current: { ...air.current, extra: 'x' } },
      weather,
    });
    assert.equal(parsed.air.latitude, undefined);
    assert.equal(parsed.air.current.extra, undefined);
    assert.equal(parsed.air.hourly.pm2_5.length, 48);
    assert.ok(liveAirSchema.safeParse({ air, weather: null }).success, 'weather is optional');
    const bad = (patch) => liveAirSchema.safeParse({ air: { ...air, ...patch } }).success;
    assert.equal(bad({ current: { ...air.current, pm2_5: 99999 } }), false);
    assert.equal(bad({ current: { ...air.current, time: '<script>' } }), false);
    assert.equal(bad({ hourly: { ...air.hourly, pm2_5: Array(97).fill(1) } }), false);
  });

  it('strips control characters and trims text', () => {
    const p = profileSchema.parse(validProfile({ lifestyle: { notes: '  hi\u0000 there\u0007 ' } }));
    assert.equal(p.lifestyle.notes, 'hi there');
  });

  it('enforces ranges and enums', () => {
    assert.equal(profileSchema.safeParse(validProfile({ home: { areaSqm: 5 } })).success, false);
    assert.equal(profileSchema.safeParse(validProfile({ home: { cookingFuel: 'plutonium' } })).success, false);
    assert.equal(profileSchema.safeParse(validProfile({ location: { countryCode: 'india' } })).success, false);
    assert.equal(profileSchema.safeParse(validProfile({ household: { children: 1.5 } })).success, false);
  });

  it('caps chat history', () => {
    const history = Array.from({ length: 13 }, () => ({ role: 'user', text: 'x' }));
    assert.equal(chatRequestSchema.safeParse({ profile: validProfile(), message: 'hi', history }).success, false);
  });
});

describe('prompts and templates', () => {
  const profile = profileSchema.parse(validProfile());
  const action = {
    id: 'x',
    pillar: 'indoor',
    tier: 'free',
    title: 'Do X',
    why: 'Because.',
    metrics: {
      group: 'child',
      beforeUgM3: 80,
      afterUgM3: 60,
      pctReduction: 25,
      doseSavedUgPerDay: 300,
      co2KgPerMonth: 12,
    },
  };

  it('describes the profile in plain labels for the model', () => {
    const d = describeProfile(profile);
    assert.equal(d.location, 'New Delhi, Delhi, India');
    assert.match(d.commute, /Petrol car, 12 km each way, 5 days\/week/);
    assert.equal(d.home.cookingFuel, 'LPG cylinder');
    assert.deepEqual(describeActions([action])[0].impact.dailyPm25ExposureUgM3, '80 -> 60');
  });

  it('builds number-backed explanations', () => {
    assert.match(templateWhy(action), /from 80 to 60 µg\/m³ \(−25%\).*12 kg of CO2/);
    const tradeOff = templateWhy({ ...action, metrics: { ...action.metrics, co2KgPerMonth: -18 } });
    assert.match(tradeOff, /adds about 18 kg/);
    assert.equal(
      templateWhy({ ...action, metrics: { ...action.metrics, pctReduction: 0, co2KgPerMonth: 0 } }),
      'Because.',
    );
  });

  it('builds checklists and health notes for who lives there', () => {
    const windows = { best: { label: '14:00–16:00' }, worst: { label: '07:00–09:00' } };
    const tasks = templateChecklist({ profile, windows, actions: [{ id: 'diy_purifier' }] });
    assert.ok(tasks.some((t) => t.who === 'elders'));
    assert.ok(tasks.some((t) => t.time === '21:00'));
    const wfhSolo = profileSchema.parse(
      validProfile({
        household: { children: 0, elderly: 0, respiratory: false, pregnant: true },
        commute: { mode: 'wfh' },
      }),
    );
    const few = templateChecklist({ profile: wfhSolo, windows: { best: null, worst: null }, actions: [] });
    assert.equal(few[0].time, 'Early morning');
    assert.ok(!few.some((t) => t.who === 'commuter' || t.who === 'kids'));
    assert.deepEqual(
      templateHealthNotes(wfhSolo).map((n) => n.group),
      ['pregnant', 'adults'],
    );
  });
});
