import { describe, expect, it } from "vitest";
import { computeDownscaledSize, applyMaskedAdjustment, adjustSaturationPixel, adjustExposurePixel } from "../pixelOps";
import type { PixelBuffer } from "../photoAnalysis";

describe("computeDownscaledSize — tratamento de imagens grandes", () => {
  it("não altera dimensões já menores que o máximo", () => {
    const r = computeDownscaledSize(400, 300, 640);
    expect(r).toEqual({ width: 400, height: 300, scale: 1 });
  });

  it("reduz preservando a proporção quando o lado maior excede o máximo (foto grande de iPhone, ex. 4032x3024)", () => {
    const r = computeDownscaledSize(4032, 3024, 640);
    expect(r.width).toBeLessThanOrEqual(640);
    expect(r.height).toBeLessThanOrEqual(640);
    // proporção original 4:3 preservada (com tolerância de arredondamento)
    expect(r.width / r.height).toBeCloseTo(4032 / 3024, 1);
  });

  it("nunca produz dimensão zero mesmo para entradas degeneradas", () => {
    const r = computeDownscaledSize(1, 10000, 640);
    expect(r.width).toBeGreaterThanOrEqual(1);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });
});

describe("adjustSaturationPixel / adjustExposurePixel", () => {
  it("amount 0 não altera o pixel", () => {
    expect(adjustSaturationPixel(10, 20, 30, 0)).toEqual([10, 20, 30]);
    expect(adjustExposurePixel(10, 20, 30, 0)).toEqual([10, 20, 30]);
  });

  it("satura nunca sai do intervalo 0..255", () => {
    const [r, g, b] = adjustSaturationPixel(255, 0, 0, 100);
    for (const v of [r, g, b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe("applyMaskedAdjustment — edição seletiva por máscara", () => {
  function buf2x1(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): PixelBuffer {
    const data = new Uint8ClampedArray([r1, g1, b1, 255, r2, g2, b2, 255]);
    return { width: 2, height: 1, data };
  }

  it("não altera pixels onde a máscara é 0", () => {
    const buf = buf2x1(100, 100, 100, 200, 50, 50);
    const mask = new Float32Array([0, 1]);
    const out = applyMaskedAdjustment(buf, mask, "saturation", 80);
    expect(out[0]).toBe(100);
    expect(out[1]).toBe(100);
    expect(out[2]).toBe(100);
  });

  it("altera pixels onde a máscara é 1, afetando pixels de verdade (não é um efeito visual de elemento HTML)", () => {
    const buf = buf2x1(100, 100, 100, 200, 50, 50);
    const mask = new Float32Array([0, 1]);
    const out = applyMaskedAdjustment(buf, mask, "saturation", 80);
    // pixel 2 (índice 4..7) deveria ter mudado porque está fora do cinza puro
    const changed = out[4] !== 200 || out[5] !== 50 || out[6] !== 50;
    expect(changed).toBe(true);
  });

  it("nunca modifica o buffer original (retorna um novo array)", () => {
    const buf = buf2x1(100, 100, 100, 200, 50, 50);
    const originalCopy = Uint8ClampedArray.from(buf.data);
    const mask = new Float32Array([1, 1]);
    applyMaskedAdjustment(buf, mask, "exposure", 50);
    expect(buf.data).toEqual(originalCopy);
  });

  it("mistura linearmente para alfa intermediário (meio do caminho entre original e ajustado)", () => {
    const buf = buf2x1(0, 0, 0, 0, 0, 0);
    const maskFull = new Float32Array([1, 1]);
    const maskHalf = new Float32Array([0.5, 0.5]);
    const full = applyMaskedAdjustment(buf, maskFull, "exposure", 100);
    const half = applyMaskedAdjustment(buf, maskHalf, "exposure", 100);
    // com alfa 0.5, a mudança deve ser aproximadamente a metade da mudança com alfa 1
    expect(half[0]).toBeCloseTo(full[0] / 2, 0);
  });
});
