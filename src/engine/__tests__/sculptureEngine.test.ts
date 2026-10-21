import { describe, expect, it } from "vitest";
import { computeSculptureFrame, BASE_LOBES, type SculptureState } from "../sculptureEngine";

const ALL_STATES: SculptureState[] = ["aguardando", "ouvindo", "pensando", "falando", "editando", "concluindo"];

describe("computeSculptureFrame — validade geométrica em todos os estados", () => {
  it("sempre devolve exatamente 4 lóbulos com raio positivo e finito, para qualquer estado/tempo", () => {
    for (const state of ALL_STATES) {
      for (const t of [0, 0.5, 1.7, 3.6, 10, 123.456]) {
        const frame = computeSculptureFrame(state, t);
        expect(frame.lobes).toHaveLength(4);
        for (const lobe of frame.lobes) {
          expect(Number.isFinite(lobe.cx)).toBe(true);
          expect(Number.isFinite(lobe.cy)).toBe(true);
          expect(lobe.r).toBeGreaterThan(0);
          expect(Number.isFinite(lobe.r)).toBe(true);
        }
        expect(frame.glow).toBeGreaterThanOrEqual(0);
        expect(frame.glow).toBeLessThanOrEqual(1);
      }
    }
  });

  it("é determinístico: o mesmo estado/tempo/entrada reativa sempre produz o mesmo quadro", () => {
    const a = computeSculptureFrame("pensando", 1.234);
    const b = computeSculptureFrame("pensando", 1.234);
    expect(a).toEqual(b);
  });
});

describe("aguardando — respiração contínua e limitada", () => {
  it("o raio oscila dentro de uma faixa pequena em torno do tamanho base, nunca explode", () => {
    const baseR = BASE_LOBES[0].r;
    for (const t of [0, 0.9, 1.8, 2.7, 3.6, 7.2]) {
      const frame = computeSculptureFrame("aguardando", t);
      expect(frame.lobes[0].r).toBeGreaterThanOrEqual(baseR * 0.95);
      expect(frame.lobes[0].r).toBeLessThanOrEqual(baseR * 1.05);
    }
  });
});

describe("ouvindo — reage de forma monotônica ao nível do microfone", () => {
  it("nível de microfone mais alto nunca produz um raio médio menor que um nível mais baixo, no mesmo instante", () => {
    const t = 0.73;
    const low = computeSculptureFrame("ouvindo", t, { micLevel: 0.1 });
    const high = computeSculptureFrame("ouvindo", t, { micLevel: 0.9 });
    const avg = (f: typeof low) => f.lobes.reduce((s, l) => s + l.r, 0) / f.lobes.length;
    expect(avg(high)).toBeGreaterThan(avg(low));
    expect(high.glow).toBeGreaterThan(low.glow);
  });

  it("nível de microfone fora de 0..1 é preso ao intervalo (nunca produz raio negativo ou glow > 1)", () => {
    const frame = computeSculptureFrame("ouvindo", 0, { micLevel: 5 });
    expect(frame.glow).toBeLessThanOrEqual(1);
    for (const lobe of frame.lobes) expect(lobe.r).toBeGreaterThan(0);
  });
});

describe("falando — pulso afeta mais os lóbulos \"de baixo\"", () => {
  it("com pulso alto, os lóbulos de índice 2 e 3 crescem proporcionalmente mais que os 0 e 1", () => {
    const base = computeSculptureFrame("falando", 0, { speechPulse: 0 });
    const pulsed = computeSculptureFrame("falando", 0, { speechPulse: 1 });
    const growth = (i: number) => pulsed.lobes[i].r / base.lobes[i].r;
    expect(growth(2)).toBeGreaterThan(growth(0));
    expect(growth(3)).toBeGreaterThan(growth(1));
  });
});

describe("editando/concluindo — progresso do painel interpola de forma reversível", () => {
  it("progresso 0 fica na composição-base; progresso 1 fica na composição desdobrada", () => {
    const start = computeSculptureFrame("editando", 0, { panelProgress: 0 });
    const end = computeSculptureFrame("editando", 0, { panelProgress: 1 });
    expect(start.lobes[0].cx).toBeCloseTo(BASE_LOBES[0].cx, 5);
    expect(end.lobes[0].cx).not.toBeCloseTo(BASE_LOBES[0].cx, 1);
  });

  it("concluindo com o mesmo progresso produz exatamente o mesmo quadro que editando (é a mesma curva, direção controlada por quem chama)", () => {
    const editing = computeSculptureFrame("editando", 0, { panelProgress: 0.4 });
    const concluding = computeSculptureFrame("concluindo", 0, { panelProgress: 0.4 });
    expect(editing).toEqual(concluding);
  });

  it("progresso fora de 0..1 é preso ao intervalo", () => {
    const over = computeSculptureFrame("editando", 0, { panelProgress: 5 });
    const under = computeSculptureFrame("editando", 0, { panelProgress: -5 });
    const atOne = computeSculptureFrame("editando", 0, { panelProgress: 1 });
    const atZero = computeSculptureFrame("editando", 0, { panelProgress: 0 });
    expect(over).toEqual(atOne);
    expect(under).toEqual(atZero);
  });
});

describe("pensando — alterna entre duas composições em ciclo, sem saltos para fora da faixa", () => {
  it("em t=0 e em t=metade do ciclo (1.2s) está em pontas opostas da interpolação", () => {
    const start = computeSculptureFrame("pensando", 0);
    const mid = computeSculptureFrame("pensando", 1.2);
    expect(start.lobes[0].cx).not.toBeCloseTo(mid.lobes[0].cx, 1);
  });
});
