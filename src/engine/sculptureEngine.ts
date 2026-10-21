/**
 * Kliko — motor puro da "escultura" da Mini Kliko (Fase 4 experimental).
 *
 * Única fonte de verdade geométrica para as duas representações
 * visuais (SVG/Motion e WebGL) — ambas leem os mesmos lóbulos
 * normalizados desta função, é isso que garante que pareçam "duas
 * representações do mesmo objeto", como pedido. Não depende de DOM,
 * Canvas ou React — testável isoladamente.
 *
 * Geometria inspirada na referência (volumes orgânicos entrelaçados):
 * 4 "lóbulos" (círculos num campo normalizado -1..1) cuja posição e
 * raio variam por estado. A fusão visual (bordas que se confundem,
 * sombra na interseção) é responsabilidade de cada renderer (filtro
 * "goo" no SVG, campo implícito no shader) — este módulo só decide
 * ONDE cada lóbulo está a cada instante.
 */

export type SculptureState = "aguardando" | "ouvindo" | "pensando" | "falando" | "editando" | "concluindo";

export interface Lobe {
  cx: number; // -1..1
  cy: number; // -1..1
  r: number; // 0..~0.7
}

export interface SculptureFrame {
  lobes: Lobe[];
  /** 0..1 — intensidade geral do brilho de borda/realce, usada por ambos os renderers */
  glow: number;
}

export interface ReactiveInput {
  /** 0..1, amplitude real do microfone (RMS normalizado) — só relevante no estado "ouvindo" */
  micLevel?: number;
  /** 0..1, pulso decrescente disparado por evento de fala — só relevante no estado "falando" */
  speechPulse?: number;
  /** 0..1, progresso da transformação em painel — só relevante em "editando"/"concluindo" (0 = escultura compacta, 1 = totalmente desdobrada) */
  panelProgress?: number;
}

/** Composição-base dos 4 lóbulos, próxima da referência: um par maior sobreposto + dois menores preenchendo as reentrâncias. */
const BASE_LOBES: Lobe[] = [
  { cx: -0.22, cy: -0.08, r: 0.46 },
  { cx: 0.26, cy: 0.04, r: 0.42 },
  { cx: -0.06, cy: 0.32, r: 0.26 },
  { cx: 0.1, cy: -0.3, r: 0.22 },
];

/** Composição alternativa para o estado "pensando" — mesma "massa" total, arranjo diferente. */
const THINKING_LOBES: Lobe[] = [
  { cx: 0.24, cy: -0.2, r: 0.4 },
  { cx: -0.28, cy: 0.1, r: 0.44 },
  { cx: 0.08, cy: 0.3, r: 0.3 },
  { cx: -0.1, cy: -0.32, r: 0.2 },
];

/** Composição "desdobrada" para onde a escultura se estica ao virar painel — um lóbulo migra para a borda e achata. */
const UNFOLDED_LOBES: Lobe[] = [
  { cx: -0.55, cy: -0.5, r: 0.3 },
  { cx: 0.5, cy: -0.5, r: 0.3 },
  { cx: 0, cy: 0.55, r: 0.42 },
  { cx: 0, cy: -0.05, r: 0.18 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpLobes(a: Lobe[], b: Lobe[], t: number): Lobe[] {
  return a.map((lobe, i) => ({
    cx: lerp(lobe.cx, b[i].cx, t),
    cy: lerp(lobe.cy, b[i].cy, t),
    r: lerp(lobe.r, b[i].r, t),
  }));
}

/** Curva de "respiração": sobe e desce suavemente, sem o "tique" perceptível de um seno puro perto dos extremos. */
function breathe(t: number, periodSeconds: number): number {
  const phase = (t % periodSeconds) / periodSeconds; // 0..1
  const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2; // 0..1..0
  return triangle * triangle * (3 - 2 * triangle); // smoothstep — acelera/desacelera nas bordas, não é um "ricochete" linear
}

function scaleLobes(lobes: Lobe[], factor: number): Lobe[] {
  return lobes.map((l) => ({ ...l, r: l.r * factor }));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Calcula o quadro atual (posições/raios dos 4 lóbulos + brilho) para
 * um estado, instante `t` (segundos, contínuo, não reinicia ao trocar
 * de estado — evita "saltos" na animação) e entradas reativas
 * opcionais (nível de microfone, pulso de fala, progresso do painel).
 */
export function computeSculptureFrame(state: SculptureState, t: number, reactive: ReactiveInput = {}): SculptureFrame {
  switch (state) {
    case "aguardando": {
      const b = breathe(t, 3.6);
      return { lobes: scaleLobes(BASE_LOBES, 0.97 + b * 0.06), glow: 0.4 + b * 0.1 };
    }

    case "ouvindo": {
      const level = clamp01(reactive.micLevel ?? 0);
      // cada lóbulo reage com uma fase levemente diferente (índice * offset fixo),
      // para não "respirar" todos exatamente juntos — ainda determinístico, não aleatório.
      const lobes = BASE_LOBES.map((l, i) => {
        const localPulse = breathe(t * 1.6 + i * 0.18, 1.1);
        const boost = 1 + level * (0.14 + localPulse * 0.08);
        return { ...l, r: l.r * boost };
      });
      return { lobes, glow: 0.45 + level * 0.4 };
    }

    case "pensando": {
      const cyclePhase = breathe(t, 2.4); // 0..1..0 — vai e volta entre as duas composições
      return { lobes: lerpLobes(BASE_LOBES, THINKING_LOBES, cyclePhase), glow: 0.5 };
    }

    case "falando": {
      const pulse = clamp01(reactive.speechPulse ?? 0);
      // o pulso afeta mais os dois lóbulos "de baixo" (índices 2 e 3 em BASE_LOBES),
      // como se a fala saísse de uma região específica da escultura.
      const lobes = BASE_LOBES.map((l, i) => {
        const weight = i >= 2 ? 1 : 0.35;
        return { ...l, r: l.r * (1 + pulse * 0.22 * weight) };
      });
      return { lobes, glow: 0.5 + pulse * 0.35 };
    }

    case "editando": {
      const progress = clamp01(reactive.panelProgress ?? 1);
      return { lobes: lerpLobes(BASE_LOBES, UNFOLDED_LOBES, progress), glow: 0.4 + progress * 0.2 };
    }

    case "concluindo": {
      // mesma matemática de "editando", só que o chamador tipicamente anima panelProgress de 1 -> 0.
      const progress = clamp01(reactive.panelProgress ?? 0);
      return { lobes: lerpLobes(BASE_LOBES, UNFOLDED_LOBES, progress), glow: 0.4 + progress * 0.2 };
    }
  }
}

export { BASE_LOBES, THINKING_LOBES, UNFOLDED_LOBES };
