/**
 * Kliko — registro central de animacoes.
 *
 * Cada animacao implementada vira uma entrada aqui. O Laboratorio
 * (/src/screens/Lab.tsx) le este registro para listar, agrupar por
 * categoria e permitir ajustar stiffness/damping ao vivo — sem
 * precisar duplicar a definicao em nenhum outro lugar.
 *
 * Isto cobre apenas as 20 animacoes essenciais da Fase 1. O catalogo
 * completo de 120 (planejado, nao todo implementado ainda) esta em
 * kliko_catalogo_120_animacoes.xlsx.
 */
import { springs, type SpringToken } from "./tokens";

export type AnimationCategory =
  | "orb"
  | "painel"
  | "slider"
  | "foto"
  | "voz";

export interface AnimationEntry {
  id: string;
  nome: string;
  categoria: AnimationCategory;
  descricao: string;
  /** token de fisica padrao (pode ser sobrescrito ao vivo no Lab) */
  defaultSpring: keyof typeof springs;
  reversivel: boolean;
  tela: "Mini Kliko" | "Editor" | "Laboratorio";
}

export const ANIMATION_REGISTRY: AnimationEntry[] = [
  { id: "orb-listening", nome: "Orb entra em escuta", categoria: "orb", descricao: "Borda expande com contorno luminoso ao detectar voz.", defaultSpring: "snappy", reversivel: true, tela: "Mini Kliko" },
  { id: "orb-waveform", nome: "Orb waveform ativo", categoria: "orb", descricao: "Deformacao da borda reage a amplitude do audio.", defaultSpring: "snappy", reversivel: true, tela: "Mini Kliko" },
  { id: "orb-to-panel", nome: "Orb vira painel", categoria: "orb", descricao: "Geometria compartilhada: a esfera se interpola em painel.", defaultSpring: "gentle", reversivel: true, tela: "Mini Kliko" },
  { id: "panel-to-orb", nome: "Painel volta a orb", categoria: "orb", descricao: "Interpolacao reversa de volta a esfera original.", defaultSpring: "gentle", reversivel: true, tela: "Mini Kliko" },
  { id: "orb-drag", nome: "Orb arrastado pelo usuario", categoria: "orb", descricao: "Segue o dedo e aplica inercia + spring ao soltar.", defaultSpring: "balanced", reversivel: true, tela: "Mini Kliko" },

  { id: "sheet-expand", nome: "Sheet sobe de medio p/ grande", categoria: "painel", descricao: "Arraste do handle expande entre detents.", defaultSpring: "snappy", reversivel: true, tela: "Mini Kliko" },
  { id: "sheet-dismiss", nome: "Fechar sheet por arrasto", categoria: "painel", descricao: "Arrasto para baixo alem do ultimo detent fecha.", defaultSpring: "gentle", reversivel: true, tela: "Mini Kliko" },
  { id: "sheet-backdrop", nome: "Fundo escurece com o sheet", categoria: "painel", descricao: "Overlay dim sincronizado ao progresso do sheet.", defaultSpring: "balanced", reversivel: true, tela: "Mini Kliko" },

  { id: "slider-grow", nome: "Thumb cresce ao tocar", categoria: "slider", descricao: "Escala aumenta no touch-down.", defaultSpring: "snappy", reversivel: true, tela: "Editor" },
  { id: "slider-release", nome: "Thumb retorna ao soltar", categoria: "slider", descricao: "Volta ao tamanho normal preservando velocidade.", defaultSpring: "snappy", reversivel: true, tela: "Editor" },
  { id: "slider-fill", nome: "Preenchimento do track", categoria: "slider", descricao: "Barra acompanha o valor em tempo real, sem spring.", defaultSpring: "balanced", reversivel: true, tela: "Editor" },
  { id: "slider-rubberband", nome: "Rubber-band nos limites", categoria: "slider", descricao: "Resistencia elastica ao passar do minimo/maximo.", defaultSpring: "bouncy", reversivel: true, tela: "Editor" },

  { id: "photo-crossfade", nome: "Crossfade antes/depois", categoria: "foto", descricao: "Alterna entre original e editado.", defaultSpring: "balanced", reversivel: true, tela: "Editor" },
  { id: "photo-live-adjust", nome: "Ajuste aplicado em tempo real", categoria: "foto", descricao: "Filtro interpola continuamente com o slider.", defaultSpring: "balanced", reversivel: true, tela: "Editor" },
  { id: "photo-close", nome: "Fechar tela cheia (zoom-through)", categoria: "foto", descricao: "Foto encolhe de volta a miniatura na galeria.", defaultSpring: "gentle", reversivel: true, tela: "Editor" },

  { id: "voice-transcript", nome: "Transcricao palavra a palavra", categoria: "voz", descricao: "Texto reconhecido surge progressivamente.", defaultSpring: "balanced", reversivel: false, tela: "Mini Kliko" },
  { id: "voice-listening", nome: "Indicador 'Kliko esta ouvindo'", categoria: "voz", descricao: "Texto e icone sutil durante a escuta.", defaultSpring: "balanced", reversivel: true, tela: "Mini Kliko" },
  { id: "voice-waveform-reply", nome: "Resposta falada com waveform", categoria: "voz", descricao: "Onda visual acompanha a sintese de voz.", defaultSpring: "balanced", reversivel: false, tela: "Mini Kliko" },
  { id: "voice-summary", nome: "Resumo do pedido entendido", categoria: "voz", descricao: "Card com o resumo da acao proposta.", defaultSpring: "gentle", reversivel: true, tela: "Mini Kliko" },
  { id: "voice-confirm", nome: "Confirmacao antes de aplicar", categoria: "voz", descricao: "Botoes sim/nao pulsam para guiar a decisao.", defaultSpring: "balanced", reversivel: true, tela: "Mini Kliko" },
];

export function animationsByCategory(cat: AnimationCategory) {
  return ANIMATION_REGISTRY.filter((a) => a.categoria === cat);
}

export type { SpringToken };
