/**
 * Kliko — tokens de animacao.
 *
 * Fonte unica de verdade para toda fisica de movimento do app.
 * Nenhum componente deve escrever { stiffness, damping } ou uma duracao
 * "solta" no meio do JSX — sempre importar daqui. Ver
 * /docs/animacoes.md e a planilha kliko_catalogo_120_animacoes.xlsx
 * para a justificativa de cada valor.
 */

export interface SpringToken {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
}

export const springs = {
  /** Resposta imediata a toque (botoes, thumb do slider). WWDC23 "Animate with springs". */
  snappy: { type: "spring", stiffness: 420, damping: 34, mass: 0.6 } as const,
  /** Padrao geral, usado quando nenhum outro se encaixa melhor. */
  balanced: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 } as const,
  /** Transicoes maiores e deliberadas (orb -> painel, sheets). */
  gentle: { type: "spring", stiffness: 210, damping: 26, mass: 1 } as const,
  /** Com leve "bounce" perceptivel — confirmacoes, favoritos. */
  bouncy: { type: "spring", stiffness: 260, damping: 18, mass: 0.7 } as const,
} as const;

export const durations = {
  instant: 0.1,
  fast: 0.15,
  base: 0.3,
  slow: 0.45,
} as const;

export const easings = {
  standard: [0.4, 0, 0.2, 1] as const,
  decelerate: [0, 0, 0.2, 1] as const,
  accelerate: [0.4, 0, 1, 1] as const,
};

/** Paleta visual do Kliko: branco suave + reflexos azuis discretos. */
export const kliko = {
  bg: "#f5f7fa",
  bgDeep: "#eef2f7",
  surface: "rgba(255,255,255,0.7)",
  surfaceStrong: "rgba(255,255,255,0.86)",
  blue: "#4f8ef7",
  blueSoft: "rgba(79,142,247,0.18)",
  blueGlow: "rgba(79,142,247,0.35)",
  text: "#1c1e21",
  textMuted: "#6b7280",
  danger: "#e2574c",
} as const;

/**
 * Respeita a preferencia de acessibilidade do sistema: quando o usuario
 * pede "reduzir movimento", trocamos molas por crossfades simples.
 * (melhoria proposta em kliko-arquitetura-animacoes-e-ordem.md, item 4.2)
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
