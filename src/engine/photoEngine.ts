/**
 * Kliko — motor de processamento de fotografias (Fase 1 + Fase 2).
 *
 * REAL, não decorativo: cada renderização desenha a imagem ORIGINAL
 * (preservada intacta em memória) de novo, aplicando os ajustes atuais
 * do zero. Isso é o que torna a edição não destrutiva — mudar um
 * slider ou desfazer nunca degrada a imagem, porque sempre partimos
 * do bitmap original.
 *
 * Fase 1: os 4 ajustes globais (exposição/contraste/saturação/
 * temperatura) via `CanvasRenderingContext2D.filter` + `drawImage`.
 * Isso já rasteriza pixels REAIS no canvas (verificável com
 * `getImageData` depois) — não é um filtro CSS aplicado à aparência
 * de um elemento HTML, é o bitmap do canvas sendo redesenhado.
 *
 * Fase 2 (novo): além disso, uma camada seletiva opcional ("céu") é
 * aplicada por manipulação direta de pixels (`pixelOps.ts`), porque
 * `ctx.filter` não tem como afetar só uma região da imagem — a
 * máscara exige ler e escrever o `ImageData` pixel a pixel.
 */
import { analyzeBuffer, upsampleCellAlphaToPixels, ANALYSIS_MAX_DIMENSION, type PhotoAnalysis } from "./photoAnalysis";
import { applyMaskedAdjustment, computeDownscaledSize } from "./pixelOps";

export interface AdjustmentValues {
  /** -100 a 100 */
  exposicao: number;
  /** -100 a 100 */
  contraste: number;
  /** -100 a 100 */
  saturacao: number;
  /** -100 (frio) a 100 (quente) */
  temperatura: number;
}

export const DEFAULT_ADJUSTMENTS: AdjustmentValues = {
  exposicao: 0,
  contraste: 0,
  saturacao: 0,
  temperatura: 0,
};

/** Camada seletiva experimental de céu — ver estimateSkyMask() em photoAnalysis.ts para os limites conhecidos. */
export interface SkyLayer {
  ativo: boolean;
  saturacao: number; // 0..100
  exposicao: number; // -100..100
}

export const DEFAULT_SKY_LAYER: SkyLayer = { ativo: false, saturacao: 0, exposicao: 0 };

/** Estado completo e não destrutivo de edição — o que entra/sai do histórico (editHistory.ts). */
export interface EditState {
  exposicao: number;
  contraste: number;
  saturacao: number;
  temperatura: number;
  sky: SkyLayer;
}

export const DEFAULT_EDIT_STATE: EditState = {
  ...DEFAULT_ADJUSTMENTS,
  sky: { ...DEFAULT_SKY_LAYER },
};

export function toAdjustmentValues(state: EditState): AdjustmentValues {
  return { exposicao: state.exposicao, contraste: state.contraste, saturacao: state.saturacao, temperatura: state.temperatura };
}

/** Mescla um patch parcial (inclusive na camada `sky`) sobre um EditState existente, sem mutar nenhum dos dois. */
export function mergeEditState(base: EditState, patch: Partial<EditState>): EditState {
  return {
    ...base,
    ...patch,
    sky: { ...base.sky, ...(patch.sky ?? {}) },
  };
}

/** Converte os valores de -100..100 numa string CSS filter() válida. */
export function buildFilterString(v: AdjustmentValues): string {
  const brightness = 1 + v.exposicao / 150; // 0.33 .. 1.67
  const contrast = 1 + v.contraste / 120; // ~0.17 .. 1.83
  const saturate = 1 + v.saturacao / 100; // 0 .. 2
  const warmHueRotate = v.temperatura < 0 ? Math.min(-v.temperatura, 100) * 0.25 : 0; // azula
  const warmSepia = v.temperatura > 0 ? Math.min(v.temperatura, 100) / 150 : 0; // esquenta

  return [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${Math.max(saturate, 0).toFixed(3)})`,
    warmSepia > 0 ? `sepia(${warmSepia.toFixed(3)})` : "",
    warmHueRotate > 0 ? `hue-rotate(${(180 + warmHueRotate).toFixed(1)}deg) saturate(1.1)` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function sourceSize(source: HTMLImageElement | ImageBitmap): { w: number; h: number } {
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  return { w, h };
}

/**
 * Desenha a imagem original no canvas de destino com o estado de
 * edição completo aplicado (ajustes globais + camada seletiva de céu,
 * se ativa). Nunca modifica `source` — por isso a foto original fica
 * sempre preservada e qualquer ajuste pode ser desfeito a qualquer
 * momento apenas re-renderizando com outro `EditState`, a partir do
 * mesmo bitmap original.
 *
 * Se `skyMaskCache` for passado, reaproveita a máscara já calculada
 * (upsampled para o tamanho real da imagem) em vez de recalcular a
 * cada frame — ela só muda quando a FOTO muda, não quando o slider
 * do céu muda.
 */
export function renderEditState(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement | ImageBitmap,
  state: EditState,
  skyMaskCache?: Float32Array | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { w, h } = sourceSize(source);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = buildFilterString(toAdjustmentValues(state));
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (state.sky.ativo && skyMaskCache && (state.sky.saturacao !== 0 || state.sky.exposicao !== 0)) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let working: Uint8ClampedArray<ArrayBufferLike> = imageData.data;
    if (state.sky.saturacao !== 0) {
      working = applyMaskedAdjustment(
        { width: canvas.width, height: canvas.height, data: working },
        skyMaskCache,
        "saturation",
        state.sky.saturacao,
      ) as Uint8ClampedArray<ArrayBufferLike>;
    }
    if (state.sky.exposicao !== 0) {
      working = applyMaskedAdjustment(
        { width: canvas.width, height: canvas.height, data: working },
        skyMaskCache,
        "exposure",
        state.sky.exposicao,
      ) as Uint8ClampedArray<ArrayBufferLike>;
    }
    ctx.putImageData(new ImageData(working as Uint8ClampedArray<ArrayBuffer>, canvas.width, canvas.height), 0, 0);
  }
}

/** Mantido por compatibilidade com código existente — equivalente a renderEditState sem camada de céu. */
export function renderAdjustments(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement | ImageBitmap,
  values: AdjustmentValues,
): void {
  renderEditState(canvas, source, { ...values, sky: { ...DEFAULT_SKY_LAYER } });
}

export class KlikoImageLoadError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "KlikoImageLoadError";
    this.cause = cause;
  }
}

/**
 * Carrega um arquivo local (import da Galeria) como ImageBitmap, com
 * tratamento de erro real: um arquivo corrompido, de um formato não
 * suportado pelo Safari, ou vazio lança `KlikoImageLoadError` com uma
 * mensagem em PT-BR, em vez de deixar a Promise rejeitar com um erro
 * de baixo nível do navegador direto na tela do usuário.
 */
export async function loadImageBitmapFromFile(file: File): Promise<ImageBitmap> {
  if (!file || file.size === 0) {
    throw new KlikoImageLoadError("O arquivo selecionado está vazio ou não pôde ser lido.");
  }
  try {
    return await createImageBitmap(file);
  } catch (cause) {
    throw new KlikoImageLoadError(
      "Não consegui abrir essa imagem — o formato pode não ser suportado ou o arquivo pode estar corrompido.",
      cause,
    );
  }
}

/**
 * Extrai os pixels reais (PixelBuffer) de um ImageBitmap/HTMLImageElement
 * através de um canvas temporário — usado tanto para render final
 * quanto para gerar a versão reduzida usada na análise.
 */
export function pixelBufferFromSource(
  source: HTMLImageElement | ImageBitmap,
  maxDimension?: number,
): { width: number; height: number; data: Uint8ClampedArray } {
  const { w, h } = sourceSize(source);
  const target = maxDimension ? computeDownscaledSize(w, h, maxDimension) : { width: w, height: h };

  const off = document.createElement("canvas");
  off.width = target.width;
  off.height = target.height;
  const ctx = off.getContext("2d");
  if (!ctx) throw new KlikoImageLoadError("Não foi possível criar o contexto de desenho para analisar a imagem.");
  ctx.drawImage(source, 0, 0, target.width, target.height);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, target.width, target.height);
  } catch (cause) {
    // Canvas "tainted" (ex.: imagem de outra origem sem CORS) — não há
    // como ler pixels nesse caso; melhor falhar com mensagem clara do
    // que devolver uma análise silenciosamente errada.
    throw new KlikoImageLoadError(
      "Não foi possível ler os pixels dessa imagem para análise (restrição de origem do navegador).",
      cause,
    );
  }

  return { width: target.width, height: target.height, data: imageData.data };
}

/**
 * Analisa a fotografia (histograma, regiões, clipping, heurística de
 * céu) sempre numa versão reduzida (ANALYSIS_MAX_DIMENSION) — a
 * análise não precisa da resolução total, e isso evita travar o
 * Safari em fotos grandes do iPhone (12+ megapixels).
 */
export function analyzePhoto(source: HTMLImageElement | ImageBitmap): PhotoAnalysis {
  const buf = pixelBufferFromSource(source, ANALYSIS_MAX_DIMENSION);
  return analyzeBuffer(buf);
}

/** Gera a máscara de céu já no tamanho real da foto, para usar em renderEditState. */
export function buildSkyMaskForCanvas(analysis: PhotoAnalysis, canvasWidth: number, canvasHeight: number): Float32Array {
  return upsampleCellAlphaToPixels(analysis.skyMask, canvasWidth, canvasHeight);
}

/** Exporta o canvas atual (já com os ajustes) como PNG para download. */
export function exportCanvasAsPng(canvas: HTMLCanvasElement, filename = "kliko-edicao.png"): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
