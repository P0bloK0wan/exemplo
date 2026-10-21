/**
 * Kliko — operações de pixel de baixo nível (Fase 2).
 *
 * `applyMaskedAdjustment` é a prova de que a edição seletiva ("deixe
 * o céu mais azul sem modificar o rosto") toca pixels reais: ela lê
 * `ImageData` real e escreve um novo `Uint8ClampedArray`, misturando
 * o valor ajustado com o original pixel a pixel segundo o alfa da
 * máscara — nunca aplica um filtro CSS sobre um elemento inteiro.
 */
import type { PixelBuffer } from "./photoAnalysis";

/**
 * Tamanho máximo (maior lado) em que a passagem de pixel da máscara
 * seletiva roda. Fotos de iPhone (ex. 4032x3024, 12MP) processadas em
 * JS pixel a pixel na resolução total travavam a thread principal no
 * Safari por tempo perceptível e alocavam ~48MB por cópia — isso é o
 * que a revisão de desempenho da Fase 2 encontrou. A camada de céu é
 * experimental e sutil, então processar numa versão reduzida e depois
 * escalar de volta é um custo visual aceitável (perda de nitidez
 * apenas na própria região ajustada) pela estabilidade ganha.
 */
export const MASK_RENDER_MAX_DIMENSION = 1600;

/** Calcula dimensões reduzidas preservando a proporção, para a análise (nunca para o resultado final). */
export function computeDownscaledSize(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number; scale: number } {
  const largest = Math.max(width, height);
  if (largest <= maxDimension || largest === 0) {
    return { width, height, scale: 1 };
  }
  const scale = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * Ajusta saturação de um pixel (R,G,B 0..255) por um fator -100..100,
 * misturando com o seu próprio nível de cinza (luminância perceptual).
 */
export function adjustSaturationPixel(r: number, g: number, b: number, amount: number): [number, number, number] {
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  const factor = 1 + amount / 100;
  return [
    clamp255(gray + (r - gray) * factor),
    clamp255(gray + (g - gray) * factor),
    clamp255(gray + (b - gray) * factor),
  ];
}

export function adjustExposurePixel(r: number, g: number, b: number, amount: number): [number, number, number] {
  const delta = (amount / 100) * 60; // +-60 nos extremos, aditivo simples e previsível
  return [clamp255(r + delta), clamp255(g + delta), clamp255(b + delta)];
}

function clamp255(v: number): number {
  return Math.min(255, Math.max(0, v));
}

/**
 * Aplica uma operação de pixel (saturação ou exposição, por ora) só
 * onde o alfa da máscara é > 0, misturando linearmente entre o pixel
 * original e o ajustado — é o que evita um corte abrupto na borda da
 * região selecionada.
 *
 * Nunca modifica `buf.data` diretamente: devolve um Uint8ClampedArray
 * novo, preservando o buffer original (quem chama decide o que fazer
 * com o resultado) — é esse contrato que garante que a imagem
 * original nunca é degradada, mesmo chamando isso várias vezes.
 */
export function applyMaskedAdjustment(
  buf: PixelBuffer,
  alphaMask: Float32Array,
  op: "saturation" | "exposure",
  amount: number,
): Uint8ClampedArray {
  return applyMaskedAdjustments(buf, alphaMask, [{ op, amount }]);
}

export interface MaskedOp {
  op: "saturation" | "exposure";
  amount: number;
}

/**
 * Como `applyMaskedAdjustment`, mas aplica VÁRIAS operações na mesma
 * passagem por pixel, numa única alocação — usado quando saturação E
 * exposição seletivas estão ativas ao mesmo tempo, para não alocar um
 * `Uint8ClampedArray` do tamanho da foto inteira por operação (numa
 * foto de 12 megapixels do iPhone, cada cópia extra é ~48MB; revisão
 * de desempenho da Fase 2 encontrou isso causando pressão de memória
 * no Safari quando a máscara de céu estava ativa).
 */
/**
 * Ruído pseudo-aleatório determinístico por posição de pixel (sem
 * estado global, sem Math.random()): a mesma foto com o mesmo preset
 * sempre produz o MESMO grão, na prévia e na exportação final. Isso
 * importa porque um grão diferente a cada render pareceria um bug de
 * "imagem tremendo", não textura de filme.
 */
function hashNoise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  // normaliza para -1..1
  return ((h & 0xffff) / 0xffff) * 2 - 1;
}

export interface AnalogEffects {
  /** 0..100 — intensidade do ruído de grão (textura de filme real, não um gradiente decorativo). */
  grain: number;
  /** 0..100 — escurecimento radial nas bordas, desenhado pixel a pixel (não um box-shadow CSS). */
  vignette: number;
  /** 0..100 — levanta os tons escuros em direção ao cinza médio (efeito "desbotado"), capado a 40% mesmo no máximo para a foto continuar legível. */
  fade: number;
}

export const NO_ANALOG_EFFECTS: AnalogEffects = { grain: 0, vignette: 0, fade: 0 };

/**
 * Aplica granulação + vinheta + desbotamento numa única passagem por
 * pixel e uma única alocação — mesmo motivo de `applyMaskedAdjustments`:
 * evitar várias cópias de ~48MB numa foto de 12MP do iPhone. Afeta os
 * pixels reais do canvas (sobrevive a `toBlob`/export), nunca é um
 * filtro CSS que desapareceria ao exportar.
 *
 * Ordem do processamento, por pixel: 1) desbotamento (curva de tom,
 * levanta pretos), 2) vinheta (escurece multiplicativamente por
 * distância do centro), 3) grão (ruído aditivo por canal) — nessa
 * ordem porque o grão deve ficar visível por cima do resultado final,
 * não ser "lavado" pelo desbotamento.
 */
export function applyAnalogEffects(buf: PixelBuffer, effects: AnalogEffects): Uint8ClampedArray {
  const { width, height, data } = buf;
  const out = new Uint8ClampedArray(data.length);
  const { grain, vignette, fade } = effects;

  if (grain === 0 && vignette === 0 && fade === 0) {
    out.set(data);
    return out;
  }

  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy) || 1;
  const fadeStrength = (fade / 100) * 0.4; // cap documentado: nunca mais que 40% em direção ao cinza médio
  const grainStrength = (grain / 100) * 36; // amplitude máxima do ruído por canal, em níveis de 0..255
  const vignetteStrength = vignette / 100;

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const a = data[i + 3];

      if (fadeStrength > 0) {
        r = r + (128 - r) * fadeStrength;
        g = g + (128 - g) * fadeStrength;
        b = b + (128 - b) * fadeStrength;
      }

      if (vignetteStrength > 0) {
        const dx = x - cx;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist; // 0 no centro, ~1 no canto
        const falloff = Math.min(1, dist * dist); // suave perto do centro, mais forte na borda
        const darken = 1 - vignetteStrength * falloff;
        r *= darken;
        g *= darken;
        b *= darken;
      }

      if (grainStrength > 0) {
        const n = hashNoise(x, y, 17) * grainStrength;
        r += n;
        g += n;
        b += n;
      }

      out[i] = clamp255(r);
      out[i + 1] = clamp255(g);
      out[i + 2] = clamp255(b);
      out[i + 3] = a;
    }
  }

  return out;
}

export function applyMaskedAdjustments(buf: PixelBuffer, alphaMask: Float32Array, ops: MaskedOp[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(buf.data.length);
  const total = buf.width * buf.height;
  const activeOps = ops.filter((o) => o.amount !== 0);

  for (let p = 0; p < total; p++) {
    const i = p * 4;
    const alpha = alphaMask[p] ?? 0;
    let r = buf.data[i];
    let g = buf.data[i + 1];
    let b = buf.data[i + 2];
    const a = buf.data[i + 3];

    if (alpha > 0 && activeOps.length > 0) {
      let ar = r;
      let ag = g;
      let ab = b;
      for (const { op, amount } of activeOps) {
        [ar, ag, ab] = op === "saturation" ? adjustSaturationPixel(ar, ag, ab, amount) : adjustExposurePixel(ar, ag, ab, amount);
      }
      r = r + (ar - r) * alpha;
      g = g + (ag - g) * alpha;
      b = b + (ab - b) * alpha;
    }

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }

  return out;
}
