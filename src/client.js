import { renderFeedback } from './feedback.js';
const $ = id => document.getElementById(id);
let state, waiting = false, busy = false;
function show(id) { ['welcome','quiz','result'].forEach(x => $(x).classList.toggle('hide', x !== id)); }
function message(text) { $('feedback').textContent = text; $('feedback').classList.remove('hide'); }
async function api(path, body) {
  const response = await fetch(`/api/${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type':'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) { const e = new Error(data.error || 'Não foi possível conectar. Tente novamente.'); e.expired = data.expired; throw e; }
  return data;
}
function lock(value) {
  busy = value;
  ['start','next','skip','restart'].forEach(id => $(id).disabled = value);
  $('answer').disabled = value || waiting;
}
function render() {
  waiting = false;
  if (state.result) return finish();
  show('quiz');
  $('count').textContent = `PERGUNTA ${state.task.id} DE ${state.total}`;
  $('bar').style.width = `${state.answered / state.total * 100}%`;
  $('question').textContent = state.task.prompt;
  $('tag').textContent = state.task.kind;
  $('answer').value = '';
  $('answer').disabled = false;
  $('feedback').classList.add('hide');
  $('next').textContent = 'Responder →';
  $('skip').classList.remove('hide');
  $('answer').focus();
}
async function start() {
  if (busy) return;
  lock(true); $('startStatus').textContent = 'Iniciando…';
  try { state = await api('start', {}); $('startStatus').textContent = ''; render(); }
  catch (e) { $('startStatus').textContent = e.message; }
  finally { lock(false); }
}
async function respond(skip = false) {
  if (busy) return;
  if (waiting) { render(); return; }
  const answer = skip ? 'não sei' : $('answer').value.trim();
  if (!answer) return $('answer').focus();
  lock(true); message('Avaliando sua resposta…');
  try {
    state = await api('answer', { taskId: state.task.id, answer });
    waiting = true;
    if (state.result) { finish(); return; }
    renderFeedback($('feedback'), state.feedback);
    $('skip').classList.add('hide'); $('next').textContent = 'Próxima pergunta →';
    $('bar').style.width = `${state.answered / state.total * 100}%`;
  } catch (e) {
    if (e.expired) { show('welcome'); $('startStatus').textContent = e.message; }
    else message(e.message);
  } finally { lock(false); }
}
function finish() {
  show('result'); const r = state.result;
  $('number').textContent = r.level === null ? 'Sem estimativa' : `${r.level}/18`;
  $('cefr').textContent = r.band ? `Estimativa por texto · ${r.band}` : 'Evidência insuficiente';
  $('summary').textContent = r.level === null ? 'Não houve evidência linguística suficiente para estimar seu nível. Tente responder em inglês, mesmo que apenas parte da frase.' : `Estimativa experimental baseada nas funções demonstradas nas respostas. ${r.provisional ? 'A amostra ainda é limitada; o nível precisa de confirmação.' : 'Houve evidência repetida na faixa indicada.'} Faixas não sondadas permanecem desconhecidas.`;
  $('details').replaceChildren();
  const good = r.attempts.filter(a => a.task.representative && a.grade.score === 2);
  const partial = r.attempts.findLast(a => a.task.representative && a.grade.score < 2);
  const points = [...new Set(good.map(a => `${a.task.function} (${a.task.band})`))].slice(-3).map(x => `Demonstrou: ${x}.`);
  if (partial) points.push(`Próximo passo: ${partial.grade.feedback}`);
  if (!points.length) points.push('Precisamos de mais respostas em contexto para identificar seus pontos fortes.');
  for (const text of points) { const li = document.createElement('li'); li.textContent = text; $('details').append(li); }
  renderFeedback($('lastFeedback'), state.feedback);
  window.report = `LEVEL18 ${state.version}\nEstimativa: ${r.level === null ? 'insuficiente' : r.level + '/18'} ${r.band ?? ''}\n\n` + r.attempts.map(a => `${a.task.id}. ${a.task.prompt}\nResposta: ${a.answer}\nEstado: ${a.grade.stateId ?? 'indisponível'}\nNota funcional: ${a.grade.score}\nFeedback: ${a.grade.feedback}\nEvidência: ${a.grade.evidence}`).join('\n\n');
  $('copyStatus').textContent = '';
}
$('start').onclick = start;
$('next').onclick = () => respond();
$('skip').onclick = () => respond(true);
$('restart').onclick = () => { waiting = false; show('welcome'); window.scrollTo(0,0); };
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(window.report); $('copyStatus').textContent = 'Relatório copiado.'; } catch { $('copyStatus').textContent = 'O navegador não permitiu copiar o relatório.'; } };
try { state = await api('state'); render(); } catch { /* A new visit starts on the welcome screen. */ }
