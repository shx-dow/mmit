import { describe, it, expect } from 'vitest';
import { parseConfigValue } from '../src/configCmd.js';

describe('parseConfigValue', () => {
  it('accepts known providers and rejects unknown ones', () => {
    expect(parseConfigValue('provider', 'gemini')).toBe('gemini');
    expect(() => parseConfigValue('provider', 'bogus')).toThrow();
  });

  it('parses numbers and booleans', () => {
    expect(parseConfigValue('maxDiffTokens', '4000')).toBe(4000);
    expect(() => parseConfigValue('maxDiffTokens', 'lots')).toThrow();
    expect(parseConfigValue('autoConfirm', 'yes')).toBe(true);
    expect(parseConfigValue('autoConfirm', 'no')).toBe(false);
    expect(() => parseConfigValue('autoConfirm', 'maybe')).toThrow();
  });

  it('parses comma-separated commit types', () => {
    expect(parseConfigValue('commitTypes', 'feat, fix')).toEqual(['feat', 'fix']);
    expect(() => parseConfigValue('commitTypes', '  ')).toThrow();
  });

  it('rejects unknown keys and empty strings', () => {
    expect(() => parseConfigValue('nope', 'x')).toThrow();
    expect(() => parseConfigValue('model', '  ')).toThrow();
  });
});
