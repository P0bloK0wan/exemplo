import { describe, expect, it } from "vitest";
import {
  computeHistogram,
  analyzeExposure,
  computeRegionMap,
  estimateSkyMask,
  analyzeBuffer,
  upsampleCellAlphaToPixels,
  type PixelBuffer,
} from "../photoAnalysis";

/** Cria um PixelBuffer sólido (uma cor só) de w x h. */
function solidBuffer(w: number, h: number, r: number, g: number, b: number, a = 255): PixelBuffer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width: w, height: h, data };
}

describe("computeHistogram", () => {
  it("concentra todos os pixels no bucket de luminância correto para uma imagem sólida cinza", () => {
    const buf = solidBuffer(4, 4, 128, 128, 128);
    const hist = computeHistogram(buf);
    expect(hist.luminance[128]).toBe(16);
    expect(hist.totalPixels).toBe(16);
    // nenhum outro bucket deveria ter pixels
    const sumOthers = hist.luminance.reduce((s, v, i) => (i === 128 ? s : s + v), 0);
    expect(sumOthers).toBe(0);
  });

  it("preserva o buffer original (não muta os pixels de entrada)", () => {
    const buf = solidBuffer(2, 2, 10, 20, 30);
    const copy = Uint8ClampedArray.from(buf.data);
    computeHistogram(buf);
    expect(buf.data).toEqual(copy);
  });
});

describe("analyzeExposure", () => {
  it("detecta uma imagem majoritariamente escura", () => {
    const buf = solidBuffer(8, 8, 5, 5, 5);
    const exposure = analyzeExposure(computeHistogram(buf));
    expect(exposure.meanLuminance).toBeLessThan(20);
    expect(exposure.distribution.sombraProfunda).toBeCloseTo(100, 0);
  });

  it("detecta clipping de realce (branco puro, 255) e não confunde com realce normal", () => {
    const buf = solidBuffer(4, 4, 255, 255, 255);
    const exposure = analyzeExposure(computeHistogram(buf));
    expect(exposure.highlightClipPct).toBeCloseTo(100, 0);
    expect(exposure.shadowClipPct).toBe(0);
  });

  it("não aponta clipping numa imagem de meio-tom equilibrado", () => {
    const buf = solidBuffer(4, 4, 120, 120, 120);
    const exposure = analyzeExposure(computeHistogram(buf));
    expect(exposure.shadowClipPct).toBe(0);
    expect(exposure.highlightClipPct).toBe(0);
    expect(exposure.distribution.meioTom).toBeCloseTo(100, 0);
  });
});

describe("computeRegionMap", () => {
  it("classifica uma imagem clara inteira como 'claro' em todas as células", () => {
    const buf = solidBuffer(24, 24, 230, 230, 230);
    const map = computeRegionMap(buf, 4, 4);
    expect(map.cells).toHaveLength(16);
    expect(map.cells.every((c) => c.classification === "claro")).toBe(true);
  });

  it("classifica uma imagem escura inteira como 'escuro'", () => {
    const buf = solidBuffer(24, 24, 20, 20, 20);
    const map = computeRegionMap(buf, 4, 4);
    expect(map.cells.every((c) => c.classification === "escuro")).toBe(true);
  });
});

describe("estimateSkyMask", () => {
  it("não detecta céu numa imagem uniformemente cinza (sem azul dominante)", () => {
    const buf = solidBuffer(24, 24, 128, 128, 128);
    const mask = estimateSkyMask(computeRegionMap(buf, 6, 6));
    expect(mask.confidence).toBe(0);
    expect(mask.cellAlpha.every((a) => a === 0)).toBe(true);
  });

  it("detecta céu só nas células de cima quando o topo é claro/azul e a base é escura", () => {
    const w = 12;
    const h = 12;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const isTop = y < h / 2;
        data[i] = isTop ? 150 : 30; // R
        data[i + 1] = isTop ? 190 : 30; // G
        data[i + 2] = isTop ? 230 : 30; // B — azul dominante só no topo
        data[i + 3] = 255;
      }
    }
    const buf: PixelBuffer = { width: w, height: h, data };
    const region = computeRegionMap(buf, 6, 6);
    const mask = estimateSkyMask(region);

    expect(mask.confidence).toBeGreaterThan(0);
    // todas as celulas da metade de baixo (rows 3..5) devem ter alpha 0
    for (const cell of region.cells) {
      const idx = cell.row * region.cols + cell.col;
      if (cell.row >= 3) {
        expect(mask.cellAlpha[idx]).toBe(0);
      }
    }
  });
});

describe("analyzeBuffer + upsampleCellAlphaToPixels", () => {
  it("combina histograma, exposição, regiões e máscara de céu num único relatório", () => {
    const buf = solidBuffer(16, 16, 100, 150, 200);
    const analysis = analyzeBuffer(buf);
    expect(analysis.histogram.totalPixels).toBe(256);
    expect(analysis.regionMap.cells.length).toBeGreaterThan(0);
    expect(analysis.skyMask.cellAlpha.length).toBe(analysis.regionMap.cells.length);
  });

  it("expande a máscara por célula para o tamanho real da foto sem perder a proporção de blocos", () => {
    const mask = { cellAlpha: [1, 0, 0, 1], rows: 2, cols: 2, confidence: 0.5 };
    const pixels = upsampleCellAlphaToPixels(mask, 4, 4);
    expect(pixels.length).toBe(16);
    // canto superior-esquerdo (célula 0,0 = alpha 1)
    expect(pixels[0]).toBe(1);
    // canto superior-direito (célula 0,1 = alpha 0)
    expect(pixels[3]).toBe(0);
    // canto inferior-direito (célula 1,1 = alpha 1)
    expect(pixels[15]).toBe(1);
  });
});
