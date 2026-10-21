import { describe, expect, it } from "vitest";
import {
  COLLAGE_LAYOUTS,
  getCollageLayout,
  createEmptySlots,
  remapSlotsToLayout,
  assignPhotoToSlot,
  clearSlot,
  updateSlotTransform,
  isCollageComplete,
} from "../collageEngine";

describe("catálogo de layouts de colagem", () => {
  it("todo layout tem exatamente um frame por slot declarado", () => {
    for (const layout of COLLAGE_LAYOUTS) {
      expect(layout.frames.length).toBe(layout.slots);
    }
  });

  it("frames de cada layout ficam dentro de 0..1 (nunca vazam do canvas)", () => {
    for (const layout of COLLAGE_LAYOUTS) {
      for (const f of layout.frames) {
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.x + f.w).toBeLessThanOrEqual(1.0001);
        expect(f.y + f.h).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("getCollageLayout devolve undefined para id desconhecido", () => {
    expect(getCollageLayout("nao-existe")).toBeUndefined();
  });
});

describe("estado das molduras (slots)", () => {
  const layout = getCollageLayout("grade-quadrupla")!;

  it("createEmptySlots cria uma moldura vazia por frame", () => {
    const slots = createEmptySlots(layout);
    expect(slots).toHaveLength(4);
    expect(slots.every((s) => s.photoId === null)).toBe(true);
  });

  it("assignPhotoToSlot ocupa só a moldura indicada, reseta pan/zoom dela", () => {
    const slots = createEmptySlots(layout);
    const moved = updateSlotTransform(assignPhotoToSlot(slots, 1, "foto-a"), 0, { offsetX: 0.5 });
    const next = assignPhotoToSlot(moved, 1, "foto-b");
    expect(next[0].photoId).toBeNull();
    expect(next[0].offsetX).toBe(0.5); // moldura 0 não foi afetada pela atribuição na moldura 1
    expect(next[1]).toEqual({ photoId: "foto-b", offsetX: 0, offsetY: 0, scale: 1 });
  });

  it("clearSlot esvazia só a moldura indicada e reseta a transformação dela", () => {
    const slots = updateSlotTransform(assignPhotoToSlot(createEmptySlots(layout), 2, "foto-c"), 2, { scale: 2 });
    const next = clearSlot(slots, 2);
    expect(next[2]).toEqual({ photoId: null, offsetX: 0, offsetY: 0, scale: 1 });
  });

  it("updateSlotTransform prende offset em -1..1 e escala em 1..3, sem afastar o gesto do usuário por completo", () => {
    const slots = createEmptySlots(layout);
    const next = updateSlotTransform(slots, 0, { offsetX: 5, offsetY: -5, scale: 10 });
    expect(next[0].offsetX).toBe(1);
    expect(next[0].offsetY).toBe(-1);
    expect(next[0].scale).toBe(3);
  });

  it("remapSlotsToLayout preserva fotos já atribuídas nas molduras em comum ao trocar de layout", () => {
    const from = getCollageLayout("dupla-vertical")!;
    const to = getCollageLayout("grade-quadrupla")!;
    const slots = assignPhotoToSlot(createEmptySlots(from), 0, "foto-x");
    const remapped = remapSlotsToLayout(slots, to);
    expect(remapped).toHaveLength(4);
    expect(remapped[0].photoId).toBe("foto-x");
    expect(remapped[2].photoId).toBeNull();
  });
});

describe("isCollageComplete", () => {
  const layout = getCollageLayout("dupla-vertical")!;

  it("falso enquanto houver qualquer moldura vazia", () => {
    const slots = assignPhotoToSlot(createEmptySlots(layout), 0, "foto-a");
    expect(isCollageComplete(slots)).toBe(false);
  });

  it("verdadeiro quando todas as molduras têm fotografia", () => {
    let slots = assignPhotoToSlot(createEmptySlots(layout), 0, "foto-a");
    slots = assignPhotoToSlot(slots, 1, "foto-b");
    expect(isCollageComplete(slots)).toBe(true);
  });

  it("falso para uma lista de molduras vazia", () => {
    expect(isCollageComplete([])).toBe(false);
  });
});
