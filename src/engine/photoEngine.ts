/**
 * Kliko — motor de processamento de fotografias.
 *
 * REAL, nao decorativo: cada chamada a `renderAdjustments` desenha a
 * imagem ORIGINAL (preservada intacta em memoria) de novo num canvas,
 * aplicando os filtros atuais. Isso e o que torna a edicao
 * nao-destrutiva — mudar um slider nunca degrada a imagem, porque
 * sempre partimos do bitmap original.
 *
 * Etapa atual (Fase 1): ajustes via CanvasRenderingContext2D.filter
 * (exposicao/brilho, contraste, saturacao, temperatura aproximada por
 * sepia+hue-rotate). Suficiente para provar edicao real em tempo real
 * no Safari. Um motor por pixel (ImageData) para ajustes seletivos por
 * regiao fica para a Fase 2 — ver README, secao "O que falta".
 */

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

/** Converte os valores de -100..100 numa string CSS filter() valida. */
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

/**
 * Desenha a imagem original no canvas de destino com os ajustes
 * aplicados. Nunca modifica `source` — por isso a foto original fica
 * sempre preservada e qualquer ajuste pode ser desfeito a qualquer
 * momento apenas re-renderizando com outros valores.
 */
export function renderAdjustments(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement | ImageBitmap,
  values: AdjustmentValues,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = buildFilterString(values);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/** Carrega um arquivo local (import da Galeria) como ImageBitmap. */
export async function loadImageBitmapFromFile(file: File): Promise<ImageBitmap> {
  return await createImageBitmap(file);
}

/** Exporta o canvas atual (ja com os ajustes) como PNG para download. */
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
