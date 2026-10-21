/**
 * Kliko — motor de voz (protótipo gratuito).
 *
 * Usa a Web Speech Synthesis API nativa do navegador (`speechSynthesis`),
 * que no Safari/iOS já roda sobre as vozes do sistema (inclui vozes em
 * pt-BR, ex. "Luciana"). Zero custo, zero API externa — é o que torna
 * a resposta falada da Mini Kliko possível no protótipo de hoje.
 *
 * Quando o Kliko migrar para conversação em tempo real de verdade
 * (ver pesquisa do gpt-realtime-2.1 no histórico do projeto), este
 * arquivo é o ponto que será trocado — o resto do app fala com ele
 * por `speak()`/`listVoices()`, não com a API do navegador direto.
 */

export interface KlikoVoice {
  voice: SpeechSynthesisVoice;
  isPtBr: boolean;
  isPt: boolean;
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * As vozes do sistema carregam de forma assíncrona em alguns
 * navegadores (o primeiro `getVoices()` pode vir vazio). Esta função
 * espera o evento `voiceschanged` quando necessário.
 */
export function listVoices(): Promise<KlikoVoice[]> {
  return new Promise((resolve) => {
    if (!speechSynthesisSupported()) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;

    function rank(voices: SpeechSynthesisVoice[]): KlikoVoice[] {
      return voices
        .map((voice) => ({
          voice,
          isPtBr: voice.lang.toLowerCase() === "pt-br",
          isPt: voice.lang.toLowerCase().startsWith("pt"),
        }))
        .sort((a, b) => {
          if (a.isPtBr !== b.isPtBr) return a.isPtBr ? -1 : 1;
          if (a.isPt !== b.isPt) return a.isPt ? -1 : 1;
          return a.voice.name.localeCompare(b.voice.name);
        });
    }

    const existing = synth.getVoices();
    if (existing.length > 0) {
      resolve(rank(existing));
      return;
    }
    synth.onvoiceschanged = () => {
      resolve(rank(synth.getVoices()));
    };
    // Alguns navegadores nunca disparam o evento se nao ha vozes —
    // nao deixa a promise pendurada pra sempre.
    setTimeout(() => resolve(rank(synth.getVoices())), 1200);
  });
}

export function speak(text: string, voiceURI?: string | null, onEnd?: () => void): void {
  if (!speechSynthesisSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel(); // evita sobrepor falas se o usuario interagir rapido
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "pt-BR";
  utter.rate = 1.0;
  utter.pitch = 1.0;
  if (voiceURI) {
    const match = synth.getVoices().find((v) => v.voiceURI === voiceURI);
    if (match) utter.voice = match;
  }
  if (onEnd) utter.onend = onEnd;
  synth.speak(utter);
}

export function stopSpeaking(): void {
  if (speechSynthesisSupported()) window.speechSynthesis.cancel();
}
