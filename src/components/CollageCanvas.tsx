import { useEffect, useRef } from "react";
import { kliko } from "../motion/tokens";
import {
  renderCollageToCanvas,
  updateSlotTransform,
  type CollageLayout,
  type CollageSlot,
} from "../engine/collageEngine";

interface CollageCanvasProps {
  layout: CollageLayout;
  slots: CollageSlot[];
  photos: Map<string, ImageBitmap>;
  onSlotsChange: (next: CollageSlot[]) => void;
  /** chamado quando a pessoa toca numa moldura vazia — abre o seletor de arquivo para aquele índice */
  onRequestPhoto: (frameIndex: number) => void;
}

/**
 * Área de montagem: um <canvas> real desenha o resultado (prévia
 * fiel ao export final), com overlays HTML posicionados sobre cada
 * moldura só para capturar os gestos — arrastar (um dedo) reposiciona
 * dentro da moldura, pinçar (dois dedos) ou roda do mouse com Ctrl
 * amplia. O canvas é redesenhado a cada gesto porque é pequeno
 * (resolução de prévia, não a resolução de exportação).
 */
export function CollageCanvas({ layout, slots, photos, onSlotsChange, onRequestPhoto }: CollageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const width = Math.round(container.clientWidth);
    const height = Math.round(width / layout.aspect);
    renderCollageToCanvas(canvas, layout, slots, photos, width, height);
  }, [layout, slots, photos]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${layout.aspect}`,
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
      }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

      {layout.frames.map((frame, i) => {
        const slot = slots[i];
        return (
          <FrameOverlay
            key={i}
            frame={frame}
            filled={!!slot?.photoId}
            offsetX={slot?.offsetX ?? 0}
            offsetY={slot?.offsetY ?? 0}
            scale={slot?.scale ?? 1}
            photoNaturalSize={slot?.photoId ? photos.get(slot.photoId) : undefined}
            onTapEmpty={() => onRequestPhoto(i)}
            onTransform={(patch) => onSlotsChange(updateSlotTransform(slots, i, patch))}
          />
        );
      })}
    </div>
  );
}

function FrameOverlay({
  frame,
  filled,
  offsetX,
  offsetY,
  scale,
  photoNaturalSize,
  onTapEmpty,
  onTransform,
}: {
  frame: { x: number; y: number; w: number; h: number };
  filled: boolean;
  offsetX: number;
  offsetY: number;
  scale: number;
  photoNaturalSize?: { width: number; height: number };
  onTapEmpty: () => void;
  onTransform: (patch: { offsetX?: number; offsetY?: number; scale?: number }) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Snapshot tirado no início de CADA gesto (pointerdown) — todo cálculo
  // de delta durante o gesto parte sempre desse valor fixo (offset/escala
  // ANTES do gesto + posição inicial do ponteiro), nunca de um ref
  // acumulado à parte, então nunca diverge do estado real em `slots`.
  const gestureStartRef = useRef<{ offsetX: number; offsetY: number; scale: number; dist: number; clientX: number; clientY: number } | null>(null);

  function currentFrameRect() {
    const el = divRef.current;
    if (!el) return { w: 1, h: 1 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!filled) {
      onTapEmpty();
      return;
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gestureStartRef.current = {
      offsetX,
      offsetY,
      scale,
      dist: distanceBetween(pointers.current),
      clientX: e.clientX,
      clientY: e.clientY,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!filled || !pointers.current.has(e.pointerId) || !gestureStartRef.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const start = gestureStartRef.current;

    if (pointers.current.size >= 2) {
      // Pinça com dois dedos: amplia proporcionalmente à variação de distância entre eles.
      const newDist = distanceBetween(pointers.current);
      if (start.dist > 0) {
        onTransform({ scale: start.scale * (newDist / start.dist) });
      }
      return;
    }

    // Um dedo: arrasta para reposicionar dentro da moldura, a partir do ponto onde o gesto começou.
    if (!photoNaturalSize) return;
    const { w: frameW, h: frameH } = currentFrameRect();
    const baseScale = Math.max(frameW / photoNaturalSize.width, frameH / photoNaturalSize.height);
    const drawnW = photoNaturalSize.width * baseScale * start.scale;
    const drawnH = photoNaturalSize.height * baseScale * start.scale;
    const maxPanX = Math.max(0, (drawnW - frameW) / 2);
    const maxPanY = Math.max(0, (drawnH - frameH) / 2);
    const dx = e.clientX - start.clientX;
    const dy = e.clientY - start.clientY;
    const deltaOffsetX = maxPanX > 0 ? dx / maxPanX : 0;
    const deltaOffsetY = maxPanY > 0 ? dy / maxPanY : 0;
    onTransform({ offsetX: start.offsetX + deltaOffsetX, offsetY: start.offsetY + deltaOffsetY });
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gestureStartRef.current = null;
    }
  }

  function handleWheel(e: React.WheelEvent) {
    if (!filled || !e.ctrlKey) return; // trackpad "pinçar" no desktop reporta como wheel+ctrlKey
    e.preventDefault();
    onTransform({ scale: scale - e.deltaY * 0.01 });
  }

  return (
    <div
      ref={divRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      style={{
        position: "absolute",
        left: `${frame.x * 100}%`,
        top: `${frame.y * 100}%`,
        width: `${frame.w * 100}%`,
        height: `${frame.h * 100}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: filled ? "grab" : "pointer",
        touchAction: "none",
      }}
      aria-label={filled ? "Mover ou ampliar fotografia nesta moldura" : "Adicionar fotografia nesta moldura"}
    >
      {!filled && (
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            background: "rgba(255,255,255,0.85)",
            color: kliko.blue,
            fontSize: 18,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          +
        </span>
      )}
    </div>
  );
}

function distanceBetween(pointers: Map<number, { x: number; y: number }>): number {
  const pts = Array.from(pointers.values());
  if (pts.length < 2) return 0;
  const [a, b] = pts;
  return Math.hypot(a.x - b.x, a.y - b.y);
}
