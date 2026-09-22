import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface Provider {
  name: string;
  envKey: string;
  defaultModel: string;
  generate(prompt: string, config: ProviderConfig): Promise<string>;
}

const systemPrompt = 'You are a git commit message generator. Respond only with the commit message, no extra text.';

const DEFAULT_TIMEOUT_MS = 30_000;

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function settings(config: ProviderConfig): { temperature: number; maxTokens: number; timeoutMs: number } {
  return {
    temperature: config.temperature ?? 0.3,
    maxTokens: config.maxTokens ?? 500,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

const openaiProvider: Provider = {
  name: 'openai',
  envKey: 'OPENAI_API_KEY',
  defaultModel: 'gpt-4o-mini',
  async generate(prompt, config) {
    const { temperature, maxTokens, timeoutMs } = settings(config);
    const client = new OpenAI({ apiKey: config.apiKey, timeout: timeoutMs });
    const res = await withTimeout(
      client.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      timeoutMs,
      'OpenAI',
    );
    return res.choices[0]?.message?.content?.trim() ?? '';
  },
};

const anthropicProvider: Provider = {
  name: 'anthropic',
  envKey: 'ANTHROPIC_API_KEY',
  defaultModel: 'claude-sonnet-4-20250514',
  async generate(prompt, config) {
    const { temperature, maxTokens, timeoutMs } = settings(config);
    const client = new Anthropic({ apiKey: config.apiKey, timeout: timeoutMs });
    const res = await withTimeout(
      client.messages.create({
        model: config.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }),
      timeoutMs,
      'Anthropic',
    );
    const block = res.content[0];
    return block?.type === 'text' ? block.text.trim() : '';
  },
};

const geminiProvider: Provider = {
  name: 'gemini',
  envKey: 'GEMINI_API_KEY',
  defaultModel: 'gemini-3.1-flash-lite',
  async generate(prompt, config) {
    const { temperature, maxTokens, timeoutMs } = settings(config);
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({
      model: config.model,
      systemInstruction: systemPrompt,
    });
    const res = await withTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
      timeoutMs,
      'Gemini',
    );
    return res.response.text().trim();
  },
};

const openrouterProvider: Provider = {
  name: 'openrouter',
  envKey: 'OPENROUTER_API_KEY',
  defaultModel: 'openrouter/free',
  async generate(prompt, config) {
    const { temperature, maxTokens, timeoutMs } = settings(config);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/shx-dow/mmit',
        'X-OpenRouter-Title': 'mmit',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenRouter returned ${res.status}: ${body || res.statusText}`);
    }

    const data = await res.json() as {
      error?: { message?: string };
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };

    if (data.error) {
      throw new Error(`OpenRouter error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const choice = data.choices?.[0];

    if (choice?.finish_reason === 'error') {
      throw new Error(`OpenRouter generation failed (finish_reason=error): ${choice?.message?.content || 'no detail'}`);
    }

    const content = choice?.message?.content?.trim() ?? '';
    if (!content) {
      throw new Error('OpenRouter returned an empty response. Try a different model.');
    }
    return content;
  },
};

export const providers: Record<string, Provider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  openrouter: openrouterProvider,
};

export function detectProviderFromEnv(preferred?: string): string | null {
  const order = preferred && providers[preferred]
    ? [preferred, ...Object.keys(providers).filter(k => k !== preferred)]
    : Object.keys(providers);

  for (const name of order) {
    if (process.env[providers[name].envKey]) return name;
  }
  return null;
}