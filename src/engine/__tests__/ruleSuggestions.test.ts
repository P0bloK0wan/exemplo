import { describe, expect, it } from "vitest";
import { suggestExposureFix, suggestSkyBoost, suggestHighlightRecovery } from "../ruleSuggestions";
import { analyzeBuffer, type PixelBuffer } from "../photoAnalysis";

function solidBuffer(w: number, h: number, r: number, g: number, b: number): PixelBuffer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

describe("suggestExposureFix — regras, não IA multimodal", () => {
  it("sugere aumentar exposição para foto escura", () => {
    const analysis = analyzeBuffer(solidBuffer(16, 16, 20, 20, 20));
    const s = suggestExposureFix(analysis);
    expect(s.patch.exposicao).toBeGreaterThan(0);
  });

  it("sugere reduzir exposição para foto muito clara", () => {
    const analysis = analyzeBuffer(solidBuffer(16, 16, 230, 230, 230));
    const s = suggestExposureFix(analysis);
    expect(s.patch.exposicao).toBeLessThan(0);
  });

  it("não sugere nada (patch vazio) para uma foto já equilibrada", () => {
    const analysis = analyzeBuffer(solidBuffer(16, 16, 128, 128, 128));
    const s = suggestExposureFix(analysis);
    expect(s.patch).toEqual({});
  });

  it("avisa sobre realces sem informação em vez de prometer recuperar o que não existe", () => {
    const analysis = analyzeBuffer(solidBuffer(16, 16, 255, 255, 255));
    const s = suggestExposureFix(analysis);
    expect(s.caveat).toBeTruthy();
    expect(s.explanation.toLowerCase()).not.toContain("recupero o detalhe");
  });
});

describe("suggestHighlightRecovery", () => {
  it("nunca promete recuperar detalhe de pixels 100% saturados — sempre inclui um aviso quando há clipping real", () => {
    const analysis = analyzeBuffer(solidBuffer(16, 16, 255, 255, 255));
    const s = suggestHighlightRecovery(analysis);
    expect(s.caveat).toBeDefined();
    expect(s.explanation).toMatch(/não existe detalhe/i);
  });

  it("não tem o que fazer numa foto sem realces problemáticos", () => {
    const analysis = analyzeBuffer(solidBuffer(16, 16, 120, 120, 120));
    const s = suggestHighlightRecovery(analysis);
    expect(s.patch).toEqual({});
  });
});

describe("suggestSkyBoost — limites explícitos da heurística", () => {
  it("recusa a sugestão quando a confiança da detecção de céu é baixa", () => {
    const analysis = analyzeBuffer(solidBuffer(16, 16, 128, 128, 128));
    const s = suggestSkyBoost(analysis);
    expect(s.patch).toEqual({});
    expect(s.explanation.toLowerCase()).toContain("não consegui identificar");
  });

  it("propõe a máscara com aviso explícito quando há céu plausível no topo da imagem", () => {
    const w = 20;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const isTop = y < h / 2;
        data[i] = isTop ? 140 : 40;
        data[i + 1] = isTop ? 180 : 40;
        data[i + 2] = isTop ? 230 : 40;
        data[i + 3] = 255;
      }
    }
    const analysis = analyzeBuffer({ width: w, height: h, data });
    const s = suggestSkyBoost(analysis);
    expect(s.patch.sky?.ativo).toBe(true);
    expect(s.caveat).toMatch(/experimental/i);
  });
});
