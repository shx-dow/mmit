import { describe, it, expect } from 'vitest';
import { filterTextModels, searchModels } from '../src/models.js';

const RAW = {
  'chat-a': {
    id: 'chat-a', name: 'Chat A', release_date: '2026-09-01',
    modalities: { input: ['text'], output: ['text'] },
  },
  'img-only': {
    id: 'img-only', name: 'Img', release_date: '2026-09-02',
    modalities: { input: ['image'], output: ['image'] },
  },
  'chat-b': {
    id: 'chat-b', name: 'Chat B', release_date: '2026-08-01',
    modalities: { input: ['text', 'image'], output: ['text'] },
  },
};

describe('filterTextModels', () => {
  it('keeps text chat models only, newest first', () => {
    expect(filterTextModels(RAW).map(m => m.id)).toEqual(['chat-a', 'chat-b']);
  });

  it('drops embeddings and media models even with text modalities', () => {
    const raw = {
      'gem-embed': { id: 'gem-embed', modalities: { input: ['text'], output: ['text'] } },
      'chat-c': { id: 'chat-c', modalities: { input: ['text'], output: ['text'] } },
    };
    expect(filterTextModels(raw).map(m => m.id)).toEqual(['chat-c']);
  });

  it('returns empty for unknown shapes', () => {
    expect(filterTextModels({})).toEqual([]);
  });
});

describe('searchModels', () => {
  it('matches id or name, case-insensitive', () => {
    const models = filterTextModels(RAW);
    expect(searchModels(models, 'CHAT-b').map(m => m.id)).toEqual(['chat-b']);
    expect(searchModels(models, '').length).toBe(2);
    expect(searchModels(models, 'zzz')).toEqual([]);
  });

  it('matches unordered tokens across id and name', () => {
    const models = [
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
    ];
    expect(searchModels(models, '3.1 lite').map(m => m.id)).toEqual(['gemini-3.1-flash-lite']);
    expect(searchModels(models, 'lite 3.1').map(m => m.id)).toEqual(['gemini-3.1-flash-lite']);
    expect(searchModels(models, 'flash').map(m => m.id)).toEqual(['gemini-3.1-flash-lite', 'gemini-3.8-flash']);
  });
});
