import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { DiagnosticSession, readBody } from '../src/worker.js';
import { target, estimate, grade, warmup } from '../src/diagnostic.js';
const attempt = (band='A1', score=2, fn='recado', domain='P', stage=1) => ({task:{id:1,band,stage,domain,function:fn,representative:true},answer:'hello',grade:{score,evidence:'hello',errorType:'none',feedback:'ok'}});
test('warmups cannot establish a band; missing evidence is not zero', () => {
  assert.equal(estimate([]).level, null);
  assert.equal(estimate([{task:warmup(1), grade:{score:2,evidence:'dog'}}]).level, 0);
});
test('route needs two independent functions and isolated failure does not demote', () => {
  assert.equal(target([attempt()]).band,'A1');
  assert.equal(target([attempt(), attempt('A1',2,'descrição')]).band,'A2');
  assert.equal(target([attempt('B1',0)]).band,'B1');
  assert.equal(target([attempt('B1',0),attempt('B1',0,'outro')]).band,'A2');
});
test('harder isolated success does not override supported lower band', () => {
  assert.equal(estimate([attempt(),attempt('A1',2,'descrição'),attempt('B2')]).level,1);
});
test('stage three needs reading and two productions; recurrent contradiction removes band', () => {
  const xs=[attempt('B1',2,'recado','P',3),attempt('B1',2,'relato','P',3)];
  assert.equal(estimate(xs).level,8);
  xs.push(attempt('B1',2,'leitura','R',2)); assert.equal(estimate(xs).level,9);
  xs.push(attempt('B1',0,'outra'),attempt('B1',0,'outra2'),attempt(),attempt('A1',2,'descrição'));
  assert.equal(estimate(xs).level,1);
});
test('malformed grades and fabricated evidence fail closed', async () => {
  for (const response of ['not json',JSON.stringify({score:18}),JSON.stringify({score:2,evidence:'invented',feedback:'ok',errorType:'none'})]) {
    await assert.rejects(grade({AI:{run:async()=>({response})}},warmup(1),'dog',[]));
  }
});
function harness() {
  let saved; let calls=0;
  const storage={get:async()=>structuredClone(saved),put:async(_,s)=>{saved=structuredClone(s);},setAlarm:async()=>{},deleteAll:async()=>{saved=undefined;}};
  const env={AI_MODEL:'mock',AI:{run:async(_,input)=>{
    calls++;
    const data=JSON.parse(input.messages[1].content);
    if (input.response_format.json_schema.properties.score) return {response:{score:2,evidence:data.answer,feedback:'Boa resposta.',errorType:'none'}};
    return {response:{prompt:`Situação inédita ${data.target.id}: escreva em inglês.`,criterion:'Comunique o propósito.'}};
  }}};
  const session=new DiagnosticSession({storage},env);
  const send=(path,data)=>session.fetch(new Request(`https://test/api/${path}`,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined}));
  return {send,env,session,calls:()=>calls};
}
test('full 15-question flow, concurrent retries, final result, expiry',async()=>{
  const h=harness(); assert.equal((await h.send('start',{})).status,200);
  const responses=await Promise.all([h.send('answer',{taskId:1,answer:'dog'}),h.send('answer',{taskId:1,answer:'dog'})]);
  assert.equal(h.calls(),1); assert.equal((await responses[1].json()).answered,1);
  assert.equal((await h.send('answer',{taskId:1,answer:'cat'})).status,409);
  for(let id=2;id<=15;id++) {
    const response=await h.send('answer',{taskId:id,answer:'My answer in English.'});
    assert.equal(response.status,200);
    const data=await response.json(); assert.equal(data.answered,id);
    if(id===15){assert.equal(data.task,null);assert.equal(data.result.attempts.length,15);}
  }
  await h.session.alarm(); assert.equal((await h.send('state')).status,410);
});
test('inference errors keep the current question and do not record a zero',async()=>{
  const h=harness(); await h.send('start',{});
  h.env.AI.run=async()=>{throw new Error('provider down');};
  assert.equal((await h.send('answer',{taskId:1,answer:'dog'})).status,503);
  const s=await (await h.send('state')).json(); assert.equal(s.answered,0);assert.equal(s.task.id,1);
});
test('API rejects cross-origin, invalid method, missing session, and enforces limiter',async()=>{
  const env={AI_ENABLED:'true',RATE_LIMITER:{limit:async()=>({success:true})}};
  assert.equal((await worker.fetch(new Request('https://test/api/start',{method:'POST',headers:{Origin:'https://evil'}}),env)).status,403);
  assert.equal((await worker.fetch(new Request('https://test/api/start'),env)).status,405);
  assert.equal((await worker.fetch(new Request('https://test/api/state'),env)).status,401);
  env.RATE_LIMITER.limit=async()=>({success:false});
  assert.equal((await worker.fetch(new Request('https://test/api/state'),env)).status,429);
});
test('oversized request rejected before inference',async()=>{
  await assert.rejects(readBody(new Request('https://test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answer:'x'.repeat(13000)})})));
});
