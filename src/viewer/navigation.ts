import { SCREEN_PATH } from '../layout.ts';
import type { Cell, ViewerData } from '../model.ts';

export interface ScreenNode {
  id: string;
  states: { id: string; cells: Cell[] }[];
}

export interface FlowNode {
  id: string;
  title: string;
  screens: ScreenNode[];
}

/** Preserve the board's metadata ordering, deduplicating viewport copies. */
export function screenTree(data: ViewerData): FlowNode[] {
  return data.flows.map((flow) => {
    const screens = new Map<string, ScreenNode>();
    for (const section of data.board.filter((s) => s.kind === 'flow')) {
      for (const line of section.lines) {
        for (const cell of line.cells) {
          const m = SCREEN_PATH.exec(cell.path);
          if (!m || m[1] !== flow.id) continue;
          const id = m[2] as string;
          const stateId = m[3] as string;
          const screen = screens.get(id) ?? { id, states: [] };
          screens.set(id, screen);
          let state = screen.states.find((s) => s.id === stateId);
          if (!state) {
            state = { id: stateId, cells: [] };
            screen.states.push(state);
          }
          state.cells.push(cell);
        }
      }
    }
    return { ...flow, screens: [...screens.values()] };
  }).filter((flow) => flow.screens.length > 0);
}

/** Stepping is bounded within a screen/flow; only viewport cycling wraps. */
export function stepFrame(data: ViewerData, current: Cell, key: string): Cell | null {
  const sections = current.root === 'head' ? data.board : data.preview?.sections ?? [];
  const cells = sections.flatMap((s) => s.lines.flatMap((l) => l.cells)).filter((c) => c.root === current.root);
  const choose = (candidates: Cell[]): Cell | null => candidates.find((c) => c.viewport === current.viewport) ?? candidates[0] ?? null;
  if (key.toLowerCase() === 'v') {
    const copies = data.viewports.flatMap((vp) => cells.filter((c) => c.path === current.path && c.viewport === vp.id).slice(0, 1));
    const index = copies.findIndex((c) => c.viewport === current.viewport);
    return index >= 0 ? copies[(index + 1) % copies.length] ?? null : null;
  }
  const m = SCREEN_PATH.exec(current.path);
  if (!m) return null;
  // Preview sections retain board order. Treat the base's changed screens as a flow tree.
  const tree = screenTree({ ...data, board: [{ id: 'step', kind: 'flow', title: '', align: false, columns: [], lines: cells.map((c) => ({ cells: [c] })) }] });
  const flow = tree.find((f) => f.id === m[1]);
  const screenIndex = flow?.screens.findIndex((s) => s.id === m[2]) ?? -1;
  const screen = flow?.screens[screenIndex];
  if (!flow || !screen) return null;
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const index = screen.states.findIndex((s) => s.id === m[3]);
    return choose(screen.states[index + (key === 'ArrowLeft' ? -1 : 1)]?.cells ?? []);
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const next = flow.screens[screenIndex + (key === 'ArrowUp' ? -1 : 1)];
    return choose((next?.states.find((s) => s.id === m[3]) ?? next?.states[0])?.cells ?? []);
  }
  return null;
}

/** Where a screen state sits among its screen's states: "1 of 4". */
export function statePosition(data: ViewerData, current: Cell): { index: number; total: number } | null {
  const m = SCREEN_PATH.exec(current.path);
  if (!m) return null;
  const sections = current.root === 'head' ? data.board : data.preview?.sections ?? [];
  const cells = sections.flatMap((s) => s.lines.flatMap((l) => l.cells)).filter((c) => c.root === current.root);
  const tree = screenTree({ ...data, board: [{ id: 'position', kind: 'flow', title: '', align: false, columns: [], lines: cells.map((c) => ({ cells: [c] })) }] });
  const screen = tree.find((f) => f.id === m[1])?.screens.find((s) => s.id === m[2]);
  if (!screen) return null;
  const index = screen.states.findIndex((s) => s.id === m[3]);
  return index < 0 ? null : { index, total: screen.states.length };
}
