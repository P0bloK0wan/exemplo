# Kliko — Fase 1 (protótipo funcional)

Este é o início real do Kliko: uma inteligência artificial para edição de fotografias, com a Mini Kliko (a nuvem azul flutuante) como interface central. Este README está em primeira pessoa porque documenta as escolhas que fiz nesta fase, não um manual genérico — é para você (ou qualquer pessoa que continue o projeto) entender o porquê de cada decisão.

## O que eu entreguei nesta fase

Três telas navegáveis por abas, tudo rodando no navegador (testado para Safari no iPhone):

- **Galeria** — importa fotografias reais do seu iPhone (`<input type="file" accept="image/*">`, que abre o seletor nativo de Fotos/Câmera do iOS). Não há fotos de exemplo fixas: tudo que aparece aqui é o que você importou.
- **Editor** — mostra a fotografia num canvas e aplica ajustes de **exposição, contraste, saturação e temperatura** de verdade, em tempo real, sobre os pixels da imagem. Segure a foto para comparar com o original.
- **Laboratório** — onde você testa as 20 animações essenciais isoladamente, ajusta a física da mola (rigidez/amortecimento) ao vivo e vê o resultado na hora.

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
| Transformação orb → painel | **Real**, com física de mola |
| Reconhecimento de voz | **Real quando o navegador suporta**, com fallback simulado identificado |
| Interpretação de linguagem natural / IA multimodal | **Preparado, não implementado** — a função `applyVoiceCommand` em `MiniKliko.tsx` é o ponto de entrada onde a IA real vai entrar depois |
| Ajuste seletivo por região (céu sem mexer no rosto) | **Não implementado ainda** — precisa de um motor por pixel/máscara, ficou para a Fase 2 |

## Arquitetura

```
src/
  motion/
    tokens.ts      # toda a física de animação (springs, durações, paleta de cor)
    registry.ts     # registro das 20 animações essenciais — o Laboratório lê daqui
  engine/
    photoEngine.ts  # processamento real de imagem (Canvas), não-destrutivo
  components/
    MiniKliko.tsx    # a esfera/painel — o coração do app
    SmartSlider.tsx  # slider com preenchimento em tempo real
    PhotoCanvas.tsx  # desenha a foto com os ajustes atuais
  screens/
    Gallery.tsx, Editor.tsx, Lab.tsx
```

Segui a regra que propus antes de começar a programar: nenhuma animação fica "solta" dentro de um componente. Toda física vem de `motion/tokens.ts`, e cada animação implementada tem uma entrada em `motion/registry.ts` — é esse registro que alimenta o Laboratório, então não existe definição duplicada entre o app de verdade e a tela de testes.

## Por que React + TypeScript + Vite + Motion

Mantive a stack que você aprovou. Motion (antigo Framer Motion) porque tem física de mola nativa e roda no GPU — essencial para a sensação de naturalidade que você pediu. Vite porque o build de produção fica pequeno (o bundle final deu ~120kb gzipped) e o Safari carrega rápido mesmo em rede móvel.

## Como rodar

```bash
npm install
npm run dev      # servidor local com recarregamento automático
npm run build    # build de produção em /dist
npm run lint     # oxlint
```

Para testar no seu iPhone: rode `npm run dev -- --host`, pegue o endereço `http://SEU-IP-LOCAL:5173` que aparece no terminal, e abra no Safari do iPhone (mesma rede Wi-Fi). Também te mandei uma versão publicada para abrir direto, sem precisar rodar nada — veja a mensagem onde entreguei este trabalho.

## Sobre o OpenJarvis

Não integrei nenhum código dele nesta fase, como combinamos. A análise completa está salva no projeto (`kliko-analise-openjarvis.md`) — a ideia de registro de ferramentas por `ToolRegistry` foi a inspiração direta para o `motion/registry.ts` que criei aqui, mas escrita do zero e sob medida para animação, não para ferramentas de agente de IA.

## O que falta para a Fase 2

- Ajuste seletivo por região (precisa de um motor por pixel com máscara, ou um modelo de segmentação).
- Conectar um modelo multimodal real no lugar do `applyVoiceCommand` por palavra-chave.
- Slider com thumb 100% controlado por Motion (drag customizado com `dragElastic` para o rubber-band do catálogo) — por ora uso `<input type="range">` nativo por confiabilidade no Safari, com o crescimento do polegar feito em CSS puro.
- As outras 100 animações do catálogo completo, por prioridade (a planilha já tem a ordem sugerida na coluna "Prioridade").
- Testes automatizados (não escrevi nenhum nesta fase — o build e o lint passaram limpos, mas não há suíte de testes ainda).
