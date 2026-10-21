/**
 * Kliko — histórico de edição não destrutivo, genérico (Fase 2).
 *
 * Um reducer puro (sem React, sem canvas) para ser facilmente testado
 * e reutilizado tanto pelos 4 ajustes globais quanto pela camada de
 * céu seletivo — ambos guardados juntos num único `EditState`.
 *
 * Conceito: `present` é o último estado CONFIRMADO. `draft` é uma
 * prévia ainda não confirmada (o que a Mini Kliko propõe antes de
 * você apertar "Confirmar"). `past`/`future` são as pilhas de
 * desfazer/refazer sobre estados já confirmados — o draft nunca entra
 * nessas pilhas.
 */

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  draft: T | null;
}

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], present: initial, future: [], draft: null };
}

/** Propõe uma prévia — não altera `present`, não afeta undo/redo. */
export function setDraft<T>(history: HistoryState<T>, draft: T): HistoryState<T> {
  return { ...history, draft };
}

/** Descarta a prévia e restaura EXATAMENTE o último estado confirmado. */
export function cancelDraft<T>(history: HistoryState<T>): HistoryState<T> {
  return { ...history, draft: null };
}

/**
 * Confirma a prévia: ela se torna o novo `present`, o `present`
 * anterior entra na pilha de desfazer, e a pilha de refazer é limpa
 * (uma nova edição confirmada invalida qualquer "refazer" pendente de
 * um ramo anterior — comportamento padrão de editores).
 */
export function confirmDraft<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.draft === null) return history;
  return {
    past: [...history.past, history.present],
    present: history.draft,
    future: [],
    draft: null,
  };
}

export function canUndo<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    draft: null,
  };
}

export function redo<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
    draft: null,
  };
}

/** Reseta tudo para um estado inicial dado, limpando as pilhas — "Redefinir todos os ajustes". */
export function resetHistory<T>(_history: HistoryState<T>, initial: T): HistoryState<T> {
  return createHistory(initial);
}
