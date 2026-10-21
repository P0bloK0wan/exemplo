import { describe, expect, it, vi, afterEach } from "vitest";
import { MicAmplitudeSession } from "../micAmplitude";

function makeFakeTrack() {
  return { stop: vi.fn() };
}

function makeFakeStream(trackCount = 1) {
  const tracks = Array.from({ length: trackCount }, makeFakeTrack);
  return { getTracks: () => tracks, __tracks: tracks } as unknown as MediaStream & { __tracks: ReturnType<typeof makeFakeTrack>[] };
}

function stubAudioEnvironment() {
  const closeMock = vi.fn().mockResolvedValue(undefined);
  const disconnectMocks: ReturnType<typeof vi.fn>[] = [];
  const fakeAnalyser = {
    fftSize: 0,
    frequencyBinCount: 32,
    getByteTimeDomainData: vi.fn((arr: Uint8Array) => arr.fill(128)), // silêncio puro: todos os bytes em 128
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  disconnectMocks.push(fakeAnalyser.disconnect);
  const fakeSource = { connect: vi.fn(), disconnect: vi.fn() };
  disconnectMocks.push(fakeSource.disconnect);

  class FakeAudioContext {
    state = "running";
    createAnalyser() {
      return fakeAnalyser;
    }
    createMediaStreamSource() {
      return fakeSource;
    }
    close = closeMock;
  }

  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());

  return { closeMock, fakeAnalyser, fakeSource };
}

describe("MicAmplitudeSession — captura real, com consentimento explícito e limpeza completa", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("entra em erro sem lançar quando getUserMedia não existe (navegador sem suporte)", async () => {
    vi.stubGlobal("navigator", {});
    const onStatusChange = vi.fn();
    const session = new MicAmplitudeSession({ onStatusChange });
    await session.start();
    expect(onStatusChange).toHaveBeenCalledWith("error");
  });

  it("pede o microfone exatamente uma vez mesmo com start() chamado em paralelo (nunca duas capturas simultâneas)", async () => {
    const fakeStream = makeFakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    stubAudioEnvironment();

    const session = new MicAmplitudeSession();
    await Promise.all([session.start(), session.start(), session.start()]);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toBe("active");
  });

  it("start() bem-sucedido chama onStatusChange com 'requesting' e depois 'active'", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(makeFakeStream());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    stubAudioEnvironment();

    const statuses: string[] = [];
    const session = new MicAmplitudeSession({ onStatusChange: (s) => statuses.push(s) });
    await session.start();

    expect(statuses).toEqual(["requesting", "active"]);
  });

  it("quando getUserMedia rejeita (permissão negada), entra em erro sem lançar e não deixa recursos presos", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException("Permission denied"));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    stubAudioEnvironment();

    const session = new MicAmplitudeSession();
    await expect(session.start()).resolves.toBeUndefined();
    expect(session.getStatus()).toBe("error");
  });

  it("stop() libera TODAS as trilhas do stream e fecha o AudioContext", async () => {
    const fakeStream = makeFakeStream(2);
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const { closeMock } = stubAudioEnvironment();

    const session = new MicAmplitudeSession();
    await session.start();
    session.stop();

    for (const track of fakeStream.__tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1);
    }
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toBe("stopped");
  });

  it("stop() é seguro mesmo se chamado antes de qualquer start() (nunca lança)", () => {
    const session = new MicAmplitudeSession();
    expect(() => session.stop()).not.toThrow();
  });

  it("nunca conecta o source diretamente ao destino de áudio (sem eco/retorno do próprio microfone)", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(makeFakeStream());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const { fakeSource, fakeAnalyser } = stubAudioEnvironment();

    const session = new MicAmplitudeSession();
    await session.start();

    expect(fakeSource.connect).toHaveBeenCalledWith(fakeAnalyser);
    expect(fakeSource.connect).toHaveBeenCalledTimes(1); // nunca chamado uma segunda vez para o destination
  });

  it("silêncio puro (bytes todos em 128) produz nível próximo de 0", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(makeFakeStream());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    stubAudioEnvironment();

    const levels: number[] = [];
    const session = new MicAmplitudeSession({ onLevel: (l) => levels.push(l) });
    await session.start();

    expect(levels[0]).toBeCloseTo(0, 5);
  });
});
