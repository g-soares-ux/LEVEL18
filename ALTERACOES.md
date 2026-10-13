# Feedback LEVEL 18

Implementado na cópia local do projeto Workers AI existente. Não publicado.

- Cartão com três círculos CSS, título e descrição fixos, seguido por seção independente “Análise do professor”. Aplicado após respostas e no último feedback do resultado.
- Sete estados imutáveis: VVV, VVA, VAA, AAA, AAV, AVV e RRR. AAV usa amarelo/amarelo/vermelho; AVV usa amarelo/vermelho/vermelho, conforme a sequência aprovada. RRR representa vermelho três vezes.
- A avaliação da IA retorna exclusivamente `{stateId, analysis}`. Campos adicionais, identificadores desconhecidos e análise vazia são rejeitados. Conteúdo individual é inserido como texto, sem HTML executável.
- Falha ou ausência de IA não produz semáforo nem nota e não avança a pergunta. “Não sei” também passa pela IA. Avaliações antigas sem identificador não são convertidas artificialmente.
- Compatibilidade com o diagnóstico: o servidor deriva nota 2 para VVV/VVA, 1 para VAA/AAA e 0 para AAV/AVV/RRR. Guarda a resposta inteira como evidência para estados diferentes de RRR. Não há mais extração de trecho nem classificação lexical pela IA; erros abaixo de nota 2 recebem classificação interna conservadora structural. Essa adaptação pode alterar a estimativa e precisa de calibração pedagógica antes de produção.

Validação: 13 testes automatizados, incluindo fluxo de 15 perguntas, falha da IA, sete estados, imutabilidade, separação dos blocos, texto não executável e rejeição do contrato inválido; build estático executado. Os testes usam IA simulada e DOM mínimo; não houve inspeção visual em navegador nem teste com IA real nesta entrega.

Execute `npm test` e `npm run build`. O build inclui feedback.js nos assets públicos. Para hospedar, siga a configuração Cloudflare existente; abrir index.html diretamente não fornece a API de avaliação.

Este documento descreve a versão atual e substitui as afirmações sobre o antigo contrato de avaliação no README original.
