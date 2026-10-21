import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { kliko, springs } from "../motion/tokens";
import { SmartSlider } from "./SmartSlider";
import { VoicePicker } from "./VoicePicker";
import { ProcessingLottie } from "./ProcessingLottie";
import { mergeEditState, type EditState } from "../engine/photoEngine";
import type { PhotoAnalysis } from "../engine/photoAnalysis";
import { suggestExposureFix, suggestSkyBoost, suggestHighlightRecovery } from "../engine/ruleSuggestions";
import { speak, stopSpeaking } from "../engine/voiceEngine";
import { PresetPicker } from "./PresetPicker";
import { buildAnalogApplication, resolveAdjustmentsForPreset, resolveEffectsForPreset, getAnalogPreset } from "../engine/analogPresets";

type KlikoState = "idle" | "listening" | "analisando" | "panel";
type PanelTab = "ajustes" | "analogico";

interface MiniKlikoProps {
  editState: EditState;
  /** null enquanto a análise da foto ainda não terminou (ou falhou) */
  analysis: PhotoAnalysis | null;
  /** imagem original — usada só para gerar as miniaturas reais dos presets analógicos */
  image: ImageBitmap | null;
  onProposeDraft: (next: EditState) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onReset: () => void;
  /** se false, a Mini Kliko ainda aparece mas sem controles de foto (ex: na Galeria) */
  hasPhoto: boolean;
}

/**
 * A peça central do Kliko: a nuvem azul flutuante que se TRANSFORMA em
 * painel de edição, sem nunca sumir e reaparecer como outro elemento.
 *
 * Fase 2: o painel agora carrega sugestões baseadas em REGRAS
 * determinísticas sobre o histograma real da foto (ruleSuggestions.ts)
 * — não é análise multimodal por IA (ver docs/fase2-inteligencia-
 * fotografica.md). Um breve estado "analisando" com uma animação
 * Lottie dá tempo de a pessoa perceber que algo real foi calculado,
 * em vez de o resultado aparecer instantâneo e sem contexto.
 */
export function MiniKliko({ editState, analysis, image, onProposeDraft, onConfirm, onCancel, onReset, hasPhoto }: MiniKlikoProps) {
  const [state, setState] = useState<KlikoState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSimulated, setIsSimulated] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [caveat, setCaveat] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("ajustes");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Espelha `transcript` de forma sincrona. `onresult`/`onend` sao
  // callbacks do SpeechRecognition, nao re-renders do React: se eles
  // lessem o `transcript` do state (via closure), pegariam o valor de
  // quando foram CRIADOS, nao o mais recente. O ref resolve isso por
  // ser mutavel e lido com o valor atual, nunca uma copia antiga.
  const transcriptRef = useRef("");
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const pendingDraftRef = useRef<EditState | null>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function startListening() {
    if (!hasPhoto) return;
    stopSpeaking(); // nao deixa a Kliko falando por cima de um novo pedido
    // Evita duas instancias de reconhecimento rodando ao mesmo tempo
    // se o usuario tocar o orb de novo enquanto ja esta ouvindo.
    if (state === "listening") {
      recognitionRef.current?.stop?.();
      return;
    }

    setSummary(null);
    setCaveat(null);
    setTranscript("");
    transcriptRef.current = "";
    setState("listening");

    if (speechSupported) {
      setIsSimulated(false);
      const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
      const recog = new SR();
      recog.lang = "pt-BR";
      recog.interimResults = true;
      recog.onresult = (ev: SpeechRecognitionEventLike) => {
        const text = Array.from(ev.results).map((r) => r[0].transcript).join(" ");
        transcriptRef.current = text;
        setTranscript(text);
      };
      recog.onerror = () => {
        // Se o erro chegar, o onend pode disparar logo em seguida (varia
        // por navegador) — desarmamos para nao interpretar duas vezes.
        recog.onend = null;
        fallbackToSimulated();
      };
      recog.onend = () => {
        // Le sempre o valor mais atual, nunca uma copia antiga.
        if (transcriptRef.current) applyVoiceCommand(transcriptRef.current);
      };
      recognitionRef.current = recog;
      try {
        recog.start();
      } catch {
        fallbackToSimulated();
      }
    } else {
      fallbackToSimulated();
    }
  }

  function fallbackToSimulated() {
    setIsSimulated(true);
    // Demonstracao simulada e explicita: nao finge reconhecimento real.
    const demoPhrase = "melhore a iluminação dessa foto";
    let i = 0;
    const timer = setInterval(() => {
      i++;
      const partial = demoPhrase.split(" ").slice(0, i).join(" ");
      transcriptRef.current = partial;
      setTranscript(partial);
      if (i >= demoPhrase.split(" ").length) {
        clearInterval(timer);
        setTimeout(() => applyVoiceCommand(demoPhrase), 200);
      }
    }, 140);
  }

  /**
   * Fluxo: reconhece -> "analisando" (breve, Lottie) -> sugestão por
   * regras a partir do histograma real -> prévia na foto -> fala a
   * explicação -> pede confirmação. Nunca chama isso de "a IA viu sua
   * foto" — a explicação falada é sempre honesta sobre ser regra fixa.
   */
  function applyVoiceCommand(text: string) {
    setState("analisando");

    // Pequena pausa deliberada (não é um atraso de rede simulado — a
    // análise real já rodou quando a foto foi carregada; isso só dá
    // tempo perceptível de a pessoa acompanhar que algo foi calculado,
    // em vez do resultado trocar instantâneo e sem contexto).
    setTimeout(() => resolveVoiceCommand(text), 420);
  }

  function resolveVoiceCommand(text: string) {
    const lower = text.toLowerCase();

    if (!analysis) {
      setState("idle");
      speak("Ainda não terminei de analisar essa foto, pode repetir em um instante?", voiceURI);
      return;
    }

    let explanation: string;
    let caveatText: string | undefined;
    let patch: Partial<EditState> = {};

    if (lower.includes("céu") || lower.includes("ceu")) {
      const s = suggestSkyBoost(analysis);
      explanation = s.explanation;
      caveatText = s.caveat;
      patch = s.patch;
    } else if (lower.includes("recupere") || lower.includes("detalhe")) {
      const s = suggestHighlightRecovery(analysis);
      explanation = s.explanation;
      caveatText = s.caveat;
      patch = s.patch;
    } else if (lower.includes("ilumin") || lower.includes("clar") || lower.includes("expos") || lower.includes("escur")) {
      const s = suggestExposureFix(analysis);
      explanation = s.explanation;
      caveatText = s.caveat;
      patch = s.patch;
    } else if (lower.includes("contraste")) {
      patch = { contraste: Math.min(100, editState.contraste + 20) };
      explanation = "Aumentei o contraste em um incremento fixo. Quer confirmar, ajustar ou cancelar?";
    } else if (lower.includes("satura") || lower.includes("cor")) {
      patch = { saturacao: Math.min(100, editState.saturacao + 20) };
      explanation = "Aumentei a saturação em um incremento fixo. Quer confirmar, ajustar ou cancelar?";
    } else if (lower.includes("quente")) {
      patch = { temperatura: Math.min(100, editState.temperatura + 25) };
      explanation = "Esquentei a temperatura da foto em um incremento fixo. Quer confirmar, ajustar ou cancelar?";
    } else if (lower.includes("fri")) {
      patch = { temperatura: Math.max(-100, editState.temperatura - 25) };
      explanation = "Esfriei a temperatura da foto em um incremento fixo. Quer confirmar, ajustar ou cancelar?";
    } else if (lower.includes("filme") || lower.includes("analógic") || lower.includes("analogic") || lower.includes("antig") || lower.includes("retr")) {
      // Comando de preset analógico: interpretado por palavras-chave fixas
      // mapeadas a um preset do catálogo — regra fixa, não compreensão
      // semântica da foto. "contém a palavra X" -> preset Y, sempre o
      // mesmo resultado para o mesmo pedido.
      const presetId = lower.includes("preto e branco") || lower.includes("p&b") || lower.includes("p e b") || lower.includes("mono")
        ? "mono-suave"
        : lower.includes("frio") || lower.includes("fria")
          ? "contraste-frio"
          : lower.includes("quente") || lower.includes("retr")
            ? "retro-quente"
            : "classico";
      const app = buildAnalogApplication(presetId, 100);
      patch = { ...app.adjustments, analog: app.analog };
      explanation = `Aplicando o preset "${getAnalogPreset(presetId)?.label}" — uma combinação fixa de ajustes e textura de filme, não uma leitura semântica da foto. Quer confirmar, ajustar a intensidade ou cancelar?`;
    } else if (lower.includes("colagem") || lower.includes("colage")) {
      setState("idle");
      speak("Para montar uma colagem, abra o Estúdio de Colagem na tela inicial — a partir de lá eu já consigo acompanhar o pedido por voz.", voiceURI);
      return;
    } else {
      setState("idle");
      speak("Desculpa, não entendi o pedido. Pode repetir?", voiceURI);
      return;
    }

    const hasRealChange = Object.keys(patch).length > 0;
    if (!hasRealChange) {
      // A regra concluiu que não há nada a fazer (ex.: exposição já
      // equilibrada, céu não identificado) — informa e volta a ouvir,
      // sem abrir um painel de confirmação vazio.
      setState("idle");
      speak([explanation, caveatText].filter(Boolean).join(" "), voiceURI);
      return;
    }

    const next = mergeEditState(editState, patch);
    pendingDraftRef.current = next;
    onProposeDraft(next);
    setSummary(explanation);
    setCaveat(caveatText ?? null);
    setPanelTab(patch.analog ? "analogico" : "ajustes");
    setState("panel");
    speak(explanation, voiceURI);
  }

  function handleCancel() {
    stopSpeaking();
    onCancel();
    setSummary(null);
    setCaveat(null);
    setState("idle");
  }

  function handleConfirm() {
    stopSpeaking();
    onConfirm();
    setState("idle");
    setSummary(null);
    setCaveat(null);
  }

  function updateSlider(field: "exposicao" | "contraste" | "saturacao" | "temperatura", value: number) {
    onProposeDraft(mergeEditState(editState, { [field]: value }));
    if (state !== "panel") setState("panel");
  }

  function handleSelectPreset(presetId: string | null) {
    if (presetId === null) {
      // "Original" — desliga a camada analógica sem tocar nos 4 sliders manuais.
      onProposeDraft(mergeEditState(editState, { analog: { presetId: null, intensity: 100, grain: 0, vignette: 0, fade: 0 } }));
      return;
    }
    const app = buildAnalogApplication(presetId, editState.analog.presetId === presetId ? editState.analog.intensity : 100);
    onProposeDraft(mergeEditState(editState, { ...app.adjustments, analog: app.analog }));
    if (state !== "panel") setState("panel");
  }

  function handleIntensityChange(intensity: number) {
    const presetId = editState.analog.presetId;
    if (!presetId) return;
    const preset = getAnalogPreset(presetId);
    if (!preset) return;
    onProposeDraft(
      mergeEditState(editState, {
        ...resolveAdjustmentsForPreset(preset, intensity),
        analog: { presetId, intensity, ...resolveEffectsForPreset(preset, intensity) },
      }),
    );
  }

  function toggleSkyMask() {
    const nextAtivo = !editState.sky.ativo;
    onProposeDraft(
      mergeEditState(editState, {
        sky: { ativo: nextAtivo, saturacao: nextAtivo ? 30 : 0, exposicao: 0 },
      }),
    );
    if (nextAtivo) {
      setCaveat(
        "Máscara de céu experimental: heurística de posição e cor, sem garantia de identificar qualquer céu nem de preservar rostos.",
      );
    }
  }

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  const collapsed = state === "idle" || state === "listening" || state === "analisando";
  const skyConfident = (analysis?.skyMask.confidence ?? 0) >= 0.08;

  return (
    <div style={{ position: "fixed", right: 20, bottom: 28, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <AnimatePresence>
        {state === "panel" && (
          <motion.div
            key="kliko-panel"
            layoutId="kliko-shell"
            layout
            transition={springs.gentle}
            style={{
              width: "min(86vw, 340px)",
              marginBottom: 14,
              borderRadius: 26,
              background: kliko.surfaceStrong,
              backdropFilter: "blur(22px) saturate(1.4)",
              WebkitBackdropFilter: "blur(22px) saturate(1.4)",
              boxShadow: `0 18px 40px ${kliko.blueGlow}, 0 2px 8px rgba(0,0,0,0.08)`,
              border: "1px solid rgba(255,255,255,0.6)",
              padding: "20px 20px 16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: kliko.text }}>Mini Kliko</span>
              <button aria-label="Fechar" onClick={() => { stopSpeaking(); setState("idle"); }} style={closeBtnStyle}>×</button>
            </div>

            <VoicePicker selectedURI={voiceURI} onSelect={setVoiceURI} />

            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <button onClick={() => setPanelTab("ajustes")} style={tabBtnStyle(panelTab === "ajustes")}>
                Ajustes
              </button>
              <button onClick={() => setPanelTab("analogico")} style={tabBtnStyle(panelTab === "analogico")}>
                Analógico
              </button>
            </div>

            {summary && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{ fontSize: 13, color: kliko.textMuted, marginBottom: caveat ? 6 : 14, lineHeight: 1.4 }}
              >
                {summary}
              </motion.p>
            )}
            {caveat && (
              <p style={{ fontSize: 11.5, color: kliko.danger, marginBottom: 14, lineHeight: 1.4 }}>⚠ {caveat}</p>
            )}

            {panelTab === "ajustes" && (
              <>
                <SmartSlider label="Exposição" value={editState.exposicao} onChange={(v) => updateSlider("exposicao", v)} />
                <SmartSlider label="Contraste" value={editState.contraste} onChange={(v) => updateSlider("contraste", v)} />
                <SmartSlider label="Saturação" value={editState.saturacao} onChange={(v) => updateSlider("saturacao", v)} />
                <SmartSlider label="Temperatura" value={editState.temperatura} onChange={(v) => updateSlider("temperatura", v)} />

                <div style={{ marginTop: 10, marginBottom: 4 }}>
                  <button onClick={toggleSkyMask} style={skyToggleStyle(editState.sky.ativo)} disabled={!skyConfident && !editState.sky.ativo}>
                    {editState.sky.ativo ? "Desativar máscara de céu" : "Testar máscara de céu (experimental)"}
                  </button>
                  {!skyConfident && !editState.sky.ativo && (
                    <p style={{ fontSize: 10.5, color: kliko.textMuted, marginTop: 4 }}>
                      Não identifiquei uma região de céu com confiança nesta foto.
                    </p>
                  )}
                  {editState.sky.ativo && (
                    <SmartSlider
                      label="Saturação do céu"
                      value={editState.sky.saturacao}
                      min={0}
                      max={100}
                      onChange={(v) => onProposeDraft(mergeEditState(editState, { sky: { ...editState.sky, saturacao: v } }))}
                    />
                  )}
                </div>
              </>
            )}

            {panelTab === "analogico" && (
              <>
                <p style={{ fontSize: 11.5, color: kliko.textMuted, marginBottom: 8 }}>
                  Prévia real sobre a sua foto — granulação, vinheta e desbotamento são calculados pixel a pixel e aparecem também na exportação.
                </p>
                <PresetPicker image={image} activePresetId={editState.analog.presetId} onSelect={handleSelectPreset} />
                {editState.analog.presetId && (
                  <SmartSlider
                    label="Intensidade do preset"
                    value={editState.analog.intensity}
                    min={0}
                    max={100}
                    onChange={handleIntensityChange}
                  />
                )}
              </>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={handleCancel} style={secondaryBtnStyle}>
                Cancelar
              </button>
              <button onClick={handleConfirm} style={primaryBtnStyle}>
                Confirmar
              </button>
            </div>

            <button
              onClick={() => {
                onReset();
                setSummary(null);
                setCaveat(null);
              }}
              style={resetLinkStyle}
            >
              Redefinir todos os ajustes
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {collapsed && (
        <motion.button
          key="kliko-orb"
          layoutId="kliko-shell"
          layout
          transition={springs.gentle}
          onClick={() => (hasPhoto ? startListening() : undefined)}
          drag
          dragMomentum={false}
          dragElastic={0.12}
          whileTap={{ scale: 0.92 }}
          aria-label="Falar com a Mini Kliko"
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            border: "none",
            cursor: hasPhoto ? "pointer" : "default",
            background: `radial-gradient(circle at 32% 28%, #ffffff 0%, ${kliko.blueSoft} 55%, ${kliko.blue} 130%)`,
            boxShadow: `0 10px 28px ${kliko.blueGlow}, inset 0 0 14px rgba(255,255,255,0.8)`,
            position: "relative",
          }}
        >
          {state === "analisando" ? (
            <ProcessingLottie size={64} />
          ) : (
            <motion.span
              animate={
                state === "listening"
                  ? { scale: [1, 1.18, 1], opacity: [0.9, 1, 0.9] }
                  : { scale: [1, 1.05, 1] }
              }
              transition={{ duration: state === "listening" ? 0.9 : 2.6, repeat: Infinity, ease: "easeInOut" }}
              style={{
                position: "absolute",
                inset: 6,
                borderRadius: 999,
                background: "rgba(255,255,255,0.35)",
              }}
            />
          )}
        </motion.button>
      )}

      <AnimatePresence>
        {(state === "listening" || state === "analisando") && (
          <motion.div
            key="listening-label"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            style={{
              marginTop: 10,
              background: kliko.surfaceStrong,
              borderRadius: 14,
              padding: "8px 14px",
              fontSize: 13,
              color: kliko.text,
              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              maxWidth: 240,
              textAlign: "right",
            }}
          >
            <div style={{ color: kliko.blue, fontWeight: 600, marginBottom: 2 }}>
              {state === "analisando"
                ? "Kliko está analisando o histograma…"
                : `Kliko está ouvindo${isSimulated ? " · demonstração simulada" : ""}`}
            </div>
            {state === "listening" && <div style={{ color: kliko.textMuted, minHeight: 16 }}>{transcript || "…"}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const closeBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "none",
  background: "rgba(0,0,0,0.06)",
  color: kliko.text,
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
};

const primaryBtnStyle: CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 14,
  border: "none",
  background: kliko.blue,
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const secondaryBtnStyle: CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.1)",
  background: "transparent",
  color: kliko.textMuted,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const resetLinkStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  marginTop: 10,
  padding: "4px 0",
  border: "none",
  background: "none",
  color: kliko.textMuted,
  fontSize: 11.5,
  textDecoration: "underline",
  cursor: "pointer",
};

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "7px 0",
    borderRadius: 10,
    border: "none",
    background: active ? kliko.blue : "rgba(0,0,0,0.05)",
    color: active ? "#fff" : kliko.textMuted,
    fontWeight: 600,
    fontSize: 12.5,
    cursor: "pointer",
  };
}

function skyToggleStyle(active: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "8px 0",
    borderRadius: 12,
    border: `1px solid ${active ? kliko.blue : "rgba(0,0,0,0.1)"}`,
    background: active ? kliko.blueSoft : "transparent",
    color: active ? kliko.blue : kliko.textMuted,
    fontWeight: 600,
    fontSize: 12.5,
    cursor: "pointer",
  };
}

/** Tipos minimos para a Web Speech API (nao padronizada no TS DOM lib). */
interface SpeechRecognitionEventLike {
  results: { [i: number]: { [j: number]: { transcript: string } }; length: number };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop?: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
