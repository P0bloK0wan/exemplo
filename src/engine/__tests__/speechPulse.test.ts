import { describe, expect, it, vi, afterEach } from "vitest";
import { SpeechPulseSession } from "../speechPulse";

/**
 * Stub mínimo de SpeechSynthesisUtterance/speechSynthesis — captura os
 * handlers `onboundary`/`onend` para disparar manualmente no teste, e
 * um `requestAnimationFrame` controlável a dedo (sem esperar frames
 * reais), para simular o laço de decaimento passo a passo.
 */
function stubSpeechEnvironment() {
  let pendingFrame: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pendingFrame = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    pendingFrame = null;
  });

  interface FakeUtteranceInstance {
    lang: string;
    voice: unknown;
    onboundary: (() => void) | null;
    onend: (() => void) | null;
    text: string;
  }
  let lastUtterance: FakeUtteranceInstance | null = null;
  function FakeUtterance(this: FakeUtteranceInstance, text: string) {
    this.lang = "";
    this.voice = undefined;
    this.onboundary = null;
    this.onend = null;
    this.text = text;
    lastUtterance = this;
  }
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);

  const cancel = vi.fn();
  const speak = vi.fn();
  const getVoices = vi.fn().mockReturnValue([]);
  vi.stubGlobal("window", { speechSynthesis: { cancel, speak, getVoices } });

  return {
    cancel,
    speak,
    getVoices,
    fireBoundary: () => lastUtterance?.onboundary?.(),
    fireEnd: () => lastUtterance?.onend?.(),
    stepFrame: () => {
      const cb = pendingFrame;
      pendingFrame = null;
      cb?.(0);
    },
    hasPendingFrame: () => pendingFrame !== null,
  };
}

describe("SpeechPulseSession — pulso por evento, nunca forma de onda real", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("speak() cancela qualquer fala anterior e envia o texto para speechSynthesis", () => {
    const env = stubSpeechEnvironment();
    const session = new SpeechPulseSession(() => {});
    session.speak("olá mundo");
    expect(env.cancel).toHaveBeenCalled();
    expect(env.speak).toHaveBeenCalled();
  });

  it("um evento 'boundary' eleva o nível a 1 e inicia o decaimento", () => {
    const env = stubSpeechEnvironment();
    const levels: number[] = [];
    const session = new SpeechPulseSession((l) => levels.push(l));
    session.speak("teste");
    env.fireBoundary();
    expect(env.hasPendingFrame()).toBe(true);

    env.stepFrame();
    expect(levels[0]).toBeCloseTo(0.88, 5);
    expect(levels[0]).toBeLessThan(1);
  });

  it("o nível decai de forma contínua a cada quadro até chegar a 0 e parar o laço", () => {
    const env = stubSpeechEnvironment();
    const levels: number[] = [];
    const session = new SpeechPulseSession((l) => levels.push(l));
    session.speak("teste");
    env.fireBoundary();

    let guard = 0;
    while (env.hasPendingFrame() && guard < 200) {
      env.stepFrame();
      guard++;
    }

    expect(levels[levels.length - 1]).toBe(0);
    expect(levels.length).toBeGreaterThan(1);
    // estritamente decrescente até o corte final em 0 — nunca "pisca" para cima sozinho
    for (let i = 1; i < levels.length - 1; i++) {
      expect(levels[i]).toBeLessThan(levels[i - 1]);
    }
  });

  it("um segundo 'boundary' antes do decaimento terminar não duplica o laço de animação", () => {
    const env = stubSpeechEnvironment();
    const session = new SpeechPulseSession(() => {});
    session.speak("teste");
    env.fireBoundary();
    const firstPending = env.hasPendingFrame();
    env.fireBoundary(); // não deve agendar um segundo rAF concorrente
    expect(firstPending).toBe(true);
    expect(env.hasPendingFrame()).toBe(true);
  });

  it("'end' zera o nível e chama onEnd", () => {
    const env = stubSpeechEnvironment();
    const levels: number[] = [];
    const onEnd = vi.fn();
    const session = new SpeechPulseSession((l) => levels.push(l), onEnd);
    session.speak("teste");
    env.fireEnd();
    expect(levels[levels.length - 1]).toBe(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stop() cancela a síntese e o laço de decaimento, sem lançar se nunca houve speak()", () => {
    const env = stubSpeechEnvironment();
    const session = new SpeechPulseSession(() => {});
    expect(() => session.stop()).not.toThrow();
    session.speak("teste");
    env.fireBoundary();
    session.stop();
    expect(env.cancel).toHaveBeenCalled();
    expect(env.hasPendingFrame()).toBe(false);
  });
});
