/**
 * Kliko — motor do Estúdio de Colagem (Fase 3).
 *
 * Diferente dos protótipos de referência (2Shoot), os "layouts" aqui
 * não são apenas um gradiente decorativo com um contador: cada
 * `CollageLayout` define as molduras REAIS (posição/tamanho
 * normalizados 0..1) onde as fotografias são desenhadas. O render é
 * paramétrico pelo tamanho do canvas de destino, então a MESMA função
 * serve para a prévia interativa (resolução modesta, responsiva) e
 * para a exportação final (resolução mais alta) — sem duplicar lógica
 * nem perder qualidade.
 *
 * Nunca modifica os `ImageBitmap` originais importados: cada frame é
 * desenhado a partir do bitmap original, recortado/escalado só no
 * destino — a fotografia original fica intacta para ser reaproveitada
 * em qualquer outro layout.
 */

export interface CollageFrame {
  /** 0..1, relativo à largura/altura do canvas de destino */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CollageLayout {
  id: string;
  label: string;
  slots: number;
  frames: CollageFrame[];
  /** proporção sugerida do canvas final (largura/altura) */
  aspect: number;
}

const GAP = 0.018; // vão entre molduras, proporcional ao canvas — identidade minimalista do Kliko

/** Catálogo de layouts reais — estrutura original do Kliko, não copia a aparência dos protótipos. */
export const COLLAGE_LAYOUTS: CollageLayout[] = [
  {
    id: "dupla-vertical",
    label: "Dupla (lado a lado)",
    slots: 2,
    aspect: 1,
    frames: [
      { x: 0, y: 0, w: 0.5 - GAP / 2, h: 1 },
      { x: 0.5 + GAP / 2, y: 0, w: 0.5 - GAP / 2, h: 1 },
    ],
  },
  {
    id: "dupla-horizontal",
    label: "Dupla (empilhada)",
    slots: 2,
    aspect: 4 / 5,
    frames: [
      { x: 0, y: 0, w: 1, h: 0.5 - GAP / 2 },
      { x: 0, y: 0.5 + GAP / 2, w: 1, h: 0.5 - GAP / 2 },
    ],
  },
  {
    id: "destaque-mais-duas",
    label: "Destaque + 2",
    slots: 3,
    aspect: 1,
    frames: [
      { x: 0, y: 0, w: 1, h: 0.62 - GAP / 2 },
      { x: 0, y: 0.62 + GAP / 2, w: 0.5 - GAP / 2, h: 0.38 - GAP / 2 },
      { x: 0.5 + GAP / 2, y: 0.62 + GAP / 2, w: 0.5 - GAP / 2, h: 0.38 - GAP / 2 },
    ],
  },
  {
    id: "grade-quadrupla",
    label: "Grade 2×2",
    slots: 4,
    aspect: 1,
    frames: [
      { x: 0, y: 0, w: 0.5 - GAP / 2, h: 0.5 - GAP / 2 },
      { x: 0.5 + GAP / 2, y: 0, w: 0.5 - GAP / 2, h: 0.5 - GAP / 2 },
      { x: 0, y: 0.5 + GAP / 2, w: 0.5 - GAP / 2, h: 0.5 - GAP / 2 },
      { x: 0.5 + GAP / 2, y: 0.5 + GAP / 2, w: 0.5 - GAP / 2, h: 0.5 - GAP / 2 },
    ],
  },
  {
    id: "tira-vertical",
    label: "Tira (4 em coluna)",
    slots: 4,
    aspect: 0.5,
    frames: [0, 1, 2, 3].map((i) => ({ x: 0, y: i * 0.25 + (i > 0 ? GAP / 2 : 0), w: 1, h: 0.25 - GAP / 2 })),
  },
];

export function getCollageLayout(id: string): CollageLayout | undefined {
  return COLLAGE_LAYOUTS.find((l) => l.id === id);
}

export interface CollageSlot {
  /** id da fotografia ocupando a moldura, ou null se vazia */
  photoId: string | null;
  /** -1..1, deslocamento horizontal dentro da moldura (0 = centrado) */
  offsetX: number;
  /** -1..1, deslocamento vertical dentro da moldura */
  offsetY: number;
  /** 1..3, zoom sobre o recorte "cover" (1 = exatamente cobre a moldura, sem corte extra) */
  scale: number;
}

export function createEmptySlots(layout: CollageLayout): CollageSlot[] {
  return layout.frames.map(() => ({ photoId: null, offsetX: 0, offsetY: 0, scale: 1 }));
}

/** Reaproveita o que já havia nas molduras em comum ao trocar de layout, em vez de limpar tudo. */
export function remapSlotsToLayout(prevSlots: CollageSlot[], newLayout: CollageLayout): CollageSlot[] {
  return newLayout.frames.map((_, i) => prevSlots[i] ?? { photoId: null, offsetX: 0, offsetY: 0, scale: 1 });
}

export function assignPhotoToSlot(slots: CollageSlot[], frameIndex: number, photoId: string): CollageSlot[] {
  return slots.map((s, i) => (i === frameIndex ? { photoId, offsetX: 0, offsetY: 0, scale: 1 } : s));
}

export function clearSlot(slots: CollageSlot[], frameIndex: number): CollageSlot[] {
  return slots.map((s, i) => (i === frameIndex ? { photoId: null, offsetX: 0, offsetY: 0, scale: 1 } : s));
}

const MIN_SCALE = 1;
const MAX_SCALE = 3;

/** Atualiza pan/zoom de uma moldura, sempre presos a limites que garantem que a foto nunca deixe um vão vazio. */
export function updateSlotTransform(
  slots: CollageSlot[],
  frameIndex: number,
  patch: Partial<Pick<CollageSlot, "offsetX" | "offsetY" | "scale">>,
): CollageSlot[] {
  return slots.map((s, i) => {
    if (i !== frameIndex) return s;
    return {
      ...s,
      offsetX: patch.offsetX !== undefined ? Math.min(1, Math.max(-1, patch.offsetX)) : s.offsetX,
      offsetY: patch.offsetY !== undefined ? Math.min(1, Math.max(-1, patch.offsetY)) : s.offsetY,
      scale: patch.scale !== undefined ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, patch.scale)) : s.scale,
    };
  });
}

export interface CollagePhotoSource {
  id: string;
  bitmap: ImageBitmap;
}

/**
 * Desenha a colagem completa num canvas de QUALQUER tamanho —
 * `canvasWidth`/`canvasHeight` decidem a resolução (modesta para
 * prévia interativa, mais alta para exportação), a matemática de
 * recorte "cover" é a mesma, normalizada pelas molduras do layout.
 * Nunca lê/escreve nos bitmaps originais — só os desenha.
 */
export function renderCollageToCanvas(
  canvas: HTMLCanvasElement,
  layout: CollageLayout,
  slots: CollageSlot[],
  photosById: Map<string, ImageBitmap>,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  ctx.save();
  ctx.fillStyle = "#f5f7fa"; // fundo claro minimalista do Kliko, nunca preto como nos protótipos de referência
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  layout.frames.forEach((frame, i) => {
    const slot = slots[i];
    const frameX = frame.x * canvasWidth;
    const frameY = frame.y * canvasHeight;
    const frameW = frame.w * canvasWidth;
    const frameH = frame.h * canvasHeight;

    ctx.save();
    ctx.beginPath();
    roundedRectPath(ctx, frameX, frameY, frameW, frameH, Math.min(14, frameW * 0.04));
    ctx.clip();

    const bitmap = slot?.photoId ? photosById.get(slot.photoId) : undefined;
    if (bitmap) {
      drawCoverFit(ctx, bitmap, frameX, frameY, frameW, frameH, slot.offsetX, slot.offsetY, slot.scale);
    } else {
      ctx.fillStyle = "#e4e9f0";
      ctx.fillRect(frameX, frameY, frameW, frameH);
    }
    ctx.restore();
  });

  ctx.restore();
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Desenha `bitmap` cobrindo o retângulo de destino (sem distorcer a
 * proporção), com zoom extra (`scale`) e deslocamento (`offsetX`/`Y`
 * em -1..1) dentro do espaço excedente — é o que dá o gesto natural
 * de "arrastar para reenquadrar" e "pinçar para ampliar".
 */
function drawCoverFit(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  offsetX: number,
  offsetY: number,
  scale: number,
): void {
  const baseScale = Math.max(frameW / bitmap.width, frameH / bitmap.height);
  const effectiveScale = baseScale * scale;
  const drawnW = bitmap.width * effectiveScale;
  const drawnH = bitmap.height * effectiveScale;

  const maxPanX = Math.max(0, (drawnW - frameW) / 2);
  const maxPanY = Math.max(0, (drawnH - frameH) / 2);

  const destX = frameX + frameW / 2 - drawnW / 2 + offsetX * maxPanX;
  const destY = frameY + frameH / 2 - drawnH / 2 + offsetY * maxPanY;

  ctx.drawImage(bitmap, destX, destY, drawnW, drawnH);
}

/** Exporta a colagem final numa resolução mais alta que a prévia, a partir dos bitmaps ORIGINAIS (nunca de uma cópia já reduzida). */
export function exportCollage(
  layout: CollageLayout,
  slots: CollageSlot[],
  photosById: Map<string, ImageBitmap>,
  exportWidth = 1600,
): HTMLCanvasElement {
  const exportHeight = Math.round(exportWidth / layout.aspect);
  const canvas = document.createElement("canvas");
  renderCollageToCanvas(canvas, layout, slots, photosById, exportWidth, exportHeight);
  return canvas;
}

export function isCollageComplete(slots: CollageSlot[]): boolean {
  return slots.length > 0 && slots.every((s) => s.photoId !== null);
}
