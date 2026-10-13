export const FEEDBACK_STATES = Object.freeze(Object.fromEntries([["VVV",["green","green","green"],"Correto e natural","Domínio demonstrado",2],["VVA",["green","green","yellow"],"Pequeno ajuste","Erro leve, sem prejudicar o sentido",2],["VAA",["green","yellow","yellow"],"Erro relevante","Boa base, mas há algo importante a corrigir",1],["AAA",["yellow","yellow","yellow"],"Compreensível","A ideia foi transmitida, mas precisa melhorar",1],["AAV",["yellow","yellow","red"],"Erros importantes","Dificuldades que comprometem a resposta",0],["AVV",["yellow","red","red"],"Domínio limitado","Poucos elementos corretos identificados",0],["RRR",["red","red","red"],"Domínio não demonstrado","Não houve evidência suficiente de conhecimento",0]].map(([id,colors,title,description,score])=>[id,Object.freeze({colors:Object.freeze(colors),title,description,score})])));
export function renderFeedback(container, grade) {
  container.replaceChildren(); container.classList.remove('hide');
  const state = grade && Object.hasOwn(FEEDBACK_STATES,grade.stateId) && FEEDBACK_STATES[grade.stateId];
  if (!state || typeof grade.analysis !== 'string' || !grade.analysis.trim()) {
    container.textContent = 'Avaliação indisponível. Nenhum domínio foi atribuído.'; return;
  }
  const make=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el;};
  const card=make('section','signal-card');
  const lights=make('div','signal-lights');lights.setAttribute('aria-hidden','true');
  for(const color of state.colors) lights.append(make('span','signal-light '+color));
  card.append(lights,make('h3','signal-title',state.title),make('p','signal-description',state.description));
  const analysis=make('section','teacher-analysis');
  analysis.append(make('h3','teacher-title','Análise do professor'),make('p','teacher-text',grade.analysis));
  container.append(card,analysis);
}
