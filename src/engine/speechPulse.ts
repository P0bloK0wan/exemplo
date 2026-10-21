/**
 * Kliko — pulso visual de fala a partir de eventos da Web Speech API
 * (Fase 4 experimental).
 *
 * IMPORTANTE, honestidade técnica: `speechSynthesis` do navegador NÃO
 * expõe a forma de onda do áudio sintetizado — não há como ler
 * amplitude real da voz do sistema. O único sinal disponível é o
 * evento `boundary` da `SpeechSynthesisUtterance`, disparado a cada
 * palavra (ou caractere, dependendo do mecanismo de voz). Este módulo
 * usa ESSE evento para acionar um pulso que decai suavemente — é
 * sincronizado ao RITMO da fala (uma palavra = um pulso), nunca à
 * amplitude/fonemas reais. Se um dia o áudio vier de um provedor
 * remoto (LiveKit), aí sim dá para ler a forma de onda de verdade.
 */

export class SpeechPulseSession {
  private onPulse: (level: number) => void;
  private onEnd?: () => void;
  private rafId: number | null = null;
  private level = 0;

  constructor(onPulse: (level: number) => void, onEnd?: () => void) {
    this.onPulse = onPulse;
    this.onEnd = onEnd;
  }

  speak(text: string, voiceURI?: string | null): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "pt-BR";
    if (voiceURI) {
      const match = synth.getVoices().find((v) => v.voiceURI === voiceURI);
      if (match) utter.voice = match;
    }
    utter.onboundary = () => {
      this.level = 1;
      this.ensureDecayLoop();
    };
    utter.onend = () => {
      this.level = 0;
      this.onPulse(0);
      this.onEnd?.();
    };
    synth.speak(utter);
  }

  private ensureDecayLoop(): void {
    if (this.rafId !== null) return; // já está decaindo — o próximo boundary só repõe o nível, não duplica o laço
    const step = () => {
      this.level *= 0.88; // decaimento exponencial — pulso curto e perceptível, não um sino longo
      this.onPulse(this.level);
      if (this.level > 0.01) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.level = 0;
        this.onPulse(0);
        this.rafId = null;
      }
    };
    this.rafId = requestAnimationFrame(step);
  }

  stop(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.level = 0;
  }
}
