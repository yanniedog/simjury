/**
 * Shared Ollama helpers for local PR review tooling.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const DEFAULT_OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');
export const DEFAULT_REVIEW_MODEL = process.env.LOCAL_REVIEW_MODEL || 'qwen2.5-coder:7b';

export function log(msg) {
  console.error(`[local-ollama] ${msg}`);
}

export function findOllamaBin() {
  const fromEnv = (process.env.OLLAMA_BIN || '').trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const which = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['ollama'], {
    encoding: 'utf8',
  });
  if (which.status === 0) {
    const first = (which.stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (first && existsSync(first)) return first;
  }
  if (process.platform === 'win32') {
    const candidates = [
      `${process.env.LOCALAPPDATA}\\Programs\\Ollama\\ollama.exe`,
      `${process.env.ProgramFiles}\\Ollama\\ollama.exe`,
    ];
    for (const c of candidates) {
      if (c && existsSync(c)) return c;
    }
  }
  return null;
}

export async function ollamaFetch(path, { method = 'GET', body, timeoutMs = 30_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${DEFAULT_OLLAMA_HOST}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureOllamaReady() {
  try {
    const r = await ollamaFetch('/api/tags', { timeoutMs: 5_000 });
    if (!r.ok) {
      throw new Error(`Ollama API HTTP ${r.status}: ${(r.text || '').slice(0, 200)}`);
    }
    return r.json;
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'timed out connecting to Ollama' : e.message;
    throw new Error(
      `Ollama is not reachable at ${DEFAULT_OLLAMA_HOST} (${msg}). Start it with: ollama serve`,
    );
  }
}

export function modelNamesFromTags(tagsJson) {
  return (tagsJson?.models || []).map((m) => m.name).filter(Boolean);
}

export async function ensureModelPresent(model = DEFAULT_REVIEW_MODEL) {
  const tags = await ensureOllamaReady();
  const names = modelNamesFromTags(tags);
  const exact = names.includes(model);
  const base = model.includes(':') ? model : `${model}:latest`;
  const present = exact || names.includes(base) || names.some((n) => n.startsWith(`${model.split(':')[0]}:`));
  if (!present) {
    throw new Error(
      `Model "${model}" is not installed. Run: ollama pull ${model}\nInstalled: ${names.join(', ') || '(none)'}`,
    );
  }
  return names;
}

export async function chatReview({
  model = DEFAULT_REVIEW_MODEL,
  system,
  user,
  temperature = 0.2,
  timeoutMs = 600_000,
}) {
  await ensureModelPresent(model);
  log(`requesting review from ${model} (timeout ${timeoutMs}ms)`);
  const r = await ollamaFetch('/api/chat', {
    method: 'POST',
    timeoutMs,
    body: {
      model,
      stream: false,
      options: {
        temperature,
        num_ctx: 16384,
      },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  });
  if (!r.ok) {
    throw new Error(`Ollama chat failed HTTP ${r.status}: ${(r.text || '').slice(0, 500)}`);
  }
  const content = r.json?.message?.content;
  if (!content || !String(content).trim()) {
    throw new Error('Ollama returned an empty review');
  }
  return {
    content: String(content).trim(),
    model: r.json?.model || model,
    totalDurationNs: r.json?.total_duration,
    evalCount: r.json?.eval_count,
  };
}

export const REVIEW_SYSTEM_PROMPT = `You are a senior software engineer performing a defect-first pull request review.

Rules:
- Focus on bugs, security issues, regressions, broken contracts, missing tests, and merge risks.
- Cite file paths and approximate lines from the diff when possible.
- Skip pure style nits unless they hide a real defect.
- Do not invent issues. If the change looks sound, say so briefly.
- Prefer concrete, actionable fixes.

Output exactly these sections:
## Summary
(1-2 sentences)

## Findings
Ordered by severity using labels: blocker / major / minor.
If none, write: None.

## Residual risks / test gaps
Short bullets.`;
