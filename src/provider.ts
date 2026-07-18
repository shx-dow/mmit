import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

export interface Provider {
  name: string;
  generate(prompt: string, config: ProviderConfig): Promise<string>;
}

const systemPrompt = 'You are a git commit message generator. Respond only with the commit message, no extra text.';

const openaiProvider: Provider = {
  name: 'openai',
  async generate(prompt, config) {
    const client = new OpenAI({ apiKey: config.apiKey });
    const res = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: config.maxTokens ?? 300,
    });
    return res.choices[0]?.message?.content?.trim() ?? '';
  },
};

const anthropicProvider: Provider = {
  name: 'anthropic',
  async generate(prompt, config) {
    const client = new Anthropic({ apiKey: config.apiKey });
    const res = await client.messages.create({
      model: config.model,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: config.maxTokens ?? 300,
    });
    const block = res.content[0];
    return block?.type === 'text' ? block.text.trim() : '';
  },
};

const geminiProvider: Provider = {
  name: 'gemini',
  async generate(prompt, config) {
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({
      model: config.model,
      systemInstruction: systemPrompt,
    });
    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: config.maxTokens ?? 300,
      },
    });
    return res.response.text().trim();
  },
};

const openrouterProvider: Provider = {
  name: 'openrouter',
  async generate(prompt, config) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/mmit',
        'X-OpenRouter-Title': 'mmit',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: config.maxTokens ?? 300,
      }),
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
      return '';
    }

    return choice?.message?.content?.trim() ?? '';
  },
};

export const providers: Record<string, Provider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  openrouter: openrouterProvider,
};
