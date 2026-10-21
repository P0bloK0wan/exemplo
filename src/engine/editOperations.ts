/**
 * Kliko — catálogo de operações de edição (Fase 2).
 *
 * Cada operação é registrada com um schema de parâmetros validados —
 * o mesmo padrão de "tool registry" usado como referência conceitual
 * do OpenJarvis (ver docs/reavaliacao-tecnologias.md), reimplementado
 * do zero para edição de fotos, não para ferramentas de agente de IA.
 *
 * Este registro é o "menu fechado" que tanto as sugestões por regras
 * (ruleSuggestions.ts) quanto — no futuro — um modelo multimodal
 * pago poderão escolher e parametrizar. Nenhum dos dois pode gerar
 * pixels livremente: só escolhem entre operações pré-testadas, o que
 * limita o raio de dano de uma interpretação errada.
 */

export type EditOperationScope = "global" | "mask";

export interface EditOperationParam {
  name: string;
  /** [min, max] — qualquer valor fora disso é cortado (clamp), nunca rejeitado silenciosamente nem aplicado fora do intervalo. */
  range: [number, number];
  default: number;
}

export interface EditOperation {
  id: string;
  /** nome em PT-BR, o que a Mini Kliko fala/mostra */
  label: string;
  scope: EditOperationScope;
  /** quando scope === "mask", qual heurística de região esta operação usa */
  maskKind?: "sky";
  params: EditOperationParam[];
}

export const EDIT_OPERATIONS: EditOperation[] = [
  {
    id: "exposure",
    label: "Exposição",
    scope: "global",
    params: [{ name: "amount", range: [-100, 100], default: 0 }],
  },
  {
    id: "contrast",
    label: "Contraste",
    scope: "global",
    params: [{ name: "amount", range: [-100, 100], default: 0 }],
  },
  {
    id: "saturation",
    label: "Saturação",
    scope: "global",
    params: [{ name: "amount", range: [-100, 100], default: 0 }],
  },
  {
    id: "temperature",
    label: "Temperatura",
    scope: "global",
    params: [{ name: "amount", range: [-100, 100], default: 0 }],
  },
  {
    id: "sky_saturation",
    label: "Saturação seletiva do céu (experimental)",
    scope: "mask",
    maskKind: "sky",
    params: [{ name: "amount", range: [0, 100], default: 0 }],
  },
  {
    id: "sky_exposure",
    label: "Exposição seletiva do céu (experimental)",
    scope: "mask",
    maskKind: "sky",
    params: [{ name: "amount", range: [-100, 100], default: 0 }],
  },
];

export function getOperation(id: string): EditOperation {
  const op = EDIT_OPERATIONS.find((o) => o.id === id);
  if (!op) throw new Error(`Operação de edição desconhecida: "${id}"`);
  return op;
}

/**
 * Valida e corta (clamp) os parâmetros recebidos contra o schema da
 * operação. Nunca lança por um valor fora do intervalo — corrige
 * silenciosamente para o limite mais próximo, porque um comando de
 * voz mal-interpretado ("+500 de exposição") não deve conseguir gerar
 * um resultado absurdo ou quebrar o motor de edição.
 *
 * Lança erro apenas para um parâmetro que não existe no schema —
 * isso sim é um erro de programação/integração, não uma entrada de
 * usuário fora do normal.
 */
export function validateParams(
  op: EditOperation,
  params: Record<string, number>,
): Record<string, number> {
  const validated: Record<string, number> = {};
  for (const schema of op.params) {
    const raw = params[schema.name];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : schema.default;
    const [min, max] = schema.range;
    validated[schema.name] = Math.min(max, Math.max(min, value));
  }
  const unknown = Object.keys(params).filter((k) => !op.params.some((p) => p.name === k));
  if (unknown.length > 0) {
    throw new Error(`Operação "${op.id}" recebeu parâmetro(s) desconhecido(s): ${unknown.join(", ")}`);
  }
  return validated;
}

export function defaultParamsFor(op: EditOperation): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of op.params) out[p.name] = p.default;
  return out;
}
