# Pesquisa oficial de preços — modelos multimodais (Fase 2, item 6)

> Nenhuma API paga foi integrada. Preços consultados diretamente nas páginas
> oficiais (`platform.claude.com/docs/en/about-claude/pricing` e
> `developers.openai.com/api/docs/pricing` + `.../models`) nesta data — não
> uso estimativas de terceiros/agregadores como se fossem preço oficial.

## 1. Preços oficiais, por token (tabela verificada)

| Provedor | Modelo | Entrada (por 1M tokens) | Saída (por 1M tokens) | Aceita imagem? |
|---|---|---|---|---|
| Anthropic | Claude Haiku 5.5 (prompt ≤100k tokens) | $0,10 | $0,50 | Sim |
| Anthropic | Claude Sonnet 5 | $2,00 | $10,00 | Sim |
| Anthropic | Claude Opus 5.5 | $4,00 | $20,00 | Sim |
| OpenAI | GPT-6 Luna (`gpt-6-luna`) | $0,10 | $0,50 | Sim |
| OpenAI | GPT-6.1 Sol (`gpt-6.1-sol`) | $2,00 | $10,00 | Sim |
| OpenAI | GPT-6 Astra (`gpt-6-astra`) | $10,00 | $50,00 | Sim |

A página oficial da OpenAI confirma que todos os seus modelos "latest" (Astra,
Sol, Luna) aceitam entrada de imagem — não há uma tabela separada de preço
por imagem nesses modelos: a imagem é cobrada como parte dos tokens de
entrada, exatamente como a Anthropic também faz.

## 2. Estimativa de custo por edição de foto — **estimativa minha, não preço oficial, e NÃO MEDIDA**

Isso **não** é um número publicado pelos provedores (eles não publicam
"preço por análise de foto"), e também **não é uma medição real** — é uma
conta a partir do preço oficial por token (seção 1, verificado) aplicada a
uma premissa de quantidade de tokens que eu assumi, sem ter rodado nenhuma
chamada real contra esses modelos ainda. Tratar isso como "o custo" seria
assumir um consumo fixo antes de medi-lo, o que você pediu explicitamente
para não fazer. A tabela abaixo serve só para dar ordem de grandeza — a
única forma de saber o número real é medir com uma chamada de teste, o que
exige integrar a API (ainda não autorizado).

Premissas **assumidas, não medidas** (a partir do fluxo descrito em
`docs/fase2-inteligencia-fotografica.md` §6: imagem reduzida ~768px + resumo
do histograma em texto + pedido do usuário como entrada; resposta limitada
ao JSON estruturado do catálogo de operações como saída):
- ~1.500 tokens de entrada (imagem reduzida + texto do histograma + pedido)
- ~250 tokens de saída (JSON de operações + frase de explicação)

Se o tamanho real da imagem enviada, o tamanho real do resumo de histograma
em texto, ou o tamanho real da resposta do modelo divergirem dessas
premissas — o que é esperado, já que nunca medimos — o custo real muda na
mesma proporção. Trate a tabela abaixo como ilustrativa, não como
orçamento.

| Modelo | Custo estimado por edição |
|---|---|
| Claude Haiku 5.5 / GPT-6 Luna (opção mais barata) | ≈ US$ 0,0003 (menos de 1 centavo de dólar) |
| Claude Sonnet 5 / GPT-6.1 Sol (meio-termo) | ≈ US$ 0,0055 |
| Claude Opus 5.5 / GPT-6 Astra (topo de linha) | ≈ US$ 0,02 – 0,03 |

Mesmo o modelo mais caro fica abaixo de 3 centavos de dólar por edição com
essas premissas — o custo real pode variar conforme o tamanho real da
imagem/resposta, mas a ordem de grandeza (fração de centavo a poucos
centavos por pedido) deve se manter.

## 3. Latência

As páginas de preço não publicam latência padronizada por modelo — não vou
citar números de terceiros como se fossem oficiais (instrução já combinada).
O que dá para afirmar com segurança, sem número: os modelos "Luna"/Haiku são
posicionados pelos próprios provedores como as opções de resposta mais
rápida da família, com Astra/Opus mais lentos e mais caros. Se a latência
real for um critério decisivo, o jeito correto de medir é testar as duas
opções mais baratas diretamente, com a sua conta, antes de decidir — não
tenho como garantir isso só pela documentação de preço.

## 4. Necessidade de backend (reafirmando o que já estava no plano)

Ambos os provedores exigem uma chave de API que não pode ficar no frontend.
O Kliko hoje é 100% estático (sem servidor próprio) — qualquer uma dessas
integrações exige um backend mínimo (ex. função serverless) só para
intermediar a chamada. Isso não mudou com esta pesquisa.

## 5. Recomendação (ainda sujeita à sua aprovação — nenhuma API foi integrada)

Dado o custo por edição ser muito baixo em qualquer um dos dois modelos mais
baratos (Haiku 5.5 ou GPT-6 Luna), a decisão entre eles deveria vir de
qualidade da instrução estruturada e latência percebida no teste real, não
de preço — a diferença de preço entre os dois é irrelevante na prática
(ambos custam frações de centavo por edição). Minha sugestão, quando/se
isso for aprovado: testar os dois com o mesmo prompt e comparar a qualidade
da sugestão antes de escolher — e, nesse momento, apresentar o plano de
backend (qual função serverless, onde a chave fica guardada) junto com a
escolha final do modelo.
