/**
 * Kliko — sugestões baseadas em regras a partir do histograma (Fase 2).
 *
 * IMPORTANTE: isto é análise determinística por regras (if/else sobre
 * números de um histograma real), NÃO é "análise multimodal por IA".
 * Nenhuma função aqui chama um modelo externo. O que de fato depende
 * de um modelo multimodal pago está isolado em
 * docs/fase2-inteligencia-fotografica.md §6 e não foi implementado.
 */
import type { PhotoAnalysis } from "./photoAnalysis";
import type { EditState } from "./photoEngine";

export interface RuleSuggestion {
  /** o que muda no estado de edição, já pronto para entrar como draft */
  patch: Partial<EditState>;
  /** frase que a Mini Kliko fala/mostra — sempre honesta sobre ser uma regra, não "a IA viu sua foto" */
  explanation: string;
  /** aviso a mostrar quando a regra detecta uma limitação conhecida (ex.: realce já sem informação) */
  caveat?: string;
}

/**
 * Pedido tipo "melhore a iluminação" — decide subir ou baixar exposição
 * com base na luminância média real da foto, e avisa quando não há o
 * que recuperar (realce/sombra já "estourados", sem dado nenhum).
 */
export function suggestExposureFix(analysis: PhotoAnalysis): RuleSuggestion {
  const { meanLuminance, distribution } = analysis.exposure;

  if (analysis.exposure.highlightClipPct > 8) {
    return {
      patch: { exposicao: Math.max(-60, -20 - distribution.realceExtremo) },
      explanation:
        "Essa foto tem uma boa parte de realces sem nenhuma informação — reduzi um pouco a exposição geral para não piorar, mas não recupero detalhe que não existe no arquivo original.",
      caveat: "Áreas totalmente saturadas (brancas puras) não têm dado de cor para recuperar — isso não é um limite do Kliko, é físico.",
    };
  }

  if (meanLuminance < 90) {
    const amount = Math.min(45, Math.round((110 - meanLuminance) * 0.6));
    return {
      patch: { exposicao: amount },
      explanation: `A foto está com luminância média baixa (${Math.round(meanLuminance)} de 255) — aumentei a exposição em regra fixa, sem alterar saturação ou cor.`,
    };
  }

  if (meanLuminance > 190) {
    const amount = -Math.min(35, Math.round((meanLuminance - 160) * 0.5));
    return {
      patch: { exposicao: amount },
      explanation: `A foto já está bem clara (luminância média ${Math.round(meanLuminance)} de 255) — reduzi um pouco a exposição para equilibrar.`,
    };
  }

  return {
    patch: {},
    explanation: "A exposição dessa foto já está equilibrada pelo histograma — não vou mexer para não perder naturalidade.",
  };
}

/**
 * Pedido tipo "deixe o céu mais azul" — só é oferecido quando a
 * heurística de céu tem confiança mínima; do contrário, diz
 * honestamente que não identificou uma região de céu com segurança.
 */
export function suggestSkyBoost(analysis: PhotoAnalysis): RuleSuggestion {
  if (analysis.skyMask.confidence < 0.08) {
    return {
      patch: {},
      explanation:
        "Não consegui identificar uma região de céu com confiança suficiente nessa foto — a detecção atual é experimental e baseada em posição e cor, não em reconhecimento de cena.",
      caveat: "Funciona melhor em fotos com céu claro ocupando a parte de cima do quadro.",
    };
  }

  return {
    patch: { sky: { ativo: true, saturacao: 30, exposicao: 0 } },
    explanation: "Identifiquei uma possível região de céu na parte de cima da foto e aumentei a saturação só ali — veja a prévia antes de confirmar.",
    caveat: "Essa detecção é experimental: pode incluir por engano outras áreas azuis claras e não tem qualquer noção de rosto ou pessoa.",
  };
}

/**
 * Pedido tipo "recupere os detalhes das partes muito claras" — a regra
 * explícita pedida: nunca prometer recuperar o que não existe.
 */
export function suggestHighlightRecovery(analysis: PhotoAnalysis): RuleSuggestion {
  const { highlightClipPct, realceExtremo } = {
    highlightClipPct: analysis.exposure.highlightClipPct,
    realceExtremo: analysis.exposure.distribution.realceExtremo,
  };

  if (highlightClipPct > 3) {
    return {
      patch: { exposicao: -15, contraste: 10 },
      explanation: "Reduzi um pouco a exposição e aumentei o contraste para disfarçar a área estourada, mas sendo direto: não existe detalhe para recuperar onde o sensor já gravou branco puro.",
      caveat: `Cerca de ${highlightClipPct.toFixed(1)}% dos pixels estão totalmente saturados (sem informação de cor) — isso é uma limitação do arquivo original, não do processamento.`,
    };
  }

  if (realceExtremo > 10) {
    return {
      patch: { exposicao: -10 },
      explanation: "Há uma faixa grande de realces bem próxima do limite, então reduzi um pouco a exposição por segurança — ainda há informação recuperável aqui, diferente de um pixel 100% estourado.",
    };
  }

  return {
    patch: {},
    explanation: "Não há sinal de realces problemáticos nessa foto pelo histograma — não há o que recuperar.",
  };
}
