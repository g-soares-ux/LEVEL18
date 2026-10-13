import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDBACK_STATES, renderFeedback } from '../src/feedback.js';
import { grade, warmup } from '../src/diagnostic.js';

test('seven immutable states render fixed labels separately from untrusted analysis', async () => {
  class Element {
    children=[]; classList={remove(){}};
    append(...children){this.children.push(...children);}
    replaceChildren(){this.children=[];}
    setAttribute(){}
  }
  globalThis.document={createElement:()=>new Element()};
  try {
    assert.equal(Object.keys(FEEDBACK_STATES).length,7);
    for (const [stateId,state] of Object.entries(FEEDBACK_STATES)) {
      assert.ok(Object.isFrozen(state) && Object.isFrozen(state.colors));
      const analysis='<img src=x onerror=alert(1)>';
      const result=await grade({AI:{run:async(_,input)=>{
        assert.deepEqual(input.response_format.json_schema.required,['stateId','analysis']);
        return {response:{stateId,analysis}};
      }}},warmup(1),'dog',[]);
      const container=new Element();
      renderFeedback(container,{...result,title:'Injected title',colors:['red']});
      const [card,teacher]=container.children;
      assert.equal(card.children[0].children.length,3);
      assert.equal(card.children[1].textContent,state.title);
      assert.equal(card.children[2].textContent,state.description);
      assert.equal(teacher.children[0].textContent,'Análise do professor');
      assert.equal(teacher.children[1].textContent,analysis);
      assert.equal(teacher.children[1].children.length,0);
    }
    const container=new Element();
    for(const invalid of [null,{score:2,feedback:'legacy'},{stateId:'unknown',analysis:'x'}]) {
      renderFeedback(container,invalid);
      assert.equal(container.children.length,0);
      assert.match(container.textContent,/indisponível/);
    }
  } finally {delete globalThis.document;}
});

test('reject unknown states, extra style fields, empty analysis and absent AI',async()=>{
  for(const response of [{stateId:'???',analysis:'x'},{stateId:'VVV',analysis:'x',title:'hack'},{stateId:'VVV',analysis:' '}]) {
    await assert.rejects(grade({AI:{run:async()=>({response})}},warmup(1),'dog',[]));
  }
  await assert.rejects(grade({},warmup(1),'dog',[]));
  await assert.rejects(grade({},warmup(1),'não sei',[]));
});
