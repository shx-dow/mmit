import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { providers, detectProviderFromEnv } from '../src/provider.js';

const PROVIDER_NAMES = ['openai', 'anthropic', 'gemini', 'openrouter'];
const SAVED_ENV: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of PROVIDER_NAMES) {
    SAVED_ENV[providers[name].envKey] = process.env[providers[name].envKey];
    delete process.env[providers[name].envKey];
  }
});

afterEach(() => {
  for (const name of PROVIDER_NAMES) {
    const key = providers[name].envKey;
    if (SAVED_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED_ENV[key];
  }
});

describe('provider registry', () => {
  it('each provider carries name, envKey, defaultModel, and an adapter', () => {
    for (const name of PROVIDER_NAMES) {
      const p = providers[name];
      expect(p).toBeDefined();
      expect(p.name).toBe(name);
      expect(p.envKey).toMatch(/_API_KEY$/);
      expect(typeof p.defaultModel).toBe('string');
      expect(p.defaultModel.length).toBeGreaterThan(0);
      expect(typeof p.generate).toBe('function');
    }
  });

  it('default models differ across providers', () => {
    const models = new Set(PROVIDER_NAMES.map(n => providers[n].defaultModel));
    expect(models.size).toBe(PROVIDER_NAMES.length);
  });
});

describe('detectProviderFromEnv', () => {
  it('returns null when no provider env var is set', () => {
    expect(detectProviderFromEnv()).toBeNull();
  });

  it('returns the provider whose env var is set', () => {
    process.env[providers.gemini.envKey] = 'fake-key';
    expect(detectProviderFromEnv()).toBe('gemini');
  });

  it('prefers the requested provider when its env var is set', () => {
    process.env[providers.openai.envKey] = 'fake-key';
    process.env[providers.anthropic.envKey] = 'fake-key';
    expect(detectProviderFromEnv('anthropic')).toBe('anthropic');
  });

  it('falls back to any set env var when the preferred one is missing', () => {
    process.env[providers.openai.envKey] = 'fake-key';
    expect(detectProviderFromEnv('gemini')).toBe('openai');
  });
});