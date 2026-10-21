/**
 * Kliko — infraestrutura experimental de voz em tempo real via LiveKit
 * (Fase 2, item 3). Usa o SDK oficial `livekit-client` (Apache 2.0).
 *
 * O QUE ISTO NÃO FAZ, DE PROPÓSITO:
 *  - Não embute nenhuma credencial, URL de servidor ou token no
 *    código. `connect()` exige que quem chama forneça `url` e `token`
 *    — normalmente colados manualmente na aba de testes do
 *    Laboratório, vindos de um servidor LiveKit próprio que você rode
 *    localmente para testar. Nada aqui gera um token "fingindo" uma
 *    conexão real.
 *  - Não substitui o reconhecimento/síntese de voz gratuitos
 *    (`voiceEngine.ts`) — eles continuam sendo o caminho principal da
 *    Mini Kliko. Isto é só a infraestrutura de conexão, isolada, para
 *    quando (e se) uma conversa em tempo real de verdade for aprovada.
 *  - Não contrata nenhum serviço pago. Conectar nesta sessão a um
 *    servidor LiveKit (self-hosted ou LiveKit Cloud) é escolha de quem
 *    testa, fora deste código.
 */
import { Room, RoomEvent, Track } from "livekit-client";

export type LiveVoiceStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface LiveVoiceConfig {
  /** URL do servidor LiveKit (ws:// ou wss://) — você fornece, nada fica salvo. */
  url: string;
  /** Token de acesso já gerado pelo SEU servidor/backend — nunca gerado aqui. */
  token: string;
}

export interface LiveVoiceEvents {
  onStatusChange?: (status: LiveVoiceStatus, detail?: string) => void;
  onMicLevelError?: (message: string) => void;
}

/**
 * Sessão de voz em tempo real — um wrapper fino e explícito sobre
 * `Room` do LiveKit, com os estados que a Fase 2 pediu: conexão,
 * desconexão, erro, controle de microfone, e um ponto preparado (mas
 * não implementado) para interromper a reprodução de uma resposta.
 */
export class LiveVoiceSession {
  private room: Room | null = null;
  private events: LiveVoiceEvents;
  status: LiveVoiceStatus = "idle";

  constructor(events: LiveVoiceEvents = {}) {
    this.events = events;
  }

  private setStatus(status: LiveVoiceStatus, detail?: string) {
    this.status = status;
    this.events.onStatusChange?.(status, detail);
  }

  isConfigured(config: Partial<LiveVoiceConfig>): config is LiveVoiceConfig {
    return Boolean(config.url && config.token);
  }

  async connect(config: Partial<LiveVoiceConfig>): Promise<void> {
    if (!this.isConfigured(config)) {
      this.setStatus("error", "Informe a URL do servidor e o token antes de conectar — nenhum dos dois é gerado automaticamente.");
      throw new Error("LiveVoiceSession.connect: url/token ausentes.");
    }

    this.setStatus("connecting");
    const room = new Room({ adaptiveStream: true, dynacast: true });

    room.on(RoomEvent.Disconnected, (reason) => {
      this.setStatus("disconnected", reason ? String(reason) : undefined);
    });
    room.on(RoomEvent.Reconnecting, () => this.setStatus("reconnecting"));
    room.on(RoomEvent.Reconnected, () => this.setStatus("connected"));
    room.on(RoomEvent.MediaDevicesError, (err) => {
      this.events.onMicLevelError?.(err instanceof Error ? err.message : String(err));
    });

    try {
      await room.connect(config.url, config.token);
      this.room = room;
      this.setStatus("connected");
    } catch (err) {
      this.setStatus("error", err instanceof Error ? err.message : "Falha ao conectar ao servidor LiveKit.");
      throw err;
    }
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.room) {
      this.setStatus("error", "Conecte antes de controlar o microfone.");
      return;
    }
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
    } catch (err) {
      this.events.onMicLevelError?.(err instanceof Error ? err.message : "Não foi possível acessar o microfone.");
    }
  }

  /**
   * Preparação para interrupção de respostas (pedida explicitamente):
   * ponto único onde, quando houver um modelo de voz do outro lado,
   * a reprodução do áudio remoto seria pausada/cancelada ao detectar
   * nova fala do usuário. Hoje não há áudio remoto de IA para
   * interromper — por isso isto só documenta e expõe o estado,
   * sem lógica de barge-in real ainda.
   */
  prepareInterruption(): { ready: boolean; reason: string } {
    return {
      ready: false,
      reason: "Sem um modelo de voz remoto conectado ainda, não há reprodução para interromper — este método existe como ponto de extensão já com a assinatura certa.",
    };
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    this.setStatus("disconnected");
  }
}

export { Track };
