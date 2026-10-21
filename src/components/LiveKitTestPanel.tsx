import { useRef, useState } from "react";
import { kliko } from "../motion/tokens";
import { LiveVoiceSession, type LiveVoiceStatus } from "../engine/liveVoiceEngine";

const STATUS_LABEL: Record<LiveVoiceStatus, string> = {
  idle: "Desconectado",
  connecting: "Conectando…",
  connected: "Conectado",
  reconnecting: "Reconectando…",
  disconnected: "Desconectado",
  error: "Erro",
};

/**
 * Interface de testes isolada para a infraestrutura experimental de
 * voz em tempo real (LiveKit). Fica só no Laboratório, não na Mini
 * Kliko — a conversa por voz do dia a dia continua 100% pela Web
 * Speech API gratuita (`voiceEngine.ts`).
 *
 * URL e token são digitados aqui manualmente, nunca gerados por este
 * componente: para testar de verdade é preciso rodar um servidor
 * LiveKit próprio (ex.: `livekit-server --dev` local) e gerar um token
 * com as ferramentas oficiais deles. Nada é persistido nem enviado a
 * lugar nenhum além da própria chamada de conexão.
 */
export function LiveKitTestPanel() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<LiveVoiceStatus>("idle");
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<LiveVoiceSession | null>(null);

  function getSession() {
    if (!sessionRef.current) {
      sessionRef.current = new LiveVoiceSession({
        onStatusChange: (s, detail) => {
          setStatus(s);
          setError(s === "error" ? detail ?? "Erro desconhecido." : null);
        },
        onMicLevelError: (message) => setError(message),
      });
    }
    return sessionRef.current;
  }

  async function handleConnect() {
    setError(null);
    try {
      await getSession().connect({ url, token });
    } catch {
      // o estado de erro já foi definido via onStatusChange
    }
  }

  async function handleDisconnect() {
    await sessionRef.current?.disconnect();
    setMicOn(false);
  }

  async function toggleMic() {
    const next = !micOn;
    await getSession().setMicrophoneEnabled(next);
    setMicOn(next);
  }

  const connected = status === "connected" || status === "reconnecting";

  return (
    <div style={{ borderRadius: 20, background: kliko.surfaceStrong, boxShadow: "0 8px 24px rgba(0,0,0,0.06)", padding: 20, marginBottom: 22 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: kliko.text, marginBottom: 4 }}>
        Teste LiveKit (experimental)
      </h2>
      <p style={{ fontSize: 12.5, color: kliko.textMuted, marginBottom: 14, lineHeight: 1.4 }}>
        Infraestrutura inicial para uma futura conversa por voz em tempo real. Não substitui a voz gratuita da Mini
        Kliko. Exige um servidor LiveKit próprio (self-hosted ou LiveKit Cloud) e um token já gerado por você — nada
        aqui é inventado nem embutido.
      </p>

      <label style={fieldLabelStyle}>
        URL do servidor (ws:// ou wss://)
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="ws://localhost:7880"
          style={inputStyle}
          disabled={connected}
        />
      </label>
      <label style={fieldLabelStyle}>
        Token de acesso
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="gerado pelo seu backend/CLI do LiveKit"
          type="password"
          style={inputStyle}
          disabled={connected}
        />
      </label>

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        {!connected ? (
          <button onClick={handleConnect} style={primaryBtnStyle} disabled={status === "connecting"}>
            {status === "connecting" ? "Conectando…" : "Conectar"}
          </button>
        ) : (
          <button onClick={handleDisconnect} style={secondaryBtnStyle}>
            Desconectar
          </button>
        )}
        <button onClick={toggleMic} style={secondaryBtnStyle} disabled={!connected}>
          {micOn ? "Desligar microfone" : "Ligar microfone"}
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 12.5, color: kliko.textMuted }}>
        Status: <strong style={{ color: status === "error" ? kliko.danger : kliko.text }}>{STATUS_LABEL[status]}</strong>
      </div>
      {error && <p style={{ fontSize: 12, color: kliko.danger, marginTop: 6 }}>⚠ {error}</p>}

      <p style={{ fontSize: 11, color: kliko.textMuted, marginTop: 12, lineHeight: 1.4 }}>
        Preparação para interrupção de respostas: o módulo já expõe o ponto de extensão (`prepareInterruption`), mas
        sem um modelo de voz remoto conectado ainda não há áudio de IA para interromper de fato.
      </p>
    </div>
  );
}

const fieldLabelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 4,
  fontSize: 11.5,
  color: kliko.textMuted,
  marginBottom: 10,
};

const inputStyle = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.1)",
  fontSize: 13,
  background: "#fff",
};

const primaryBtnStyle = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 14,
  border: "none",
  background: kliko.blue,
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
} as const;

const secondaryBtnStyle = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.1)",
  background: "transparent",
  color: kliko.textMuted,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
} as const;
