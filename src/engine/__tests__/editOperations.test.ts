import { describe, expect, it } from "vitest";
import { EDIT_OPERATIONS, getOperation, validateParams, defaultParamsFor } from "../editOperations";

describe("editOperations — catálogo com parâmetros validados", () => {
  it("todas as operações registradas têm ao menos um parâmetro com range válido", () => {
    for (const op of EDIT_OPERATIONS) {
      expect(op.params.length).toBeGreaterThan(0);
      for (const p of op.params) {
        expect(p.range[0]).toBeLessThanOrEqual(p.range[1]);
        expect(p.default).toBeGreaterThanOrEqual(p.range[0]);
        expect(p.default).toBeLessThanOrEqual(p.range[1]);
      }
    }
  });

  it("getOperation lança para um id desconhecido", () => {
    expect(() => getOperation("inexistente")).toThrow();
  });

  it("validateParams corta (clamp) um valor fora do intervalo, em vez de rejeitar", () => {
    const op = getOperation("exposure");
    const result = validateParams(op, { amount: 9999 });
    expect(result.amount).toBe(100);
    const resultNeg = validateParams(op, { amount: -9999 });
    expect(resultNeg.amount).toBe(-100);
  });

  it("validateParams usa o default quando o valor não é um número finito", () => {
    const op = getOperation("exposure");
    const result = validateParams(op, { amount: Number.NaN });
    expect(result.amount).toBe(0);
  });

  it("validateParams lança para um parâmetro fora do schema da operação", () => {
    const op = getOperation("exposure");
    expect(() => validateParams(op, { amount: 10, inventado: 5 })).toThrow();
  });

  it("defaultParamsFor devolve os valores default de cada parâmetro", () => {
    const op = getOperation("sky_saturation");
    expect(defaultParamsFor(op)).toEqual({ amount: 0 });
  });
});
