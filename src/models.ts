import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { pickModelInline } from './modelPicker.js';

const CATALOG_URL = 'https://models.dev/api.json';
const CACHE_PATH = join(homedir(), '.mmit-models.json');
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_OPTIONS = 20;

/** Our provider name -> models.dev slug. Only these four are ever fetched. */
const PROVIDER_SLUG: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'google',
  openrouter: 'openrouter',
};

export interface CatalogModel {
  id: string;
  name: string;
  releaseDate?: string;
}

interface CacheFile {
  fetchedAt: Record<string, number>;
  models: Record<string, Record<string, unknown>>;
}

function readCacheFile(): CacheFile | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    return JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as CacheFile;
  } catch {
    return null;
  }
}

function readCachedModels(slug: string): Record<string, unknown> | null {
  const cache = readCacheFile();
  if (!cache) return null;
  const at = cache.fetchedAt[slug];
  if (!at || Date.now() - at > CACHE_TTL_MS) return null;
  return cache.models[slug] ?? null;
}

function writeCachedModels(slug: string, models: Record<string, unknown>): void {
  try {
    const cache = readCacheFile() ?? { fetchedAt: {}, models: {} };
    cache.fetchedAt[slug] = Date.now();
    cache.models[slug] = models;
    mkdirSync(homedir(), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
  } catch {
    // cache is best-effort; never break the flow
  }
}

/** Ids that are never commit-message models (embeddings, audio, media gen). */
const NON_CHAT_PATTERN = /embed|transcribe|\btts\b|\bstt\b|text-to-speech|lyria|banana|imagen|veo/i;

/** Keep text chat models only (text in, text-only out), newest first, capped. */
export function filterTextModels(raw: Record<string, any>): CatalogModel[] {
  const out: CatalogModel[] = [];
  for (const [key, m] of Object.entries(raw)) {
    if (!m || typeof m !== 'object') continue;
    const id = (m as any).id || key;
    if (NON_CHAT_PATTERN.test(id)) continue;
    const input = (m as any).modalities?.input as unknown;
    const output = (m as any).modalities?.output as unknown;
    if (!Array.isArray(input) || !input.includes('text')) continue;
    if (!Array.isArray(output) || output.length !== 1 || output[0] !== 'text') continue;
    out.push({
      id: (m as any).id || key,
      name: (m as any).name || key,
      releaseDate: (m as any).release_date || (m as any).releaseDate,
    });
  }
  out.sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
  return out.slice(0, MAX_OPTIONS);
}

export function searchModels(models: CatalogModel[], query: string): CatalogModel[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return models;
  const scored: { m: CatalogModel; score: number }[] = [];
  for (const m of models) {
    const id = m.id.toLowerCase();
    const name = m.name.toLowerCase();
    let ok = true;
    let score = 0;
    for (const t of tokens) {
      const inId = id.indexOf(t);
      const inName = name.indexOf(t);
      if (inId === -1 && inName === -1) {
        ok = false;
        break;
      }
      score += inId !== -1 ? inId / 1000 : 1 + inName / 1000;
    }
    if (ok) scored.push({ m, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map(s => s.m);
}

/**
 * Fetch the model list for ONE provider only. Returns null when offline
 * or unknown so callers fall back to free text. Uses the 7-day cache first.
 */
export async function fetchModelsForProvider(provider: string): Promise<CatalogModel[] | null> {
  const slug = PROVIDER_SLUG[provider];
  if (!slug) return null;

  const cached = readCachedModels(slug);
  if (cached) return filterTextModels(cached as Record<string, any>);

  let raw: Record<string, unknown>;
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, any>;
    raw = data[slug]?.models;
    if (!raw || typeof raw !== 'object') return null;
  } catch {
    return null;
  }

  writeCachedModels(slug, raw);
  return filterTextModels(raw as Record<string, any>);
}

async function askCustomModel(fallback: string): Promise<string | null> {
  const custom = await p.text({
    message: 'Model id',
    initialValue: fallback,
    validate: (val: string) => {
      if (!val.trim()) return 'Model name cannot be empty';
    },
  });
  if (p.isCancel(custom)) return null;
  return (custom as string).trim();
}

/**
 * Model step in one screen: inline filter + arrows when TTY, short clack
 * list otherwise. Returns the id, or null on cancel. Free text fallback
 * when the catalog is unreachable.
 */
const SHORT_LIST = 7;

export async function promptForModel(provider: string, current: string, fallback: string): Promise<string | null> {
  const spin = p.spinner();
  spin.start('Fetching models...');
  const models = await fetchModelsForProvider(provider);
  spin.stop(models ? 'Models loaded' : 'Catalog unreachable');

  if (!models || models.length === 0) {
    return askCustomModel(current || fallback);
  }

  const base = current && !models.some(m => m.id === current)
    ? [{ id: current, name: current }, ...models]
    : [...models];

  if (process.stdin.isTTY && process.stdout.isTTY) {
    return pickModelInline(base, current, provider);
  }

  const short = base.slice(0, SHORT_LIST);
  const choice = await p.select({
    message: `Model for ${provider}`,
    options: [
      ...short.map(m => ({
        value: m.id,
        label: m.name,
        hint: m.id === current ? 'current' : m.id,
      })),
      { value: '__custom', label: 'Type another id...', hint: 'not in the list' },
    ],
  });

  if (p.isCancel(choice)) return null;
  if (choice === '__custom') return askCustomModel(current || fallback);
  return choice as string;
}
