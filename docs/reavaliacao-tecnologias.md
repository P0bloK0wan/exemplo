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

**Decisão atualizada (Fase 2 — autorizado e implementado experimentalmente):**
adicionado `livekit-client` (SDK oficial) como dependência e criado
`src/engine/liveVoiceEngine.ts` — um módulo de conexão WebRTC isolado, com
estados de conexão/erro/reconexão, controle de microfone, e um ponto
preparado (não implementado) para interrupção de resposta. Testável numa
aba isolada do Laboratório (`LiveKitTestPanel.tsx`), que só se conecta a um
servidor LiveKit que você mesmo configure e com um token que você mesmo
gere — nenhuma credencial embutida, nenhum token falso. **Continua sem
sentido funcional completo sozinho:** não há um modelo de voz do outro lado
da conexão ainda, então o módulo só prova a infraestrutura de transporte —
ver §3 do plano técnico da Fase 2. A Mini Kliko continua usando só a Web
Speech API gratuita no dia a dia; o LiveKit fica isolado no Laboratório.

## Lottie — animações vetoriais

**O que é:** `lottie-web`, licença MIT, renderiza animações exportadas do
Adobe After Effects (via plugin Bodymovin) como JSON. Projeto ativo
(2.436+ commits, atividade recente).

**Problema real do Kliko que resolveria:** o catálogo de 120 animações tem
uma categoria inteira de "Materiais/Profundidade/Liquid Glass" e algumas
transições complexas de UI (categoria J do catálogo) que são mais fáceis de
desenhar visualmente em uma ferramenta de motion design do que descrever em
spring physics via código. Os 4 sliders globais e a transformação orbe↔painel
continuam sendo 100% `motion` — nenhum deles precisa de Lottie, porque são
transformações de forma/posição/opacidade de elementos de UI reais, não
ilustrações desenhadas à mão.

**Decisão atualizada (Fase 2 — autorizado e implementado experimentalmente):**
adicionado `lottie-web` como dependência e criada uma animação vetorial
**original** (autoria própria, `src/assets/lottie/kliko-processing.json`,
escrita à mão em JSON Bodymovin — não extraída de nenhum app) para o estado
"Kliko está analisando o histograma", usado em `ProcessingLottie.tsx` dentro
da Mini Kliko. É o único lugar que usa Lottie hoje — os 120 itens do catálogo
continuam sendo `motion` por padrão; Lottie só entra quando a animação é de
fato uma ilustração (pontos orbitando, não geometria de um elemento de UI
existente). Respeita `prefers-reduced-motion` (ver `ProcessingLottie.tsx`).

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

## Resumo das decisões (atualizado após autorização da Fase 2)

| Tecnologia | Decisão | Motivo |
|---|---|---|
| LiveKit | **Implementado experimentalmente** (`liveVoiceEngine.ts` + aba de teste no Laboratório), sem credenciais embutidas, sem serviço pago contratado | Infraestrutura de transporte isolada, pronta para quando houver um modelo de voz do outro lado; Web Speech continua sendo o caminho principal |
| Lottie | **Implementado experimentalmente**: 1 animação vetorial original (`ProcessingLottie.tsx`) para o estado "analisando" | Único caso no catálogo que é ilustração, não geometria de UI — tudo o resto continua `motion` |
| Motion | Mantido e expandido | Já é a base real da Mini Kliko e cobre as necessidades da Fase 2 |
| OpenJarvis | Não integrado como dependência; 2 padrões conceituais (catálogo de operações validadas em `editOperations.ts`, protocolo tipo-MCP) implementados do zero em TypeScript | Incompatível tecnicamente como dependência; útil como padrão de design |
