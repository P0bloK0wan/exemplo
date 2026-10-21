# Reavaliação de tecnologias — LiveKit, Lottie, Motion, OpenJarvis

Critério usado em cada decisão abaixo: **qual problema real do Kliko essa
tecnologia resolveria agora ou na Fase 2** — nunca "porque o ChatGPT/Claude
usa". Nenhuma dependência nova foi adicionada ao `package.json` ainda; este
documento é a análise que antecede qualquer adição.

## LiveKit (WebRTC) — para conversa de voz em tempo real

**O que é:** servidor SFU (Selective Forwarding Unit) WebRTC open-source,
licença Apache 2.0, com SDK de navegador (`client-sdk-js`) e componentes
React. Pode ser self-hosted (Docker/Kubernetes/binário único) ou usado via
LiveKit Cloud (tem um plano gratuito — "Build" — e planos pagos para
hospedagem de agente/inferência/telefonia).

**Problema real do Kliko que resolveria:** hoje a Mini Kliko usa
`SpeechRecognition` (nativo do navegador) para ouvir e `speechSynthesis`
(nativo) para falar — é gratuito, mas é "virar-e-ouvir" (turn-based): grava,
espera o navegador processar, depois a Kliko fala. Não há conversa fluida
*enquanto* o usuário fala, nem interrupção natural. Se o objetivo for uma
conversa de voz em tempo real de verdade (o usuário pode interromper a Kliko,
latência baixa, qualidade de voz melhor que a `SpeechSynthesis` do sistema),
isso exige streaming de áudio bidirecional de baixa latência — que é
exatamente o que WebRTC resolve e `SpeechRecognition`/`speechSynthesis` não
fazem.

**Decisão:** **não adicionar agora.** LiveKit só faz sentido *junto* com um
modelo de voz em tempo real do lado do servidor (ex.: `gpt-realtime-2.1`, já
pesquisado anteriormente) — sem um modelo do outro lado da conexão, o
transporte não tem o que carregar. Como qualquer integração de modelo pago
exige sua aprovação prévia (custos + arquitetura), LiveKit entra na mesma
decisão: será avaliado tecnicamente como parte da proposta de voz em tempo
real, não como biblioteca isolada. Guardunder consideração para quando essa
aprovação vier.

## Lottie — animações vetoriais

**O que é:** `lottie-web`, licença MIT, renderiza animações exportadas do
Adobe After Effects (via plugin Bodymovin) como JSON. Projeto ativo
(2.436+ commits, atividade recente).

**Problema real do Kliko que resolveria:** o catálogo de 120 animações tem
uma categoria inteira de "Materiais/Profundidade/Liquid Glass" e algumas
transições complexas de UI (categoria J do catálogo) que são mais fáceis de
desenhar visualmente em uma ferramenta de motion design do que descrever em
spring physics via código. Hoje, 100% das 20 animações essenciais da Fase 1
são feitas com `motion` (CSS/transform/spring) — nenhuma delas precisa de
Lottie, porque são todas transformações de forma/posição/opacidade de
elementos de UI reais (o orbe, os painéis, os sliders), não ilustrações
desenhadas à mão.

**Decisão:** **não adicionar na Fase 2.** Não há, hoje, nenhuma animação no
catálogo que exija um ilustrador externo desenhando quadro-a-quadro — todas
são geometria/física de UI, que `motion` já cobre nativamente e com menos
peso (sem carregar um player JSON adicional). Reavaliar só se surgir uma
necessidade concreta de ilustração animada (ex.: um mascote ou ícone
elaborado) que não seja apenas transformação de um elemento de UI existente.

## Motion (antigo Framer Motion) — já em uso

**O que é:** biblioteca de animação para React, já é dependência do Kliko
desde a Fase 1 (`motion` ^14.4.0). Usada para `layoutId`/`layout` (orbe↔painel,
miniatura↔editor), springs centralizadas em `motion/tokens.ts`, e drag do
orbe.

**Problema real do Kliko que resolveria:** continua sendo a peça certa para
tudo que é geometria compartilhada entre estados de UI (exatamente o
`matchedGeometryEffect` do SwiftUI, mas na web) e para física de mola
configurável — que é o coração da identidade visual da Mini Kliko. Na Fase 2,
será a base para: abrir/fechar o painel de sugestões de IA, animar a
transição entre "antes" e "depois" no preview de ajustes com máscara, e
animar o indicador de região selecionada sobre a foto.

**Decisão:** **manter e expandir o uso**, sem adicionar nada novo — já atende
às necessidades reais, incluindo as da Fase 2 abaixo.

## OpenJarvis — referência de arquitetura de agente

Já analisado em profundidade em `claude/kliko-analise-openjarvis.md` (doc do
projeto). Resumo da decisão, reafirmada aqui no contexto da Fase 2:

**Problema real do Kliko que resolveria:** a Fase 2 precisa de um padrão para
registrar "operações de edição disponíveis" (exposição, contraste, máscara de
céu, recuperação de highlights, etc.) de forma extensível, para que um modelo
multimodal possa escolher entre elas de forma estruturada — e, futuramente,
um protocolo padronizado para conectar esse modelo a essas operações.

**Decisão:** **não integrar como dependência** (é um daemon Python/Rust de
desktop, incompatível com o Kliko rodando no Safari do iPhone), mas **usar
dois padrões dele como inspiração conceitual, implementados do zero em
TypeScript**:
1. O padrão de *registro de ferramentas* (`core/registry.py`) — cada operação
   de edição registrada com um "schema" (nome, parâmetros, intervalo válido) —
   vira a base do "catálogo de operações" descrito na arquitetura da Fase 2
   (§3 do plano técnico).
2. O conceito de MCP (Model Context Protocol) como *forma* de conectar um
   modelo externo a essas operações — não o código deles, mas o padrão de
   "o modelo recebe uma lista de ferramentas disponíveis e devolve uma
   chamada estruturada" — é exatamente o que a Fase 2 precisa do modelo
   multimodal (ver plano técnico).

Nenhum código do OpenJarvis foi copiado; os dois pontos acima são padrões de
engenharia de software genéricos, não específicos do projeto.

## Resumo das decisões

| Tecnologia | Decisão | Motivo |
|---|---|---|
| LiveKit | Não adicionar agora | Só faz sentido com um modelo de voz em tempo real pago, que exige sua aprovação prévia — será avaliado junto |
| Lottie | Não adicionar | Nenhuma animação do catálogo exige ilustração externa; `motion` já cobre tudo |
| Motion | Manter e expandir | Já é a base real da Mini Kliko e cobre as necessidades da Fase 2 |
| OpenJarvis | Não integrar como dependência; usar 2 padrões conceituais (registro de ferramentas, protocolo tipo-MCP) implementados do zero | Incompatível tecnicamente como dependência; útil como padrão de design |
