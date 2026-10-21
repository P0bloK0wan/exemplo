# Kliko — Fase 1 + Fase 2 + Fase 3 + Fase 4 (protótipo visual experimental da nova Mini Kliko)

Este é o início real do Kliko: uma inteligência artificial para fotografia, edição criativa e colagens, com a Mini Kliko (a nuvem azul flutuante) como interface central. Este README está em primeira pessoa porque documenta as escolhas que fiz em cada fase, não um manual genérico — é para você (ou qualquer pessoa que continue o projeto) entender o porquê de cada decisão.

## O que eu entreguei

Quatro telas navegáveis por abas, tudo rodando no navegador (testado para Safari no iPhone):

- **Galeria** — importa fotografias reais do seu iPhone (`<input type="file" accept="image/*">`, que abre o seletor nativo de Fotos/Câmera do iOS). Não há fotos de exemplo fixas: tudo que aparece aqui é o que você importou.
- **Editor** — mostra a fotografia num canvas e aplica ajustes de **exposição, contraste, saturação e temperatura**, **presets fotográficos analógicos** (granulação, vinheta, desbotamento) e a camada experimental de **máscara de céu**, tudo de verdade, em tempo real, sobre os pixels da imagem, com **desfazer/refazer** reais (botões ↺/↻ no topo) e **análise real de histograma** rodando em segundo plano a cada foto carregada. Segure a foto para comparar com o original.
- **Colagem** (nova na Fase 3) — Estúdio de Colagem: escolha um layout real, importe uma fotografia por moldura, arraste/pince para reenquadrar, e exporte o resultado como PNG.
- **Laboratório** — onde você testa as 20 animações essenciais isoladamente, ajusta a física da mola (rigidez/amortecimento) ao vivo, uma aba experimental para testar a infraestrutura de voz em tempo real (LiveKit), e agora (Fase 4) o **protótipo comparativo das três propostas visuais da nova Mini Kliko**.

## Fase 4 — protótipo visual experimental da nova Mini Kliko (ainda não substitui a atual)

Isto responde às duas últimas mensagens suas sobre a nova identidade visual. **Nada aqui troca a Mini Kliko do Editor** — é um laboratório isolado, exatamente como você pediu duas vezes ("minha aprovação é para o laboratório visual experimental, não para substituir definitivamente a Mini Kliko atual").

- **Uma única fonte de geometria** (`src/engine/sculptureEngine.ts`): 4 "lóbulos" normalizados (-1..1) cuja posição/raio variam por estado, puro e sem DOM/Canvas/React — é o que garante que a Variante A e a Variante B pareçam "duas representações do mesmo objeto", como você exigiu, em vez de duas criações visuais independentes. Testado isoladamente (10 testes).
- **Variante A — SVG + Motion** (`src/components/sculpture/KlikoSculptureSVG.tsx`): os lóbulos passam por um filtro "goo" (`feGaussianBlur` + `feColorMatrix` com limiar) usado como máscara de um gradiente — é isso que funde as bordas numa silhueta orgânica contínua, igual à referência, em vez de círculos "crus" sobrepostos. Uma segunda camada com os mesmos lóbulos, sem desfoque, em `mix-blend-mode: multiply`, escurece exatamente onde eles se encontram — a "profundidade nas interseções" pedida, sem matemática extra, só composição SVG/CSS. Anima mutando atributos diretamente por quadro (nunca via re-render do React), e respeita `prefers-reduced-motion` com um único quadro estático.
- **Variante B — WebGL + shaders** (`src/engine/sculptureGL.ts` + `src/components/sculpture/KlikoSculptureGL.tsx`): não é ray marching 3D de verdade — é um campo implícito 2D de metaballs (kernel Wyvill/soft-object, limitado a [0,1], sem singularidade no centro) com uma normal "falsa" derivada por diferenças centrais do próprio campo, o bastante para luz difusa + Fresnel (brilho de borda) convincentes a um custo mínimo (o canvas tem só algumas centenas de pixels). A sombra na interseção vem da "sobra" de cobertura — a diferença entre o campo somado de todos os lóbulos e a maior contribuição de um único lóbulo nesse ponto — um sinal direto de sobreposição geométrica real, que só aparece de verdade nas junções, não no centro de cada lóbulo. Cai automaticamente para a Variante A se o WebGL não existir, se os shaders não compilarem, ou se o contexto for perdido (`webglcontextlost`/`webglcontextrestored` tratados, com o laço de animação REINICIADO quando o contexto volta, não só o fallback desligado). Resolução interna adaptativa por **medição real** da duração dos quadros — eu não presumi que WebGL seria mais rápido, meço. Pausa o laço de verdade (para de reagendar `requestAnimationFrame`, não só fica invisível) quando o canvas sai da tela (`IntersectionObserver`) ou quando a prop `active` pede, e limpa contexto/listeners/observer ao desmontar.
- **Variante C — híbrida** (`src/components/sculpture/KlikoSculptureHybrid.tsx`): as duas variantes ficam sempre montadas, sobrepostas, e o que alterna é só a opacidade entre elas — nunca um `{condição ? <A/> : <B/>}` que desmontaria uma no meio da transição. A mesma mola que já anima o `layoutId="kliko-shell"` da Mini Kliko atual (`springs.gentle`) coordena o `scale` do invólucro e o crossfade juntos, como um único gesto. Isto é a resposta direta à sua maior prioridade: a escultura nunca "desaparece" para um painel aparecer no lugar — ela se transforma continuamente. A camada WebGL só fica **ativa de verdade** (renderizando) enquanto expandida ou em transição (`onAnimationComplete` do Motion decide quando a transição terminou) — assim que volta a ficar compacta e parada, o laço da Variante B é parado, não só escondido.
- **Reação real ao microfone** (`src/engine/micAmplitude.ts`): `getUserMedia` → `AudioContext` → `AnalyserNode` (nunca conectado a `destination`, para não haver eco) → RMS normalizado. Só pedido com clique explícito no botão do Laboratório, nunca sozinho; uma captura por vez; libera tudo (`MediaStreamTrack`s + `AudioContext`) ao parar. Testado com 8 testes, incluindo o bug real que corrigi nesta fase: o código original lia `window.AudioContext`, que falhava silenciosamente no ambiente de teste (Node, sem `window`) — troquei para `globalThis`, que é visível tanto no navegador quanto no `vi.stubGlobal` dos testes.
- **Pulso de fala honesto** (`src/engine/speechPulse.ts`): a Web Speech API **não expõe a forma de onda** da síntese — o único sinal real é o evento `boundary` (disparado por palavra). Este módulo usa isso para um pulso que decai exponencialmente a cada quadro — sincronizado ao *ritmo* da fala, nunca a fonemas/amplitude real, e nunca alega o contrário na interface. Testado com 6 testes.
- **Painel de comparação no Laboratório** (`src/components/sculpture/SculptureLabPanel.tsx`): alterna entre as três variantes, testa cada um dos 6 estados (aguardando/ouvindo/pensando/falando/editando/concluindo) e a transição escultura→painel, e separa três métricas de desempenho em vez de um "fps" só (ver seção 4.1 abaixo), com botões de teste de microfone real e de fala.

**O que ainda não fiz nesta fase, de propósito:** não subi o componente para `App.tsx` nem o liguei ao estado real de foto/histórico/confirmação do Editor — isso só faz sentido depois que você escolher uma direção. Também não movi as 100 outras animações do catálogo para esta nova escultura — só os 6 estados pedidos.

### Fase 4.1 — revisão técnica de desempenho e fidelidade visual

Depois de ver os protótipos, você pediu uma revisão específica de 6 pontos. Fiz essa revisão com testes reais (Playwright headless, não só leitura de código), e ela achou um bug de verdade que análise de código sozinha não teria pego:

1. **Pausa da camada WebGL na híbrida quando invisível** — corrigido. A Variante B agora recebe uma prop `active`; quando `false` (compacta e já fora de transição), o laço de `requestAnimationFrame` **para de se reagendar**, não só fica escondido atrás da SVG. Confirmado ao vivo: as métricas do Laboratório mostram a linha "WebGL" desaparecer completamente alguns instantes depois de recolher o painel, e reaparecer assim que expande de novo.
2. **Métricas do Laboratório diferenciadas** — refeitas. Agora são três números separados, cada um com seu rótulo explícito do que mede e do que NÃO mede: **FPS de agendamento** (quantos quadros o navegador despachou por segundo nesta página — não é GPU), **duração média de render por fonte** (tempo de CPU para mutar atributos SVG ou emitir comandos WebGL — a GPU executa depois, de forma assíncrona, então isso também não é "desempenho da GPU"), e **custo como % do orçamento de 16,6 ms** (60 Hz) — um proxy honesto, não uma medição de hardware.
3. **IDs de `<filter>`/`<mask>`/gradiente únicos** — corrigido com `useId()` do React, sufixando cada id (`kliko-goo-soft-${uid}` etc.). Antes, duas Mini Kliko SVG montadas ao mesmo tempo roubariam a máscara uma da outra; importa desde já (Laboratório + Híbrida) e vai importar mais quando a escultura aparecer em várias telas ao mesmo tempo.
4. **Perda e restauração de contexto WebGL** — o `<canvas>` agora fica **sempre montado** (o fallback SVG é desenhado ao lado via CSS, nunca substitui o elemento), e `webglcontextrestored` **reinicia o laço de animação**, não só recria o renderer. Testei isto de verdade forçando perda/restauração de contexto via a extensão `WEBGL_lose_context` num navegador real (não só lendo o código) — confirmado que a escultura volta a animar sozinha depois da restauração, sem precisar recarregar a página.
5. **Comparação visual com a referência** — aqui apareceu o bug mais sério: ao revisar com capturas de tela reais (não só o código), percebi que a Variante B estava, na prática, **sempre caindo no fallback SVG silenciosamente**, porque meu shader WebGL não compilava num motor WebGL mais estrito (confirmado com o SwiftShader do Chromium headless — o mesmo tipo de restrição existe no ANGLE que a Safari do iOS usa por baixo). A causa: eu tinha movido a indexação de `u_lobes[i]` para dentro de uma função auxiliar separada (`lobeInfluence(int i)`), e GLSL ES 1.00 exige que o índice de um array seja a própria variável do laço `for`, usada diretamente — passá-la por uma chamada de função quebra essa garantia em implementações mais rígidas. Corrigido inline-ando a indexação de volta para dentro dos laços. Depois desse conserto, a Variante B finalmente renderizou de verdade (confirmado nas métricas: a linha "WebGL" passou a aparecer), e pude então comparar e ajustar de verdade: sombra de interseção ficou mais estreita e mais escura (antes cobria o corpo inteiro ou criava pontos escuros errados no centro de cada lóbulo — os dois eram sintomas de bugs diferentes, não só uma questão de gosto), corpo mais branco/leitoso (gradiente clareado), e um ponto de brilho mais estreito e intenso para o aspecto de vidro/porcelana da referência. A Variante A (SVG) recebeu o ajuste equivalente: cada lóbulo ganhou sua PRÓPRIA camada `multiply` independente (em vez de uma só camada com a união de todos), para que o escurecimento componha só onde dois lóbulos realmente se sobrepõem, e reflexo azul e brilho de borda ligeiramente mais perceptíveis.
6. **Tamanho compacto** — por construção, nunca existiu um "caminho barato" separado para o tamanho pequeno: a Variante A escala pela `viewBox` normalizada do SVG, e a Híbrida sempre renderiza as duas variantes no tamanho `expandedSize` internamente, encolhendo só com `transform: scale()` no invólucro — então a versão compacta é a MESMA renderização de alta fidelidade, só menor, nunca uma versão simplificada.

**Sendo honesto sobre o que esta revisão NÃO é**: é uma verificação técnica com evidência real (screenshots de um navegador de verdade, perda de contexto forçada de propósito), não um teste no Safari do iPhone físico. A comparação visual com a referência também não virou pixel-perfeita — ajustei pela minha leitura das capturas de tela, mas o julgamento final de "ficou bonito o suficiente" é seu, no aparelho real, como você mesmo colocou.

## Fase 3 — o que mudou

- **Presets analógicos reais, não CSS decorativo** (`src/engine/analogPresets.ts` + `pixelOps.ts::applyAnalogEffects`): 6 presets originais do Kliko combinam os 4 ajustes globais já existentes com granulação (ruído determinístico por pixel), vinheta (escurecimento radial) e desbotamento (curva de tom que levanta pretos) — os três resolvidos pixel a pixel, desenhados no bitmap real do canvas, então sobrevivem à exportação. Nenhum deles é expressável só com `ctx.filter`/CSS. A aba "Analógico" da Mini Kliko mostra a prévia de cada preset sobre um recorte real da SUA foto (não um gradiente de exemplo), com slider de intensidade.
- **Estúdio de Colagem real** (`src/engine/collageEngine.ts`): 5 layouts com molduras de posição/tamanho REAIS (não decorativas) — dupla lado a lado, dupla empilhada, destaque+2, grade 2×2, tira de 4. Cada moldura vazia pede uma fotografia de verdade; preenchida, aceita arrastar (reposicionar) e pinçar/Ctrl+roda (ampliar), sempre dentro de limites que garantem que a imagem nunca deixe vão vazio. Exporta um PNG real em resolução maior que a prévia, a partir dos bitmaps originais — nunca modifica as fotos importadas, que continuam disponíveis para outro layout.
- **Comando de voz para presets analógicos**: "deixa essa fotografia com aparência de filme antigo" (ou "retrô"/"preto e branco"/"frio") é roteado por palavras-chave fixas a um preset do catálogo — a Mini Kliko é explícita de que isso não é leitura semântica da fotografia, é a mesma regra fixa sempre.
- **Orientação EXIF no import** (`loadImageBitmapFromFile`): fotos verticais do iPhone não aparecem mais rotacionadas 90°.

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
| Presets analógicos (granulação/vinheta/desbotamento) | **Real** — pixel a pixel, `pixelOps.ts::applyAnalogEffects`, sobrevive à exportação |
| Prévia de cada preset sobre a sua própria foto | **Real** — `renderPresetThumbnail`, recorte real, não gradiente de exemplo |
| Comando de voz "filme antigo"/"retrô"/"preto e branco" | **Real, por palavras-chave fixas** — não é compreensão semântica da foto |
| Estúdio de Colagem (layouts, import, reposicionar, ampliar, exportar PNG) | **Real** — ver `collageEngine.ts`; fotos originais preservadas |
| Mini Kliko criar colagem inteira por voz a partir da Galeria | **Não implementado** — hoje ela só orienta a abrir o Estúdio; a integração cruzada de telas é próximo passo |
| Editor de vídeo com timeline real | **Não implementado, apenas arquitetura avaliada** (ver seção própria abaixo) |
| Nova aparência 3D/escultural da Mini Kliko (3 variantes: SVG, WebGL, híbrida) | **Real, só no Laboratório** — protótipo comparativo, não substitui a Mini Kliko do Editor ainda (ver seção Fase 4 acima) |
| Reação da escultura ao microfone real / pulso de fala por evento | **Real** — `micAmplitude.ts` e `speechPulse.ts`, testados isoladamente |

## Arquitetura

```
src/
  motion/
    tokens.ts        # toda a física de animação (springs, durações, paleta de cor)
    registry.ts       # registro das 20 animações essenciais — o Laboratório lê daqui
  engine/
    photoEngine.ts     # renderização não-destrutiva (Canvas) + EditState completo (ajustes + céu + analógico)
    photoAnalysis.ts    # histograma, regiões, clipping, heurística de céu — tudo real
    pixelOps.ts          # manipulação de pixel de baixo nível (máscara seletiva, downscale, granulação/vinheta/desbotamento)
    analogPresets.ts       # catálogo de 6 presets fotográficos originais (Fase 3)
    collageEngine.ts         # layouts reais, estado das molduras, render paramétrico, export (Fase 3)
    editOperations.ts          # catálogo de operações com parâmetros validados
    editHistory.ts               # histórico genérico: draft/present/past/future
    ruleSuggestions.ts            # sugestões por regras a partir do histograma (não IA)
    voiceEngine.ts                  # síntese de voz (Web Speech API, gratuito)
    liveVoiceEngine.ts               # infraestrutura experimental LiveKit (sem credenciais embutidas)
    sculptureEngine.ts                 # geometria pura dos 4 lóbulos, fonte única para SVG/WebGL (Fase 4)
    micAmplitude.ts                      # amplitude real do microfone via getUserMedia+AnalyserNode (Fase 4)
    speechPulse.ts                        # pulso visual por evento `boundary` da Web Speech API (Fase 4)
    sculptureGL.ts                          # shader WebGL de campo implícito (metaballs) (Fase 4)
    __tests__/                        # testes vitest de todos os módulos acima
  components/
    MiniKliko.tsx    # a esfera/painel — o coração do app (abas Ajustes/Analógico) — NÃO tocado na Fase 4
    SmartSlider.tsx  # slider com preenchimento em tempo real
    PhotoCanvas.tsx  # desenha a foto com o EditState atual
    PresetPicker.tsx    # grade de presets analógicos com prévia real (Fase 3)
    LayoutPicker.tsx      # seletor de layout de colagem, mostra as molduras reais (Fase 3)
    CollageCanvas.tsx       # área de montagem com gestos de arrastar/ampliar (Fase 3)
    ProcessingLottie.tsx  # animação vetorial original (estado "analisando")
    LiveKitTestPanel.tsx  # UI de teste isolada do LiveKit, só no Laboratório
    sculpture/
      KlikoSculptureSVG.tsx    # Variante A — goo filter + Motion (Fase 4)
      KlikoSculptureGL.tsx       # Variante B — WebGL + fallback automático para SVG (Fase 4)
      KlikoSculptureHybrid.tsx     # Variante C — crossfade contínuo A↔B (Fase 4)
      SculptureLabPanel.tsx          # painel de comparação das 3 variantes, só no Laboratório (Fase 4)
  assets/lottie/
    kliko-processing.json  # animação Lottie original, escrita à mão
  screens/
    Gallery.tsx, Editor.tsx, Collage.tsx, Lab.tsx
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

## Testes automatizados (atualizado na Fase 4)

`npm run test` roda **102 testes** (vitest): tudo da Fase 2 e Fase 3 (histograma/clipping, histórico não destrutivo, máscara seletiva, downscale, validação de operações, sugestões por regras, erro de carregamento, presets analógicos, colagens) mais os novos da Fase 4 — `sculptureEngine.ts` (10 testes: geometria por estado, interpolação de `panelProgress`, nunca usa `Math.random()`), `micAmplitude.ts` (8 testes: ciclo de status, RMS normalizado, liberação completa de recursos, nunca duas capturas simultâneas) e `speechPulse.ts` (6 testes: pulso decrescente determinístico, nunca duplica o laço de decaimento num segundo `boundary`). **Deliberadamente não escrevi testes automatizados para os componentes visuais** (`KlikoSculptureSVG`/`GL`/`Hybrid`) — eles são DOM/Canvas/WebGL-pesados, e o valor real deles (como ficam na tela, a fluidez da transição) só se verifica olhando, não com asserção; a lógica que os alimenta (o motor puro) é o que está testado. **Importante: isso prova a lógica, não o dispositivo** — build, lint e teste passando não substituem abrir no Safari do iPhone de verdade (câmera, seletor de fotos, permissão de microfone, gesto de pinça real, performance em foto de 12 megapixels, arquivo HEIC real, comportamento de perda de contexto WebGL, bateria real). Ainda não tive essa confirmação sua desta vez.

## Editor de vídeo com timeline — avaliação de arquitetura (apenas plano, não implementado)

Antes de qualquer linha de código: o Safari no iPhone não tem uma API de exportação de vídeo simples e garantida via navegador puro. Dois caminhos reais, nenhum testado ainda:

1. **`WebCodecs`/`VideoEncoder` + `OffscreenCanvas`** — processamento e encoding 100% no cliente, sem backend. Suporte no Safari iOS é parcial e recente; precisaria validar em dispositivo físico antes de prometer qualquer coisa.
2. **Backend com `ffmpeg`** — processamento no servidor, exige subir o vídeo, custo de infraestrutura e latência, mas funciona independente de qual Safari a pessoa tem.

Próximo passo real (ainda não feito): testar isoladamente se `VideoEncoder` exporta algo utilizável direto no Safari do iPhone, antes de decidir entre as duas opções. Não implementei nenhum editor de timeline nesta fase, como você pediu.

## O que ainda precisa ser testado no seu iPhone (Fase 4 — escultura)

Nada disto foi confirmado em aparelho físico ainda:

- **Comportamento real de perda/restauração de contexto WebGL** no Safari iOS — tratei o evento `webglcontextlost`/`webglcontextrestored` e caio para a Variante A, mas nunca vi isso disparar de verdade num iPhone (costuma acontecer sob pressão de memória, trocando de app).
- **Duplo pedido de permissão de microfone**: se você ligar o teste de microfone do Laboratório enquanto o reconhecimento de voz da Mini Kliko também está ativo, o Safari pode pedir permissão duas vezes (são duas capturas de áudio independentes) — documentado como risco, não confirmado.
- **Medição real de fps/bateria** por variante — o painel mostra o número calculado ao vivo, mas só em dispositivo físico (não no simulador/desktop) esse número reflete o custo real de GPU de um iPhone.
- **Sensação do crossfade da Variante C** durante o gesto real de expandir o painel — a mola é a mesma já usada no app, mas a composição com o crossfade de duas camadas nunca foi vista fora do navegador de desenvolvimento.
- **Ritmo do pulso de fala** (`speechPulse.ts`) com as vozes reais disponíveis no Safari iOS — o evento `boundary` dispara em cadências diferentes dependendo da voz escolhida.
- **`prefers-reduced-motion`** ativado nas Configurações de Acessibilidade do iPhone, confirmando que as três variantes realmente congelam num quadro só.

## O que falta

- Modelo multimodal real no lugar das sugestões por regras (`ruleSuggestions.ts`) — arquitetura e preços já levantados, aguardando sua aprovação (`docs/fase2-inteligencia-fotografica.md` §10, `docs/pesquisa-precos-ia-multimodal.md`).
- Segmentação de céu (e de outras regiões) por IA, substituindo a heurística de posição+cor.
- Um modelo de voz do outro lado da conexão LiveKit — hoje o módulo só prova o transporte.
- **Escolher qual das 3 variantes da nova Mini Kliko vai para o app de verdade** — depende do seu teste no iPhone; só depois disso eu subo o componente escolhido para `App.tsx`, preservando o estado de foto/histórico/confirmação do Editor atual.
- Editor de vídeo com timeline real — só avaliação de arquitetura feita até agora.
- Mini Kliko criar uma colagem inteira por voz a partir de fotos já na Galeria (hoje ela só indica abrir o Estúdio de Colagem).
- Slider com thumb 100% controlado por Motion (drag customizado com `dragElastic` para o rubber-band do catálogo) — por ora uso `<input type="range">` nativo por confiabilidade no Safari, com o crescimento do polegar feito em CSS puro.
- As outras 100 animações do catálogo completo, por prioridade (a planilha já tem a ordem sugerida na coluna "Prioridade").
- Testar em dispositivo físico (iPhone Safari): performance da análise/máscara/granulação em fotos reais de 12+ megapixels, gesto de pinça real no Estúdio de Colagem, arquivos HEIC, orientação EXIF de fotos verticais, e tudo listado na seção "Fase 4 — escultura" acima.
