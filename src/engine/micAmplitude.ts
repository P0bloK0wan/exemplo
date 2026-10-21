/**
 * Kliko — captura da amplitude REAL do microfone (Fase 4 experimental).
 *
 * Usado só pelo estado "ouvindo" da escultura, e só quando a pessoa
 * aciona explicitamente (botão no Laboratório) — nunca pede
 * permissão de microfone sozinho ao montar um componente. É uma
 * captura SEPARADA de `SpeechRecognition` (que não expõe áudio bruto)
 * — por isso, ligar isto ao mesmo tempo que o reconhecimento de voz
 * da Mini Kliko pode gerar um SEGUNDO prompt de permissão no Safari;
 * documentado no README, ainda não confirmado em dispositivo físico.
 *
 * O áudio capturado NUNCA é conectado a `audioCtx.destination` — só é
 * lido pelo `AnalyserNode`, nunca reproduzido, evitando qualquer eco.
 */

export type MicAmplitudeStatus = "idle" | "requesting" | "active" | "error" | "stopped";

export interface MicAmplitudeEvents {
  onLevel?: (level: number) => void; // 0..1, RMS normalizado
  onStatusChange?: (status: MicAmplitudeStatus) => void;
}

export class MicAmplitudeSession {
  private events: MicAmplitudeEvents;
  private status: MicAmplitudeStatus = "idle";
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private rafId: number | null = null;

  constructor(events: MicAmplitudeEvents = {}) {
    this.events = events;
  }

  getStatus(): MicAmplitudeStatus {
    return this.status;
  }

  private setStatus(next: MicAmplitudeStatus): void {
    this.status = next;
    this.events.onStatusChange?.(next);
  }

  /**
   * Pede o microfone e começa a medir amplitude. Não faz nada se já
   * estiver ativo/pedindo — evita duas capturas simultâneas mesmo que
   * o botão seja clicado mais de uma vez rapidamente.
   */
  async start(): Promise<void> {
    if (this.status === "requesting" || this.status === "active") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.setStatus("error");
      return;
    }
    this.setStatus("requesting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AudioContextCtor = g.AudioContext ?? g.webkitAudioContext;
      if (!AudioContextCtor) throw new Error("AudioContext não disponível neste navegador.");
      this.audioCtx = new AudioContextCtor();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.source = this.audioCtx.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser); // nunca conectado a destination — só leitura, sem reprodução
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.setStatus("active");
      this.tick();
    } catch {
      this.setStatus("error");
      this.releaseResources();
    }
  }

  private tick = (): void => {
    if (this.status !== "active" || !this.analyser || !this.dataArray) return;
    this.analyser.getByteTimeDomainData(this.dataArray as Uint8Array<ArrayBuffer>);
    let sumSquares = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const centered = (this.dataArray[i] - 128) / 128; // -1..1
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / this.dataArray.length); // 0..~1
    this.events.onLevel?.(Math.min(1, rms * 3.2)); // ganho fixo: fala normal raramente satura o RMS bruto
    this.rafId = requestAnimationFrame(this.tick);
  };

  /** Libera TUDO — trilhas do microfone, AudioContext, o laço de leitura. Seguro chamar mesmo se nunca foi iniciado. */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.releaseResources();
    if (this.status !== "idle") this.setStatus("stopped");
  }

  private releaseResources(): void {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      void this.audioCtx.close();
    }
    this.source = null;
    this.analyser = null;
    this.stream = null;
    this.audioCtx = null;
    this.dataArray = null;
  }
}
