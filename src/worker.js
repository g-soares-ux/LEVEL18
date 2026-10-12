import { TOTAL, VERSION, warmup, grade, nextTask, estimate, validText } from './diagnostic.js';
const TTL = 2 * 60 * 60 * 1000;
export const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
export async function readBody(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let size = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 12000) { await reader.cancel(); throw new Error('body'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('body');
  return data;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!['/api/start','/api/state','/api/answer'].includes(url.pathname)) return json({ error: 'Rota não encontrada.' }, 404);
    if (request.method !== (url.pathname === '/api/state' ? 'GET' : 'POST')) return json({ error: 'Método não permitido.' }, 405);
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (request.method === 'POST' && request.headers.get('origin') !== url.origin)) return json({ error: 'Origem não permitida.' }, 403);
    if (env.AI_ENABLED !== 'true') return json({ error: 'Diagnóstico temporariamente indisponível.' }, 503);
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      if (!(await env.RATE_LIMITER.limit({ key: ip })).success) return json({ error: 'Muitas tentativas. Aguarde um minuto.' }, 429, { 'Retry-After': '60' });
      let id;
      if (url.pathname === '/api/start') id = env.SESSIONS.newUniqueId();
      else {
        const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-level18=([a-f0-9]{64})(?:;|$)/)?.[1];
        if (!cookie) return json({ error: 'Inicie um diagnóstico.', expired: true }, 401);
        try { id = env.SESSIONS.idFromString(cookie); } catch { return json({ error: 'Sessão inválida.', expired: true }, 401); }
      }
      const response = await env.SESSIONS.get(id).fetch(request);
      if (url.pathname !== '/api/start' || !response.ok) return response;
      const headers = new Headers(response.headers);
      headers.set('Set-Cookie', `__Host-level18=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL/1000}`);
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return json({ error: 'Serviço indisponível. Sua resposta não foi perdida; tente novamente.' }, 503);
    }
  }
};

export class DiagnosticSession {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.queue = Promise.resolve(); }
  // Serialize the whole attempt, including inference, to avoid double grading concurrent retries.
  fetch(request) {
    const job = this.queue.then(() => this.handle(request));
    this.queue = job.catch(() => {});
    return job;
  }
  async alarm() { await this.queue; await this.ctx.storage.deleteAll(); }
  snapshot(s) {
    return { version: VERSION, total: TOTAL, answered: s.attempts.length,
      task: s.task ? { id: s.task.id, prompt: s.task.prompt, kind: s.task.domain === 'R' ? 'Leitura' : 'Produção escrita' } : null,
      feedback: s.attempts.at(-1)?.grade ?? null,
      result: s.attempts.length === TOTAL ? { ...estimate(s.attempts), attempts: s.attempts } : null };
  }
  async handle(request) {
    const path = new URL(request.url).pathname;
    if (path === '/api/start') {
      const state = { expires: Date.now() + TTL, attempts: [], task: warmup(1) };
      await this.ctx.storage.setAlarm(state.expires);
      await this.ctx.storage.put('state', state);
      return json(this.snapshot(state));
    }
    const state = await this.ctx.storage.get('state');
    if (!state || state.expires < Date.now()) return json({ error: 'Sessão expirada. Inicie novamente.', expired: true }, 410);
    if (path === '/api/state') return json(this.snapshot(state));
    let data;
    try { data = await readBody(request); } catch { return json({ error: 'Envie uma resposta válida de até 2.000 caracteres.' }, 400); }
    if (!Number.isInteger(data.taskId) || !validText(data.answer, 2000)) return json({ error: 'Preencha a resposta (máximo de 2.000 caracteres).' }, 400);
    const previous = state.attempts.find(a => a.task.id === data.taskId);
    if (previous) return previous.answer === data.answer.trim() ? json(this.snapshot(state)) : json({ error: 'Esta pergunta já foi respondida. Recarregue a página.' }, 409);
    if (!state.task || data.taskId !== state.task.id) return json({ error: 'Pergunta desatualizada. Recarregue a página.' }, 409);
    try {
      const answer = data.answer.trim();
      const assessment = await grade(this.env, state.task, answer, state.attempts);
      const attempts = [...state.attempts, { task: state.task, answer, grade: assessment }];
      const task = attempts.length < TOTAL ? await nextTask(this.env, attempts) : null;
      if (state.expires < Date.now()) {
        await this.ctx.storage.deleteAll();
        return json({ error: 'Sessão expirada. Inicie novamente.', expired: true }, 410);
      }
      const updated = { ...state, attempts, task };
      await this.ctx.storage.put('state', updated);
      return json(this.snapshot(updated));
    } catch {
      // Never replace a failed inference with a zero or advance the diagnostic.
      return json({ error: 'A IA não conseguiu concluir a avaliação. Sua resposta foi mantida na tela. Tente novamente.' }, 503);
    }
  }
}
