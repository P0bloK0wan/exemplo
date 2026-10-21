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
import { applyMaskedAdjustments, applyAnalogEffects, computeDownscaledSize, MASK_RENDER_MAX_DIMENSION, type AnalogEffects } from "./pixelOps";

/** Canvas de rascunho reaproveitado entre chamadas, para não recriar/realocar a cada frame de slider. */
let maskScratchCanvas: HTMLCanvasElement | null = null;
function getMaskScratchCanvas(): HTMLCanvasElement {
  if (!maskScratchCanvas) maskScratchCanvas = document.createElement("canvas");
  return maskScratchCanvas;
}

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

/**
 * Camada analógica (Fase 3) — granulação/vinheta/desbotamento, já
 * resolvidos (ver `analogPresets.ts::buildAnalogApplication`). O
 * render só lê `grain`/`vignette`/`fade`; `presetId`/`intensity` são
 * só para a UI saber qual card destacar e recalcular ao arrastar o
 * slider de intensidade — o motor de render não precisa conhecer o
 * catálogo de presets.
 */
export interface AnalogLayer extends AnalogEffects {
  presetId: string | null;
  intensity: number;
}

export const DEFAULT_ANALOG_LAYER: AnalogLayer = {
  presetId: null,
  intensity: 100,
  grain: 0,
  vignette: 0,
  fade: 0,
};

/** Estado completo e não destrutivo de edição — o que entra/sai do histórico (editHistory.ts). */
export interface EditState {
  exposicao: number;
  contraste: number;
  saturacao: number;
  temperatura: number;
  sky: SkyLayer;
  analog: AnalogLayer;
}

export const DEFAULT_EDIT_STATE: EditState = {
  ...DEFAULT_ADJUSTMENTS,
  sky: { ...DEFAULT_SKY_LAYER },
  analog: { ...DEFAULT_ANALOG_LAYER },
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
    analog: { ...base.analog, ...(patch.analog ?? {}) },
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
    applySkyLayer(canvas, ctx, state.sky, skyMaskCache);
  }

  if (state.analog.grain > 0 || state.analog.vignette > 0 || state.analog.fade > 0) {
    applyAnalogLayer(canvas, ctx, state.analog);
  }
}

/**
 * Aplica granulação/vinheta/desbotamento sobre o canvas JÁ renderizado
 * (ajustes globais + céu, se houver) — por isso lê o próprio `canvas`
 * como fonte, não a imagem original. Mesma estratégia de resolução
 * limitada de `applySkyLayer` (reaproveita o scratch canvas): numa
 * foto de 12MP do iPhone, o grão em resolução reduzida e escalado de
 * volta fica ligeiramente mais suave que grão nativo — limitação
 * documentada, aceitável pelo ganho de desempenho/memória no Safari.
 */
function applyAnalogLayer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, analog: AnalogLayer): void {
  const target = computeDownscaledSize(canvas.width, canvas.height, MASK_RENDER_MAX_DIMENSION);
  const isFullRes = target.width === canvas.width && target.height === canvas.height;

  const scratch = isFullRes ? canvas : getMaskScratchCanvas();
  let scratchCtx = ctx;
  if (!isFullRes) {
    scratch.width = target.width;
    scratch.height = target.height;
    const sc = scratch.getContext("2d");
    if (!sc) return;
    scratchCtx = sc;
    scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
    scratchCtx.drawImage(canvas, 0, 0, scratch.width, scratch.height);
  }

  const imageData = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
  const working = applyAnalogEffects(
    { width: scratch.width, height: scratch.height, data: imageData.data },
    { grain: analog.grain, vignette: analog.vignette, fade: analog.fade },
  );
  scratchCtx.putImageData(new ImageData(working as Uint8ClampedArray<ArrayBuffer>, scratch.width, scratch.height), 0, 0);

  if (!isFullRes) {
    ctx.drawImage(scratch, 0, 0, scratch.width, scratch.height, 0, 0, canvas.width, canvas.height);
  }
}

/**
 * Aplica a camada seletiva de céu numa resolução limitada
 * (MASK_RENDER_MAX_DIMENSION) para não travar a thread principal nem
 * alocar múltiplas cópias do tamanho da foto inteira em dispositivos
 * móveis — ver o comentário em pixelOps.ts. O resultado é escalado de
 * volta para o tamanho real do canvas.
 */
function applySkyLayer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  sky: SkyLayer,
  skyMaskCache: Float32Array,
): void {
  const target = computeDownscaledSize(canvas.width, canvas.height, MASK_RENDER_MAX_DIMENSION);
  const isFullRes = target.width === canvas.width && target.height === canvas.height;

  const scratch = isFullRes ? canvas : getMaskScratchCanvas();
  let scratchCtx = ctx;
  if (!isFullRes) {
    scratch.width = target.width;
    scratch.height = target.height;
    const sc = scratch.getContext("2d");
    if (!sc) return;
    scratchCtx = sc;
    scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
    scratchCtx.drawImage(canvas, 0, 0, scratch.width, scratch.height);
  }

  const imageData = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
  // A máscara foi gerada no tamanho REAL do canvas; quando trabalhamos
  // numa cópia reduzida, reamostramos a máscara para o mesmo tamanho
  // reduzido em vez de recalculá-la (ela é barata de reamostrar — é
  // só indexação por célula da grade original — mas o custo que
  // importa evitar é o loop de pixel, que já está no tamanho certo).
  const mask = isFullRes ? skyMaskCache : resampleAlphaMask(skyMaskCache, canvas.width, canvas.height, scratch.width, scratch.height);

  const working = applyMaskedAdjustments(
    { width: scratch.width, height: scratch.height, data: imageData.data },
    mask,
    [
      { op: "saturation", amount: sky.saturacao },
      { op: "exposure", amount: sky.exposicao },
    ],
  );
  scratchCtx.putImageData(new ImageData(working as Uint8ClampedArray<ArrayBuffer>, scratch.width, scratch.height), 0, 0);

  if (!isFullRes) {
    ctx.drawImage(scratch, 0, 0, scratch.width, scratch.height, 0, 0, canvas.width, canvas.height);
  }
}

/** Reamostra uma máscara alfa por pixel de um tamanho para outro (nearest-neighbor — suficiente para uma máscara já suave por célula). */
function resampleAlphaMask(mask: Float32Array, fromW: number, fromH: number, toW: number, toH: number): Float32Array {
  const out = new Float32Array(toW * toH);
  for (let y = 0; y < toH; y++) {
    const sy = Math.min(fromH - 1, Math.floor((y / toH) * fromH));
    for (let x = 0; x < toW; x++) {
      const sx = Math.min(fromW - 1, Math.floor((x / toW) * fromW));
      out[y * toW + x] = mask[sy * fromW + sx] ?? 0;
    }
  }
  return out;
}

/** Mantido por compatibilidade com código existente — equivalente a renderEditState sem camada de céu. */
export function renderAdjustments(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement | ImageBitmap,
  values: AdjustmentValues,
): void {
  renderEditState(canvas, source, { ...values, sky: { ...DEFAULT_SKY_LAYER }, analog: { ...DEFAULT_ANALOG_LAYER } });
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

/**
 * Renderiza uma miniatura PEQUENA (recorte central quadrado) com um
 * conjunto de ajustes + efeitos analógicos aplicados — usado pelo
 * seletor de presets para mostrar a prévia real de cada preset sobre
 * a própria fotografia do usuário, nunca um gradiente decorativo.
 * Como o canvas é minúsculo (ex. 96x96), roda a passagem de pixel
 * inteira em resolução total sem custo perceptível.
 */
export function renderPresetThumbnail(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement | ImageBitmap,
  adjustments: AdjustmentValues,
  effects: AnalogEffects,
  size = 96,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = size;
  canvas.height = size;

  const { w, h } = sourceSize(source);
  const cropSize = Math.min(w, h);
  const sx = (w - cropSize) / 2;
  const sy = (h - cropSize) / 2;

  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.filter = buildFilterString(adjustments);
  ctx.drawImage(source, sx, sy, cropSize, cropSize, 0, 0, size, size);
  ctx.restore();

  if (effects.grain > 0 || effects.vignette > 0 || effects.fade > 0) {
    const imageData = ctx.getImageData(0, 0, size, size);
    const working = applyAnalogEffects({ width: size, height: size, data: imageData.data }, effects);
    ctx.putImageData(new ImageData(working as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  }
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
