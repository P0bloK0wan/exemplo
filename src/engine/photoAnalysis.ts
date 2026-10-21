/**
 * Kliko — análise real de pixels (Fase 2).
 *
 * Tudo aqui lê pixels de verdade (uma estrutura compatível com
 * `ImageData`: { width, height, data: Uint8ClampedArray }). Nenhuma
 * função aqui é "análise multimodal por IA" — são cálculos
 * determinísticos (histograma, médias por região, uma heurística de
 * posição/cor para o céu). Ver docs/fase2-inteligencia-fotografica.md
 * §6 para o que, nesta fase, continua dependendo de um modelo pago.
 *
 * As funções recebem um `PixelBuffer` (estruturalmente compatível com
 * `ImageData` do navegador) em vez de exigir `ImageData` real — isso
 * deixa a análise testável em Node sem precisar de canvas/jsdom.
 */

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Histogram {
  /** 256 posições, luminância percebida (ITU-R BT.601) */
  luminance: Uint32Array;
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  totalPixels: number;
}

export function computeHistogram(buf: PixelBuffer): Histogram {
  const luminance = new Uint32Array(256);
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const { data } = buf;
  const totalPixels = buf.width * buf.height;

  for (let i = 0; i < data.length; i += 4) {
    const rv = data[i];
    const gv = data[i + 1];
    const bv = data[i + 2];
    const lum = Math.round(0.299 * rv + 0.587 * gv + 0.114 * bv);
    luminance[lum]++;
    r[rv]++;
    g[gv]++;
    b[bv]++;
  }

  return { luminance, r, g, b, totalPixels };
}

export interface ExposureAnalysis {
  meanLuminance: number; // 0..255
  /** % de pixels em cada faixa de luminância */
  distribution: {
    sombraProfunda: number; // 0-15
    sombra: number; // 15-60
    meioTom: number; // 60-180
    realce: number; // 180-240
    realceExtremo: number; // 240-255
  };
  /** % de pixels colados no 0 (sombra sem informação nenhuma) */
  shadowClipPct: number;
  /** % de pixels colados no 255 (realce sem informação nenhuma — "estourado") */
  highlightClipPct: number;
}

export function analyzeExposure(hist: Histogram): ExposureAnalysis {
  const { luminance, totalPixels } = hist;
  let sum = 0;
  let sombraProfunda = 0;
  let sombra = 0;
  let meioTom = 0;
  let realce = 0;
  let realceExtremo = 0;

  for (let v = 0; v < 256; v++) {
    const count = luminance[v];
    sum += v * count;
    if (v <= 15) sombraProfunda += count;
    else if (v <= 60) sombra += count;
    else if (v <= 180) meioTom += count;
    else if (v <= 240) realce += count;
    else realceExtremo += count;
  }

  const pct = (n: number) => (totalPixels > 0 ? (n / totalPixels) * 100 : 0);

  // "Clipping" de verdade (sem nenhuma informação recuperável) é mais
  // estrito que a faixa de sombra/realce: só os valores absolutos 0 e 255.
  const shadowClipPct = pct(luminance[0]);
  const highlightClipPct = pct(luminance[255]);

  return {
    meanLuminance: totalPixels > 0 ? sum / totalPixels : 0,
    distribution: {
      sombraProfunda: pct(sombraProfunda),
      sombra: pct(sombra),
      meioTom: pct(meioTom),
      realce: pct(realce),
      realceExtremo: pct(realceExtremo),
    },
    shadowClipPct,
    highlightClipPct,
  };
}

export type RegionClass = "escuro" | "medio" | "claro";

export interface RegionCell {
  row: number;
  col: number;
  avgLuminance: number;
  avgR: number;
  avgG: number;
  avgB: number;
  classification: RegionClass;
}

export interface RegionMap {
  rows: number;
  cols: number;
  cells: RegionCell[];
}

/**
 * Divide a imagem numa grade (padrão 12x12) e calcula a média de
 * luminância/cor de cada bloco. É a base tanto da classificação
 * claro/escuro quanto da heurística de céu abaixo — cálculo real
 * sobre os pixels, sem segmentação por IA.
 */
export function computeRegionMap(buf: PixelBuffer, rows = 12, cols = 12): RegionMap {
  const cells: RegionCell[] = [];
  const blockW = Math.max(1, Math.floor(buf.width / cols));
  const blockH = Math.max(1, Math.floor(buf.height / rows));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      const x0 = col * blockW;
      const y0 = row * blockH;
      const x1 = Math.min(buf.width, x0 + blockW);
      const y1 = Math.min(buf.height, y0 + blockH);

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * buf.width + x) * 4;
          sumR += buf.data[i];
          sumG += buf.data[i + 1];
          sumB += buf.data[i + 2];
          count++;
        }
      }

      const avgR = count > 0 ? sumR / count : 0;
      const avgG = count > 0 ? sumG / count : 0;
      const avgB = count > 0 ? sumB / count : 0;
      const avgLuminance = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;

      const classification: RegionClass =
        avgLuminance < 70 ? "escuro" : avgLuminance > 170 ? "claro" : "medio";

      cells.push({ row, col, avgLuminance, avgR, avgG, avgB, classification });
    }
  }

  return { rows, cols, cells };
}

export interface SkyMaskResult {
  /** máscara alfa 0..1 por célula da grade (mesma ordem de RegionMap.cells) */
  cellAlpha: number[];
  rows: number;
  cols: number;
  /**
   * Confiança média da detecção (0..1) — baixa quando a imagem não
   * tem um padrão claro de céu (ex.: foto de interior, still-life).
   * Usado para decidir se vale a pena oferecer a máscara ao usuário.
   */
  confidence: number;
}

/**
 * Heurística de céu — DELIBERADAMENTE simples e com limites
 * conhecidos: marca como "céu" os blocos na parte superior da imagem
 * que são claros E com componente azul dominante sobre o vermelho.
 *
 * O que isso NÃO garante, por design, e precisa ficar claro para
 * quem for usar:
 *  - Não identifica céu nublado/cinza, pôr do sol avermelhado, ou céu
 *    que ocupe a parte inferior do quadro (reflexo em água, por ex.).
 *  - Não tem qualquer noção de rosto/pessoa — se houver uma pessoa de
 *    roupa azul-clara na parte de cima do quadro, pode ser marcada
 *    por engano. Não deve ser anunciada como "preserva rostos".
 *  - É uma heurística de posição+cor, não segmentação semântica —
 *    sem testes de precisão/recall formais ainda (ver §10 do plano
 *    da Fase 2 e docs/fase2-inteligencia-fotografica.md).
 */
export function estimateSkyMask(region: RegionMap): SkyMaskResult {
  const cellAlpha: number[] = [];
  let skyLikeCount = 0;

  for (const cell of region.cells) {
    const verticalPosition = cell.row / Math.max(1, region.rows - 1); // 0 = topo, 1 = base
    const isUpperHalf = verticalPosition <= 0.6;
    const blueDominant = cell.avgB > cell.avgR + 8 && cell.avgB > cell.avgG - 4;
    const isBrightEnough = cell.avgLuminance > 110;

    let alpha = 0;
    if (isUpperHalf && blueDominant && isBrightEnough) {
      // Quanto mais perto do topo, mais confiante — reduz o peso perto
      // do limite dos 60% da altura, onde a ambiguidade é maior.
      alpha = 1 - verticalPosition / 0.6;
      alpha = Math.max(0.3, Math.min(1, alpha));
      skyLikeCount++;
    }
    cellAlpha.push(alpha);
  }

  const confidence = region.cells.length > 0 ? skyLikeCount / region.cells.length : 0;

  return { cellAlpha, rows: region.rows, cols: region.cols, confidence };
}

export interface PhotoAnalysis {
  histogram: Histogram;
  exposure: ExposureAnalysis;
  regionMap: RegionMap;
  skyMask: SkyMaskResult;
  analyzedWidth: number;
  analyzedHeight: number;
}

/** Tamanho máximo (maior lado) usado para análise — ver downscaleForAnalysis em pixelOps.ts. */
export const ANALYSIS_MAX_DIMENSION = 640;

export function analyzeBuffer(buf: PixelBuffer): PhotoAnalysis {
  const histogram = computeHistogram(buf);
  const exposure = analyzeExposure(histogram);
  const regionMap = computeRegionMap(buf);
  const skyMask = estimateSkyMask(regionMap);
  return { histogram, exposure, regionMap, skyMask, analyzedWidth: buf.width, analyzedHeight: buf.height };
}

/** Expande a máscara por célula da grade para um array alfa por pixel, do tamanho informado. */
export function upsampleCellAlphaToPixels(
  mask: SkyMaskResult,
  targetWidth: number,
  targetHeight: number,
): Float32Array {
  const out = new Float32Array(targetWidth * targetHeight);
  const blockW = targetWidth / mask.cols;
  const blockH = targetHeight / mask.rows;

  for (let y = 0; y < targetHeight; y++) {
    const row = Math.min(mask.rows - 1, Math.floor(y / blockH));
    for (let x = 0; x < targetWidth; x++) {
      const col = Math.min(mask.cols - 1, Math.floor(x / blockW));
      out[y * targetWidth + x] = mask.cellAlpha[row * mask.cols + col] ?? 0;
    }
  }

  return out;
}
