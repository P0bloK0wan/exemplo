# Kliko — Fase 1 + Fase 2 + Fase 3 (presets analógicos e colagens reais)

Este é o início real do Kliko: uma inteligência artificial para fotografia, edição criativa e colagens, com a Mini Kliko (a nuvem azul flutuante) como interface central. Este README está em primeira pessoa porque documenta as escolhas que fiz em cada fase, não um manual genérico — é para você (ou qualquer pessoa que continue o projeto) entender o porquê de cada decisão.

## O que eu entreguei

Quatro telas navegáveis por abas, tudo rodando no navegador (testado para Safari no iPhone):

- **Galeria** — importa fotografias reais do seu iPhone (`<input type="file" accept="image/*">`, que abre o seletor nativo de Fotos/Câmera do iOS). Não há fotos de exemplo fixas: tudo que aparece aqui é o que você importou.
- **Editor** — mostra a fotografia num canvas e aplica ajustes de **exposição, contraste, saturação e temperatura**, **presets fotográficos analógicos** (granulação, vinheta, desbotamento) e a camada experimental de **máscara de céu**, tudo de verdade, em tempo real, sobre os pixels da imagem, com **desfazer/refazer** reais (botões ↺/↻ no topo) e **análise real de histograma** rodando em segundo plano a cada foto carregada. Segure a foto para comparar com o original.
- **Colagem** (nova na Fase 3) — Estúdio de Colagem: escolha um layout real, importe uma fotografia por moldura, arraste/pince para reenquadrar, e exporte o resultado como PNG.
- **Laboratório** — onde você testa as 20 animações essenciais isoladamente, ajusta a física da mola (rigidez/amortecimento) ao vivo, e uma aba experimental para testar a infraestrutura de voz em tempo real (LiveKit).

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
| Nova aparência 3D/escultural da Mini Kliko | **Aguardando a imagem de referência** que você mencionou mas não chegou anexada — ver seção própria abaixo |

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
    __tests__/                        # testes vitest de todos os módulos acima
  components/
    MiniKliko.tsx    # a esfera/painel — o coração do app (abas Ajustes/Analógico)
    SmartSlider.tsx  # slider com preenchimento em tempo real
    PhotoCanvas.tsx  # desenha a foto com o EditState atual
    PresetPicker.tsx    # grade de presets analógicos com prévia real (Fase 3)
    LayoutPicker.tsx      # seletor de layout de colagem, mostra as molduras reais (Fase 3)
    CollageCanvas.tsx       # área de montagem com gestos de arrastar/ampliar (Fase 3)
    ProcessingLottie.tsx  # animação vetorial original (estado "analisando")
    LiveKitTestPanel.tsx  # UI de teste isolada do LiveKit, só no Laboratório
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

## Testes automatizados (atualizado na Fase 3)

`npm run test` roda **78 testes** (vitest), incluindo tudo da Fase 2 (histograma/clipping, histórico não destrutivo, máscara seletiva, downscale, validação de operações, sugestões por regras, erro de carregamento) mais os novos da Fase 3: limites e interpolação por intensidade do catálogo de presets analógicos, não-mutação e determinismo de granulação/vinheta/desbotamento (mesma entrada sempre produz o mesmo resultado — importante para a prévia nunca "tremer"), catálogo de layouts de colagem (frames nunca vazam do canvas), estado das molduras (atribuir/limpar/remapear ao trocar layout, clamping de pan/zoom) e checagem de completude antes de liberar o export. **Importante: isso prova a lógica, não o dispositivo** — build, lint e teste passando não substituem abrir no Safari do iPhone de verdade (câmera, seletor de fotos, permissão de microfone, gesto de pinça real, performance em foto de 12 megapixels, arquivo HEIC real). Ainda não tive essa confirmação sua desta vez.

## Editor de vídeo com timeline — avaliação de arquitetura (apenas plano, não implementado)

Antes de qualquer linha de código: o Safari no iPhone não tem uma API de exportação de vídeo simples e garantida via navegador puro. Dois caminhos reais, nenhum testado ainda:

1. **`WebCodecs`/`VideoEncoder` + `OffscreenCanvas`** — processamento e encoding 100% no cliente, sem backend. Suporte no Safari iOS é parcial e recente; precisaria validar em dispositivo físico antes de prometer qualquer coisa.
2. **Backend com `ffmpeg`** — processamento no servidor, exige subir o vídeo, custo de infraestrutura e latência, mas funciona independente de qual Safari a pessoa tem.

Próximo passo real (ainda não feito): testar isoladamente se `VideoEncoder` exporta algo utilizável direto no Safari do iPhone, antes de decidir entre as duas opções. Não implementei nenhum editor de timeline nesta fase, como você pediu.

## Nova aparência da Mini Kliko — aguardando a imagem de referência

Você mencionou que ia anexar uma imagem (uma escultura fluida/translúcida) como inspiração visual para a nova Mini Kliko, mas ela não chegou junto da sua última mensagem — só o texto chegou. Combinei com os requisitos que você já descreveu (seis estados de movimento, duas apresentações compacta/expandida, física de mola, sem substituir a versão atual sem aprovação), mas ainda não posso propor as três abordagens visuais (SVG vs. Motion vs. WebGL) sem ver a referência — a escolha de técnica depende diretamente da complexidade visual que a imagem pedir. Assim que você reenviar a imagem, retomo esse ponto.

## O que falta

- Modelo multimodal real no lugar das sugestões por regras (`ruleSuggestions.ts`) — arquitetura e preços já levantados, aguardando sua aprovação (`docs/fase2-inteligencia-fotografica.md` §10, `docs/pesquisa-precos-ia-multimodal.md`).
- Segmentação de céu (e de outras regiões) por IA, substituindo a heurística de posição+cor.
- Um modelo de voz do outro lado da conexão LiveKit — hoje o módulo só prova o transporte.
- Nova aparência 3D/escultural da Mini Kliko — aguardando a imagem de referência (ver seção acima).
- Editor de vídeo com timeline real — só avaliação de arquitetura feita até agora (ver seção acima).
- Mini Kliko criar uma colagem inteira por voz a partir de fotos já na Galeria (hoje ela só indica abrir o Estúdio de Colagem).
- Slider com thumb 100% controlado por Motion (drag customizado com `dragElastic` para o rubber-band do catálogo) — por ora uso `<input type="range">` nativo por confiabilidade no Safari, com o crescimento do polegar feito em CSS puro.
- As outras 100 animações do catálogo completo, por prioridade (a planilha já tem a ordem sugerida na coluna "Prioridade").
- Testar em dispositivo físico (iPhone Safari): performance da análise/máscara/granulação em fotos reais de 12+ megapixels, gesto de pinça real no Estúdio de Colagem, arquivos HEIC, orientação EXIF de fotos verticais.
