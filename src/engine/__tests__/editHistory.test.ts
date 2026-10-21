import { describe, expect, it } from "vitest";
import { createHistory, setDraft, cancelDraft, confirmDraft, undo, redo, canUndo, canRedo, resetHistory } from "../editHistory";

describe("editHistory — histórico não destrutivo genérico", () => {
  it("começa sem desfazer/refazer disponíveis", () => {
    const h = createHistory({ v: 0 });
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toEqual({ v: 0 });
  });

  it("uma prévia (draft) não altera o estado confirmado", () => {
    const h = createHistory({ v: 0 });
    const withDraft = setDraft(h, { v: 42 });
    expect(withDraft.present).toEqual({ v: 0 });
    expect(withDraft.draft).toEqual({ v: 42 });
  });

  it("cancelar restaura EXATAMENTE o estado anterior, descartando só o draft", () => {
    const h = createHistory({ v: 1 });
    const withDraft = setDraft(h, { v: 99 });
    const cancelled = cancelDraft(withDraft);
    expect(cancelled.present).toEqual({ v: 1 });
    expect(cancelled.draft).toBeNull();
  });

  it("confirmar move o draft para present e empilha o present anterior em past", () => {
    const h = createHistory({ v: 1 });
    const confirmed = confirmDraft(setDraft(h, { v: 2 }));
    expect(confirmed.present).toEqual({ v: 2 });
    expect(confirmed.past).toEqual([{ v: 1 }]);
    expect(confirmed.draft).toBeNull();
    expect(canUndo(confirmed)).toBe(true);
  });

  it("confirmar sem draft não faz nada", () => {
    const h = createHistory({ v: 1 });
    expect(confirmDraft(h)).toEqual(h);
  });

  it("desfazer e refazer alternam corretamente entre dois estados confirmados", () => {
    let h = createHistory({ v: 1 });
    h = confirmDraft(setDraft(h, { v: 2 }));
    h = confirmDraft(setDraft(h, { v: 3 }));
    expect(h.present).toEqual({ v: 3 });

    h = undo(h);
    expect(h.present).toEqual({ v: 2 });
    expect(canRedo(h)).toBe(true);

    h = undo(h);
    expect(h.present).toEqual({ v: 1 });
    expect(canUndo(h)).toBe(false);

    h = redo(h);
    expect(h.present).toEqual({ v: 2 });

    h = redo(h);
    expect(h.present).toEqual({ v: 3 });
    expect(canRedo(h)).toBe(false);
  });

  it("uma nova edição confirmada depois de um desfazer limpa a pilha de refazer (ramo antigo é descartado)", () => {
    let h = createHistory({ v: 1 });
    h = confirmDraft(setDraft(h, { v: 2 }));
    h = confirmDraft(setDraft(h, { v: 3 }));
    h = undo(h); // volta para v:2, v:3 vai para future
    expect(canRedo(h)).toBe(true);

    h = confirmDraft(setDraft(h, { v: 99 })); // novo ramo a partir de v:2
    expect(h.present).toEqual({ v: 99 });
    expect(canRedo(h)).toBe(false);
  });

  it("desfazer sem histórico não quebra (retorna o mesmo estado)", () => {
    const h = createHistory({ v: 1 });
    expect(undo(h)).toEqual(h);
  });

  it("refazer sem futuro não quebra (retorna o mesmo estado)", () => {
    const h = createHistory({ v: 1 });
    expect(redo(h)).toEqual(h);
  });

  it("resetHistory volta ao estado inicial dado e limpa past/future/draft", () => {
    let h = createHistory({ v: 1 });
    h = confirmDraft(setDraft(h, { v: 2 }));
    h = setDraft(h, { v: 50 });
    const reset = resetHistory(h, { v: 0 });
    expect(reset).toEqual({ past: [], present: { v: 0 }, future: [], draft: null });
  });
});
