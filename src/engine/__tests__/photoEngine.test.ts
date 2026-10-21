import { describe, expect, it, vi, afterEach } from "vitest";
import { loadImageBitmapFromFile, KlikoImageLoadError, mergeEditState, DEFAULT_EDIT_STATE, buildFilterString } from "../photoEngine";

describe("loadImageBitmapFromFile — tratamento de erros de carregamento", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejeita um arquivo vazio sem tentar decodificar", async () => {
    const fakeEmptyFile = { size: 0 } as unknown as File;
    await expect(loadImageBitmapFromFile(fakeEmptyFile)).rejects.toBeInstanceOf(KlikoImageLoadError);
  });

  it("envolve uma falha do decodificador do navegador numa mensagem em PT-BR, sem vazar o erro de baixo nível", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new DOMException("formato não suportado")),
    );
    const fakeFile = { size: 1234 } as unknown as File;
    await expect(loadImageBitmapFromFile(fakeFile)).rejects.toThrow(KlikoImageLoadError);
    await expect(loadImageBitmapFromFile(fakeFile)).rejects.toThrow(/não consegui abrir/i);
  });

  it("resolve normalmente quando o navegador decodifica com sucesso", async () => {
    const fakeBitmap = { width: 10, height: 10 } as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(fakeBitmap));
    const fakeFile = { size: 1234 } as unknown as File;
    const result = await loadImageBitmapFromFile(fakeFile);
    expect(result).toBe(fakeBitmap);
  });
});

describe("mergeEditState — preserva o que não foi tocado pelo patch", () => {
  it("mescla um campo global sem afetar os demais nem a camada de céu/analógica", () => {
    const next = mergeEditState(DEFAULT_EDIT_STATE, { exposicao: 30 });
    expect(next.exposicao).toBe(30);
    expect(next.contraste).toBe(0);
    expect(next.sky).toEqual(DEFAULT_EDIT_STATE.sky);
    expect(next.analog).toEqual(DEFAULT_EDIT_STATE.analog);
  });

  it("mescla parcialmente a camada analógica sem perder os campos não citados", () => {
    const withPreset = mergeEditState(DEFAULT_EDIT_STATE, {
      analog: { presetId: "classico", intensity: 100, grain: 22, vignette: 18, fade: 10 },
    });
    const next = mergeEditState(withPreset, { analog: { ...withPreset.analog, intensity: 50 } });
    expect(next.analog.presetId).toBe("classico");
    expect(next.analog.intensity).toBe(50);
    expect(next.analog.grain).toBe(22);
  });

  it("mescla parcialmente a camada de céu sem perder os campos não citados", () => {
    const withSky = mergeEditState(DEFAULT_EDIT_STATE, { sky: { ativo: true, saturacao: 40, exposicao: 0 } });
    const next = mergeEditState(withSky, { sky: { ...withSky.sky, saturacao: 60 } as typeof withSky.sky } );
    expect(next.sky.ativo).toBe(true);
    expect(next.sky.saturacao).toBe(60);
  });

  it("nunca modifica o estado base recebido (imutabilidade)", () => {
    const base = { ...DEFAULT_EDIT_STATE };
    mergeEditState(base, { exposicao: 99 });
    expect(base.exposicao).toBe(0);
  });
});

describe("buildFilterString", () => {
  it("ajustes neutros (todos 0) produzem um filtro CSS neutro", () => {
    const css = buildFilterString(DEFAULT_EDIT_STATE);
    expect(css).toContain("brightness(1.000)");
    expect(css).toContain("contrast(1.000)");
    expect(css).toContain("saturate(1.000)");
  });

  it("nunca produz saturate negativo mesmo no extremo -100", () => {
    const css = buildFilterString({ ...DEFAULT_EDIT_STATE, saturacao: -100 });
    expect(css).not.toContain("saturate(-");
  });
});
