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
  const out = new Uint8ClampedArray(buf.data.length);
  const total = buf.width * buf.height;

  for (let p = 0; p < total; p++) {
    const i = p * 4;
    const alpha = alphaMask[p] ?? 0;
    const r = buf.data[i];
    const g = buf.data[i + 1];
    const b = buf.data[i + 2];
    const a = buf.data[i + 3];

    if (alpha <= 0) {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
      continue;
    }

    const [ar, ag, ab] =
      op === "saturation" ? adjustSaturationPixel(r, g, b, amount) : adjustExposurePixel(r, g, b, amount);

    out[i] = r + (ar - r) * alpha;
    out[i + 1] = g + (ag - g) * alpha;
    out[i + 2] = b + (ab - b) * alpha;
    out[i + 3] = a;
  }

  return out;
}
