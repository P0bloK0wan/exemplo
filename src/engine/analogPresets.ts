/**
 * Kliko — presets fotográficos analógicos (Fase 3).
 *
 * Cada preset combina (a) os 4 ajustes globais já existentes
 * (exposição/contraste/saturação/temperatura, via `ctx.filter`) com
 * (b) efeitos que o `ctx.filter` do CSS não consegue expressar —
 * granulação, vinheta e desbotamento — resolvidos pixel a pixel em
 * `pixelOps.ts::applyAnalogEffects`. Os dois conjuntos são desenhados
 * sobre o bitmap real do canvas, então sobrevivem à exportação
 * (`exportCanvasAsPng`) exatamente como aparecem na prévia — não é
 * uma combinação de filtros CSS decorativos.
 *
 * Nomes e curvas são originais do Kliko, inspirados na IDEIA de
 * fotografia analógica (não nos nomes/aparência do Dazz Cam).
 */
import type { AdjustmentValues, AnalogLayer } from "./photoEngine";
import { DEFAULT_ADJUSTMENTS } from "./photoEngine";
import type { AnalogEffects } from "./pixelOps";

export type { AnalogLayer };

export interface AnalogPresetDefinition {
  id: string;
  label: string;
  /** ajustes-base dos 4 sliders globais quando o preset está a 100% de intensidade */
  base: AdjustmentValues;
  grain: number;
  vignette: number;
  fade: number;
}

/**
 * Catálogo original de 6 presets. As curvas foram escolhidas para
 * cobrir famílias visuais claramente distintas (quente/frio,
 * contraste alto/baixo, com/sem grão) — não para imitar um filme ou
 * câmera real específica.
 */
export const ANALOG_PRESETS: AnalogPresetDefinition[] = [
  {
    id: "classico",
    label: "Clássico",
    base: { exposicao: 4, contraste: 14, saturacao: -6, temperatura: 10 },
    grain: 22,
    vignette: 18,
    fade: 10,
  },
  {
    id: "retro-quente",
    label: "Retrô Quente",
    base: { exposicao: 8, contraste: -6, saturacao: -4, temperatura: 42 },
    grain: 16,
    vignette: 10,
    fade: 28,
  },
  {
    id: "mono-suave",
    label: "Mono Suave",
    base: { exposicao: 2, contraste: 10, saturacao: -100, temperatura: 0 },
    grain: 30,
    vignette: 14,
    fade: 8,
  },
  {
    id: "esmaecido",
    label: "Esmaecido",
    base: { exposicao: 10, contraste: -22, saturacao: -18, temperatura: 6 },
    grain: 8,
    vignette: 6,
    fade: 55,
  },
  {
    id: "contraste-frio",
    label: "Contraste Frio",
    base: { exposicao: -4, contraste: 26, saturacao: 8, temperatura: -34 },
    grain: 12,
    vignette: 24,
    fade: 0,
  },
  {
    id: "sombra-profunda",
    label: "Sombra Profunda",
    base: { exposicao: -14, contraste: 22, saturacao: -12, temperatura: -8 },
    grain: 26,
    vignette: 34,
    fade: 0,
  },
];

export function getAnalogPreset(id: string): AnalogPresetDefinition | undefined {
  return ANALOG_PRESETS.find((p) => p.id === id);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpola os 4 sliders globais entre neutro e o preset, pela intensidade 0..100. */
export function resolveAdjustmentsForPreset(preset: AnalogPresetDefinition, intensity: number): AdjustmentValues {
  const t = Math.min(100, Math.max(0, intensity)) / 100;
  return {
    exposicao: lerp(DEFAULT_ADJUSTMENTS.exposicao, preset.base.exposicao, t),
    contraste: lerp(DEFAULT_ADJUSTMENTS.contraste, preset.base.contraste, t),
    saturacao: lerp(DEFAULT_ADJUSTMENTS.saturacao, preset.base.saturacao, t),
    temperatura: lerp(DEFAULT_ADJUSTMENTS.temperatura, preset.base.temperatura, t),
  };
}

/** Escala grain/vignette/fade do preset pela intensidade 0..100 — os valores já resolvidos que o render usa. */
export function resolveEffectsForPreset(preset: AnalogPresetDefinition, intensity: number): AnalogEffects {
  const t = Math.min(100, Math.max(0, intensity)) / 100;
  return {
    grain: preset.grain * t,
    vignette: preset.vignette * t,
    fade: preset.fade * t,
  };
}

/** Resultado completo (sliders globais + camada analógica) de aplicar um preset a uma dada intensidade. */
export function buildAnalogApplication(
  presetId: string,
  intensity: number,
): { adjustments: AdjustmentValues; analog: AnalogLayer } {
  const preset = getAnalogPreset(presetId);
  if (!preset) {
    throw new Error(`Preset analógico desconhecido: "${presetId}"`);
  }
  const adjustments = resolveAdjustmentsForPreset(preset, intensity);
  const effects = resolveEffectsForPreset(preset, intensity);
  return {
    adjustments,
    analog: { presetId, intensity, ...effects },
  };
}
