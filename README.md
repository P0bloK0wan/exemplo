# Kliko — Fase 1 + Fase 2 (inteligência fotográfica real)

Este é o início real do Kliko: uma inteligência artificial para edição de fotografias, com a Mini Kliko (a nuvem azul flutuante) como interface central. Este README está em primeira pessoa porque documenta as escolhas que fiz em cada fase, não um manual genérico — é para você (ou qualquer pessoa que continue o projeto) entender o porquê de cada decisão.

## O que eu entreguei

Três telas navegáveis por abas, tudo rodando no navegador (testado para Safari no iPhone):

- **Galeria** — importa fotografias reais do seu iPhone (`<input type="file" accept="image/*">`, que abre o seletor nativo de Fotos/Câmera do iOS). Não há fotos de exemplo fixas: tudo que aparece aqui é o que você importou.
- **Editor** — mostra a fotografia num canvas e aplica ajustes de **exposição, contraste, saturação e temperatura** de verdade, em tempo real, sobre os pixels da imagem, com **desfazer/refazer** reais (botões ↺/↻ no topo) e **análise real de histograma** rodando em segundo plano a cada foto carregada. Segure a foto para comparar com o original.
- **Laboratório** — onde você testa as 20 animações essenciais isoladamente, ajusta a física da mola (rigidez/amortecimento) ao vivo, e agora também uma aba experimental para testar a infraestrutura de voz em tempo real (LiveKit).

## Fase 2 — o que mudou na edição

- **Histograma real** (`src/engine/photoAnalysis.ts`): luminância e canais R/G/B calculados pixel a pixel sobre uma versão reduzida da foto (até 640px no lado maior — rápido mesmo em fotos de 12+ megapixels do iPhone), com detecção de clipping de sombra/realce (pixels 100% saturados, sem informação recuperável).
- **Sugestões por regras, não IA** (`src/engine/ruleSuggestions.ts`): quando você pede "melhore a iluminação", "deixe o céu mais azul" ou "recupere os detalhes dos realces", a Mini Kliko calcula uma resposta a partir do histograma real — se/então determinístico, nunca chamado de "análise multimodal" na interface, porque não é. Ela também é honesta quando não há nada a fazer (ex.: exposição já equilibrada) ou quando não há o que recuperar (realce 100% saturado).
- **Histórico não destrutivo de verdade** (`src/engine/editHistory.ts`): um reducer genérico com `draft` (prévia, nunca aplicada até confirmar), `present` (confirmado) e pilhas de desfazer/refazer. Cancelar restaura exatamente o estado anterior; confirmar empilha; desfazer/refazer navegam entre estados confirmados.
- **Edição seletiva por máscara, pixels de verdade** (`src/engine/pixelOps.ts`): a camada experimental "céu" lê `ImageData` real e escreve um novo array de pixels, misturando o valor ajustado com o original pelo alfa da máscara — não é um filtro CSS num elemento HTML, é manipulação de pixel.
- **Máscara de céu — limites explícitos**: heurística de posição (topo da imagem) + cor (azul dominante), sem qualquer noção de rosto/pessoa e sem segmentação semântica. A interface avisa quando a confiança é baixa, em vez de prometer identificar qualquer céu.

## A Mini Kliko

É o componente que mais me preocupei em acertar. Ela não é um botão que abre uma tela de chat separada — é a mesma esfera azul flutuante que **se transforma** no painel de controles, usando `layoutId` compartilhado do Motion (o equivalente web ao `matchedGeometryEffect` do SwiftUI). Você pode:

- Tocar para abrir (ela começa a "ouvir" e expande a borda).
- Arrastar a esfera livremente pela tela quando fechada.
- Ver o painel surgir *de dentro* da esfera, não como uma tela nova.
- Ajustar os sliders dentro do painel e ver a foto mudar em tempo real.
- **Desfazer** (volta tudo a zero) ou **Concluir** (fecha o painel, mantendo os ajustes aplicados de forma não destrutiva).

## Sobre o reconhecimento de voz — sendo honesto sobre o que é real

Eu liguei a Mini Kliko à **Web Speech API real** do navegador (`SpeechRecognition`/`webkitSpeechRecognition`). Quando essa API está disponível e com permissão de microfone, a transcrição que você vê é genuína. **Mas** a cobertura dessa API no Safari iOS é inconsistente, então, quando ela não está disponível (ou dá erro), a Mini Kliko cai para uma **demonstração simulada** — e isso aparece escrito explicitamente na tela ("· demonstração simulada"), como você pediu. Nunca finjo que é reconhecimento real quando não é.

A interpretação do comando de voz nesta fase é uma correspondência simples de palavras-chave (ex: "iluminada" → aumenta exposição) — não é o modelo multimodal ainda. É só o suficiente para provar o fluxo completo: falar → a Kliko entender → aplicar no slider → pedir confirmação.

## O que é real vs. o que ainda é preparação

| Parte | Status |
|---|---|
| Importar foto do iPhone | **Real** |
| Exposição/contraste/saturação/temperatura | **Real** — processamento de pixels via Canvas, não CSS decorativo |
| Foto original preservada (edição não destrutiva) | **Real** — cada ajuste redesenha a partir do bitmap original |
| Histograma, regiões claras/escuras, clipping | **Real** — cálculo pixel a pixel, `src/engine/photoAnalysis.ts` |
| Sugestão de "melhorar iluminação" / "céu mais azul" / "recuperar realces" | **Real, por regras determinísticas** — não é IA multimodal, ver `ruleSuggestions.ts` |
| Desfazer / refazer / confirmar / cancelar | **Real** — histórico genérico testado em `editHistory.test.ts` |
| Máscara seletiva de céu | **Real, mas experimental** — heurística simples de posição+cor, sem detecção de rosto, avisa quando a confiança é baixa |
| Transformação orb → painel | **Real**, com física de mola |
| Reconhecimento de voz | **Real quando o navegador suporta**, com fallback simulado identificado |
| Animação "Kliko analisando" (Lottie) | **Real** — animação vetorial original, não extraída de nenhum app |
| Infraestrutura de conexão LiveKit | **Real como transporte**, mas sem modelo de voz do outro lado — testável isoladamente no Laboratório, sem credenciais embutidas |
| Interpretação de linguagem natural livre / IA multimodal de verdade | **Preparado, não implementado** — exige modelo pago (ver `docs/pesquisa-precos-ia-multimodal.md`) e aprovação prévia |
| Segmentação de céu/pessoa por IA (em vez de heurística) | **Não implementado** — depende do mesmo modelo multimodal pago |

## Arquitetura

```
src/
  motion/
    tokens.ts        # toda a física de animação (springs, durações, paleta de cor)
    registry.ts       # registro das 20 animações essenciais — o Laboratório lê daqui
  engine/
    photoEngine.ts     # renderização não-destrutiva (Canvas) + EditState completo
    photoAnalysis.ts    # histograma, regiões, clipping, heurística de céu — tudo real
    pixelOps.ts          # manipulação de pixel de baixo nível (máscara seletiva, downscale)
    editOperations.ts     # catálogo de operações com parâmetros validados
    editHistory.ts          # histórico genérico: draft/present/past/future
    ruleSuggestions.ts       # sugestões por regras a partir do histograma (não IA)
    voiceEngine.ts             # síntese de voz (Web Speech API, gratuito)
    liveVoiceEngine.ts          # infraestrutura experimental LiveKit (sem credenciais embutidas)
    __tests__/                   # testes vitest de todos os módulos acima
  components/
    MiniKliko.tsx    # a esfera/painel — o coração do app
    SmartSlider.tsx  # slider com preenchimento em tempo real
    PhotoCanvas.tsx  # desenha a foto com o EditState atual
    ProcessingLottie.tsx  # animação vetorial original (estado "analisando")
    LiveKitTestPanel.tsx  # UI de teste isolada do LiveKit, só no Laboratório
  assets/lottie/
    kliko-processing.json  # animação Lottie original, escrita à mão
  screens/
    Gallery.tsx, Editor.tsx, Lab.tsx
```

Segui a regra que propus antes de começar a programar: nenhuma animação fica "solta" dentro de um componente. Toda física vem de `motion/tokens.ts`, e cada animação implementada tem uma entrada em `motion/registry.ts` — é esse registro que alimenta o Laboratório, então não existe definição duplicada entre o app de verdade e a tela de testes.

## Por que React + TypeScript + Vite + Motion (+ Lottie e LiveKit, agora experimentais)

Mantive a stack que você aprovou. Motion (antigo Framer Motion) porque tem física de mola nativa e roda no GPU — essencial para a sensação de naturalidade que você pediu. Vite porque o build de produção fica pequeno e o Safari carrega rápido mesmo em rede móvel. `lottie-web` entrou só para a animação "analisando" (único caso que é ilustração, não geometria de UI). `livekit-client` entrou só como infraestrutura de transporte isolada no Laboratório — ver `docs/reavaliacao-tecnologias.md` para o porquê de cada decisão não ter sido "porque outros apps usam".

## Como rodar

```bash
npm install
npm run dev      # servidor local com recarregamento automático
npm run build    # build de produção em /dist
npm run lint     # oxlint
npm run test     # vitest — testes automatizados dos motores de edição/análise
```

Para testar no seu iPhone: rode `npm run dev -- --host`, pegue o endereço `http://SEU-IP-LOCAL:5173` que aparece no terminal, e abra no Safari do iPhone (mesma rede Wi-Fi). Também te mandei uma versão publicada para abrir direto, sem precisar rodar nada — veja a mensagem onde entreguei este trabalho.

## Sobre o OpenJarvis

Não integrei nenhum código dele nesta fase, como combinamos. A análise completa está salva no projeto (`kliko-analise-openjarvis.md`) — a ideia de registro de ferramentas por `ToolRegistry` foi a inspiração direta para o `motion/registry.ts` que criei aqui, mas escrita do zero e sob medida para animação, não para ferramentas de agente de IA.

## Testes automatizados (novo na Fase 2)

`npm run test` roda 52 testes (vitest) cobrindo: histograma e detecção de clipping, histórico não destrutivo (confirmar/cancelar/desfazer/refazer), aplicação seletiva por máscara (incluindo que o buffer original nunca é mutado), downscale para imagens grandes, validação/clamp de parâmetros das operações, sugestões por regras (incluindo os casos em que a regra decide não fazer nada), e tratamento de erro de carregamento de imagem (arquivo vazio, decodificador falhando). **Importante: isso prova a lógica, não o dispositivo** — build, lint e teste passando não substituem abrir no Safari do iPhone de verdade (câmera, seletor de fotos, permissão de microfone, performance real em uma foto de 12 megapixels). Ainda não tive essa confirmação sua desta vez.

## O que falta para a Fase 3

- Modelo multimodal real no lugar das sugestões por regras (`ruleSuggestions.ts`) — arquitetura e preços já levantados, aguardando sua aprovação (`docs/fase2-inteligencia-fotografica.md` §10, `docs/pesquisa-precos-ia-multimodal.md`).
- Segmentação de céu (e de outras regiões) por IA, substituindo a heurística de posição+cor.
- Um modelo de voz do outro lado da conexão LiveKit — hoje o módulo só prova o transporte.
- Slider com thumb 100% controlado por Motion (drag customizado com `dragElastic` para o rubber-band do catálogo) — por ora uso `<input type="range">` nativo por confiabilidade no Safari, com o crescimento do polegar feito em CSS puro.
- As outras 100 animações do catálogo completo, por prioridade (a planilha já tem a ordem sugerida na coluna "Prioridade").
- Testar em dispositivo físico (iPhone Safari) a performance da análise de histograma/máscara em fotos reais de 12+ megapixels.
