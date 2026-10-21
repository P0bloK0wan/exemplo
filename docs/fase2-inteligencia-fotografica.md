# Fase 2 — Plano técnico: inteligência fotográfica real

> **Status:** as seções [A] (histograma/regiões/clipping), o catálogo de
> operações (§3), o histórico não destrutivo com desfazer/refazer (§8, §9) e
> a heurística experimental de máscara de céu (§7.1) estão **implementados**
> em `src/engine/` (ver README — "O que é real"). As seções que dependem de
> modelo multimodal pago (§6, §7.2) **continuam apenas planejadas** — nenhuma
> API paga foi integrada. Ver `docs/pesquisa-precos-ia-multimodal.md` para os
> preços oficiais já pesquisados.

## 1. Objetivo

Hoje (Fase 1) a Mini Kliko interpreta comandos de voz por *casamento de
palavras-chave* (`applyVoiceCommand` em `MiniKliko.tsx`) — "iluminar" sempre
soma +25 de exposição, sem olhar a foto. A Fase 2 troca isso por um fluxo em
que um **modelo multimodal realmente analisa a imagem** e devolve instruções
estruturadas, que o motor de edição aplica — permitindo pedidos como:

- "Melhore a iluminação dessa foto, mas preserve as cores naturais."
- "Deixe o céu mais azul sem modificar o rosto."
- "Recupere os detalhes das partes muito claras."

Isso exige uma peça nova (análise de imagem) e uma peça nova no motor de
edição (ajustes seletivos por região/máscara) — hoje o `photoEngine.ts`
só aplica um `filter()` CSS uniforme sobre a imagem inteira.

## 2. Visão geral do fluxo

```
Foto (Canvas/ImageBitmap)
      │
      ▼
[A] Análise local (sem IA paga) ──► histograma, regiões claras/escuras, metadados básicos
      │
      ▼
[B] Pedido de voz do usuário (texto já transcrito pela Web Speech API)
      │
      ▼
[C] Modelo multimodal (externo, pago) recebe: imagem reduzida + histograma + pedido em texto
      │  devolve: instrução estruturada (JSON) referenciando o catálogo de operações
      ▼
[D] Motor de edição aplica a instrução de forma não destrutiva, com máscara se necessário
      │
      ▼
[E] Preview em tempo real + Mini Kliko explica por voz o que fez
      │
      ▼
[F] Usuário confirma / ajusta / desfaz
```

A etapa **[A]** não depende de nenhum modelo de IA — é processamento local
(Canvas API + JavaScript), pode ser construída já, sem custo e sem aprovação
de serviço externo. As etapas **[C]** em diante dependem do modelo multimodal
pago, por isso ficam marcadas como "aguardando aprovação" abaixo.

## 3. Catálogo de operações (extensão do padrão de registro do OpenJarvis)

Hoje `AdjustmentValues` tem 4 campos globais (`exposicao`, `contraste`,
`saturacao`, `temperatura`), sempre aplicados à foto inteira. A Fase 2 propõe
um registro de operações, cada uma com um schema — o mesmo padrão de "tool
registry" usado como referência conceitual do OpenJarvis (ver
`docs/reavaliacao-tecnologias.md`), implementado do zero:

```ts
interface EditOperation {
  id: string;                 // ex.: "exposure", "sky_saturation", "highlight_recovery"
  label: string;              // nome em PT-BR para a Mini Kliko falar
  params: {
    name: string;
    range: [number, number];
    default: number;
  }[];
  scope: "global" | "region" | "mask";
  apply: (ctx: CanvasRenderingContext2D, params: Record<string, number>, mask?: ImageData) => void;
}
```

Isso é o "menu" que o modelo multimodal recebe para escolher e parametrizar —
ele nunca gera pixels diretamente, só escolhe entre operações pré-definidas e
testadas, o que é mais seguro, mais previsível e mais barato (menos tokens de
saída) do que pedir uma imagem nova inteira.

## 4. Análise de exposição e histograma [A — sem IA paga, pode ser construído já]

- Ler os pixels do `ImageBitmap`/canvas original (`getImageData`).
- Calcular histograma de luminância (256 buckets, a partir de R/G/B
  ponderados — fórmula padrão de luminância percebida).
- Classificar: % de pixels em sombra profunda (<15), sombra (15–60), meio-tom
  (60–180), realce (180–240), realce extremo/clipping (>240).
- Isso já responde sozinho, sem IA, perguntas como "essa foto está
  estourada?" e alimenta o passo [C] com um resumo numérico (não a imagem
  bruta inteira) — reduz custo de tokens de entrada no modelo multimodal.

## 5. Identificação de regiões claras/escuras [A — sem IA paga]

- A partir do mesmo histograma, gerar um mapa de regiões por blocos (ex.:
  grade 16×16) marcando cada bloco como escuro/médio/claro.
- Serve para dois propósitos: (1) dar ao modelo multimodal um resumo
  espacial compacto ("canto superior está muito claro: possível céu
  estourado") sem precisar mandar a imagem em alta resolução; (2)
  pré-popular uma máscara editável quando o usuário disser algo como "a
  parte clara" sem apontar manualmente.

## 6. Sugestões inteligentes de ajuste [C — depende do modelo multimodal pago]

O modelo multimodal recebe: imagem reduzida (ex.: 512px, para custo menor),
o resumo do histograma/regiões (texto, do passo [A]), e o pedido em texto do
usuário. Devolve uma instrução estruturada, por exemplo:

```json
{
  "operations": [
    { "id": "exposure", "params": { "amount": 18 } },
    { "id": "sky_saturation", "params": { "amount": 22 }, "mask": "sky" }
  ],
  "explanation": "Aumentei um pouco a exposição geral e deixei o céu mais saturado, sem tocar na pele."
}
```

O `explanation` é o texto que a Mini Kliko fala (via `voiceEngine.speak`,
já existente). As `operations` batem 1:1 com o catálogo do §3 — o motor de
edição nunca executa nada fora desse catálogo, o que limita o "raio de
dano" de uma resposta mal-interpretada do modelo.

**Candidatos de modelo (apenas pesquisa, nenhum escolhido/integrado ainda):**
qualquer modelo multimodal atual com entrada de imagem e saída estruturada
(JSON/function-calling) de um provedor oficial — ex. a família Claude via API
da Anthropic, ou a família GPT via API da OpenAI. A escolha final depende de:
qualidade de instrução estruturada, latência, e custo por chamada — itens do
§10 abaixo.

## 7. Máscaras e edição seletiva [D]

- Para operações com `scope: "region"` ou `"mask"`, gerar uma máscara binária
  (ou com gradiente suave nas bordas, para evitar corte abrupto) do mesmo
  tamanho da imagem.
- Dois jeitos de obter a máscara, nessa ordem de prioridade de implementação:
  1. **Heurística local, sem IA** (Fase 2.a): máscara de "céu" = região clara
     na parte superior da imagem + alta componente de azul — resolve boa
     parte do caso "deixe o céu mais azul" sem precisar de segmentação por IA.
  2. **Segmentação por IA** (Fase 2.b, futura): se o modelo multimodal
     devolver uma máscara (ex.: polígono ou grade de confiança por bloco),
     o motor de edição usa essa máscara ao invés da heurística.
- Aplicação: `CanvasRenderingContext2D.globalCompositeOperation` combinado
  com a máscara como alpha, para misturar o resultado ajustado só na região
  marcada — mantém a lógica não destrutiva já usada hoje (sempre redesenha a
  partir da imagem original, nunca acumula sobre o canvas).

## 8. Edição não destrutiva [D — extensão do padrão já existente]

O `photoEngine.ts` já segue esse princípio para os 4 ajustes globais atuais
(`renderAdjustments` sempre redesenha a partir do `ImageBitmap` original). A
Fase 2 generaliza isso para uma **pilha de operações** em vez de um objeto
fixo de 4 campos:

```ts
type EditHistory = { operation: EditOperation; params: Record<string, number>; mask?: ImageData }[];
```

Renderizar = sempre percorrer a pilha inteira a partir da imagem original, na
ordem. Isso também é o que viabiliza desfazer/refazer (§9) e o preview (§9).

## 9. Preview antes de confirmar + desfazer/refazer [E, F]

- **Preview:** toda sugestão do modelo multimodal é aplicada primeiro a uma
  pilha "de rascunho" (`draftHistory`), renderizada imediatamente no canvas —
  exatamente como hoje a Mini Kliko já abre o painel mostrando o resultado
  antes do "Confirmar". A diferença é que agora pode ser seletivo (máscara),
  não só os 4 sliders globais.
- **Confirmar:** `draftHistory` migra para `confirmedHistory` (pilha real).
- **Cancelar:** descarta `draftHistory`, volta ao estado confirmado anterior —
  já existe essa lógica hoje via `previousAdjustmentsRef`, generaliza para a
  pilha.
- **Desfazer/refazer:** com `confirmedHistory` como pilha, desfazer = remover
  a última operação e re-renderizar do zero; refazer = pilha auxiliar de
  operações desfeitas, re-inserida se o usuário repetir a ação. Interface:
  gesto ou botão "Desfazer última edição" na Mini Kliko (animação consistente
  com o catálogo Apple — slide/fade com spring `balanced`, já no `tokens.ts`).

## 10. O que falta antes de implementar [C] — aguardando sua aprovação

Por instrução explícita, antes de integrar qualquer modelo pago eu preciso
apresentar e você aprovar: arquitetura (acima), custo estimado, e plano
técnico de integração. Os preços oficiais já foram confirmados diretamente
nas páginas da Anthropic e da OpenAI — ver
`docs/pesquisa-precos-ia-multimodal.md`. Resumo: mesmo o modelo mais caro
testado (Claude Opus 5.5 / GPT-6 Astra) sai a poucos centavos de dólar por
edição, nas premissas assumidas (imagem reduzida a ~768px, resposta limitada
ao JSON estruturado do §6) — custo não é o fator limitante aqui; qualidade
da instrução estruturada e latência real são. Continua sem nenhuma API paga
integrada.

**Plano técnico de integração (estrutura, sem custos ainda):** a chamada ao
modelo multimodal precisa de uma chave de API — o Kliko hoje é 100%
frontend estático (sem backend próprio), então essa chamada **não pode ser
feita direto do navegador** (exporia a chave). Será necessário um backend
mínimo (ex.: uma função serverless) só para intermediar essa chamada — isso
também entra na aprovação, como parte da arquitetura.

## 11. Experiência visual — Mini Kliko continua no centro

Nada muda na filosofia de interação: a Mini Kliko continua sendo a única
interface de IA (sem tela de chat separada). Na Fase 2, ela passa a:

- Falar a `explanation` da sugestão (já usa `speak()`), não uma frase fixa de
  palavra-chave.
- Abrir o painel flutuante mostrando o preview seletivo (máscara aplicada),
  com a mesma transformação orbe↔painel via `layoutId="kliko-shell"`.
- Permitir ajuste fino por slider dentro da região sugerida (reaproveitando
  `SmartSlider.tsx`), não só confirmar/cancelar tudo-ou-nada.
- Seguir a mesma paleta azul suave e física de mola (`motion/tokens.ts`) —
  nenhuma mudança de identidade visual nesta fase.

## 12. Resumo do que pode começar já vs. o que aguarda aprovação

| Item | Depende de IA paga? | Status |
|---|---|---|
| Histograma + regiões claras/escuras (§4, §5) | Não | Pode implementar na Fase 2.a |
| Heurística de máscara de céu (§7.1) | Não | Pode implementar na Fase 2.a |
| Pilha de operações + desfazer/refazer (§3, §8, §9) | Não | Pode implementar na Fase 2.a |
| Sugestão inteligente via modelo multimodal (§6) | Sim | Aguardando custo oficial + aprovação |
| Segmentação por IA (§7.2) | Sim (provável) | Aguardando aprovação, Fase 2.b |
| Backend/serverless para a chamada ao modelo (§10) | Indireto (infraestrutura) | Aguardando aprovação junto com o modelo |
