import { describe, expect, it } from "vitest";
import { ANALOG_PRESETS, getAnalogPreset, resolveAdjustmentsForPreset, resolveEffectsForPreset, buildAnalogApplication } from "../analogPresets";
import { DEFAULT_ADJUSTMENTS } from "../photoEngine";
import { applyAnalogEffects, NO_ANALOG_EFFECTS } from "../pixelOps";
import type { PixelBuffer } from "../photoAnalysis";

describe("catálogo de presets analógicos", () => {
  it("todos os presets têm valores dentro dos limites conhecidos dos sliders (-100..100) e efeitos (0..100)", () => {
    for (const preset of ANALOG_PRESETS) {
      for (const v of Object.values(preset.base)) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      }
      expect(preset.grain).toBeGreaterThanOrEqual(0);
      expect(preset.grain).toBeLessThanOrEqual(100);
      expect(preset.vignette).toBeGreaterThanOrEqual(0);
      expect(preset.vignette).toBeLessThanOrEqual(100);
      expect(preset.fade).toBeGreaterThanOrEqual(0);
      expect(preset.fade).toBeLessThanOrEqual(100);
    }
  });

  it("getAnalogPreset devolve undefined para id desconhecido (nunca lança)", () => {
    expect(getAnalogPreset("nao-existe")).toBeUndefined();
  });

  it("buildAnalogApplication lança para preset desconhecido", () => {
    expect(() => buildAnalogApplication("nao-existe", 100)).toThrow();
  });
});

describe("interpolação por intensidade", () => {
  const preset = ANALOG_PRESETS[0];

  it("intensidade 0 devolve exatamente os ajustes neutros e efeitos zerados", () => {
    expect(resolveAdjustmentsForPreset(preset, 0)).toEqual(DEFAULT_ADJUSTMENTS);
    expect(resolveEffectsForPreset(preset, 0)).toEqual({ grain: 0, vignette: 0, fade: 0 });
  });

  it("intensidade 100 devolve exatamente os valores-base do preset", () => {
    expect(resolveAdjustmentsForPreset(preset, 100)).toEqual(preset.base);
    expect(resolveEffectsForPreset(preset, 100)).toEqual({ grain: preset.grain, vignette: preset.vignette, fade: preset.fade });
  });

  it("intensidade é presa em 0..100 mesmo com entrada fora do intervalo", () => {
    expect(resolveAdjustmentsForPreset(preset, 250)).toEqual(preset.base);
    expect(resolveAdjustmentsForPreset(preset, -50)).toEqual(DEFAULT_ADJUSTMENTS);
  });

  it("buildAnalogApplication monta o patch completo (ajustes + camada analog resolvida)", () => {
    const app = buildAnalogApplication(preset.id, 50);
    expect(app.analog.presetId).toBe(preset.id);
    expect(app.analog.intensity).toBe(50);
    expect(app.analog.grain).toBeCloseTo(preset.grain * 0.5, 5);
  });
});

describe("applyAnalogEffects — granulação/vinheta/desbotamento tocam pixels reais", () => {
  function solidBuffer(size: number, v: number): PixelBuffer {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    return { width: size, height: size, data };
  }

  it("sem nenhum efeito ativo, devolve uma cópia idêntica (nunca muta o original)", () => {
    const buf = solidBuffer(4, 120);
    const originalCopy = Uint8ClampedArray.from(buf.data);
    const out = applyAnalogEffects(buf, NO_ANALOG_EFFECTS);
    expect(Array.from(out)).toEqual(Array.from(originalCopy));
    expect(buf.data).toEqual(originalCopy);
  });

  it("desbotamento levanta pretos em direção ao cinza médio, nunca passando do teto de 40%", () => {
    const buf = solidBuffer(2, 0); // preto puro
    const out = applyAnalogEffects(buf, { grain: 0, vignette: 0, fade: 100 });
    // 40% do caminho de 0 até 128 = 51.2
    expect(out[0]).toBeCloseTo(128 * 0.4, 0);
    expect(out[0]).toBeLessThan(128 * 0.5);
  });

  it("vinheta escurece o canto mais que o centro, de forma determinística e reproduzível", () => {
    const buf = solidBuffer(20, 200);
    const out1 = applyAnalogEffects(buf, { grain: 0, vignette: 80, fade: 0 });
    const out2 = applyAnalogEffects(buf, { grain: 0, vignette: 80, fade: 0 });
    const centerIdx = (10 * 20 + 10) * 4;
    const cornerIdx = (0 * 20 + 0) * 4;
    expect(out1[cornerIdx]).toBeLessThan(out1[centerIdx]);
    // determinístico: mesma entrada produz exatamente o mesmo resultado
    expect(Array.from(out1)).toEqual(Array.from(out2));
  });

  it("grão produz variação entre pixels vizinhos (textura real, não um bloco uniforme) e é determinístico", () => {
    const buf = solidBuffer(8, 128);
    const out1 = applyAnalogEffects(buf, { grain: 60, vignette: 0, fade: 0 });
    const out2 = applyAnalogEffects(buf, { grain: 60, vignette: 0, fade: 0 });
    const values = new Set<number>();
    for (let i = 0; i < out1.length; i += 4) values.add(out1[i]);
    expect(values.size).toBeGreaterThan(1);
    expect(Array.from(out1)).toEqual(Array.from(out2));
  });
});
