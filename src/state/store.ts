/** UI store: the single bridge between the simulation and React. */
import { create } from 'zustand';
import { applyAction, canLink, type GameAction } from '../engine/actions';
import { BALANCE, STRUCTURES } from '../engine/config';
import { createGame } from '../engine/worldgen';
import { endTurn } from '../engine/simulation';
import { clearSave, loadGame, saveGame, saveSummary, type SaveSummary } from '../engine/save';
import { canBuild, canClaim, canUpgrade } from '../engine/progression';
import { tileAt } from '../engine/board';
import { audio } from '../audio/audio';
import type { GameSetup, GameState, Pos, StructureKind, TurnSummary } from '../engine/types';
import type { Overlay } from '../render/renderer';

export type Modal = 'tech' | 'market' | 'empire' | 'rivals' | 'help' | 'pause' | 'summary' | 'victory' | 'newgame' | null;
export type Screen = 'menu' | 'game';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
}

interface UiState {
  screen: Screen;
  game: GameState | null;
  rev: number;
  selected: Pos | null;
  buildKind: StructureKind | null;
  linkSource: Pos | null;
  overlay: Overlay;
  modal: Modal;
  summary: TurnSummary | null;
  toasts: Toast[];
  muted: boolean;
  focus: { x: number; y: number; nonce: number } | null;
  objectivesOpen: boolean;
  hover: Pos | null;

  startGame: (setup: Omit<GameSetup, 'credits'> & { credits?: number }) => void;
  continueGame: () => void;
  quitToMenu: () => void;
  select: (pos: Pos | null) => void;
  setHover: (pos: Pos | null) => void;
  setBuildKind: (kind: StructureKind | null) => void;
  setOverlay: (overlay: Overlay) => void;
  setModal: (modal: Modal) => void;
  toggleObjectives: () => void;
  toggleMute: () => void;
  focusTile: (x: number, y: number) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  handleTileClick: (pos: Pos, mods: { shift: boolean }) => void;
  build: (kind: StructureKind) => void;
  claim: () => void;
  upgrade: () => void;
  beginLink: () => void;
  cancelLink: () => void;
  research: (techId: string) => void;
  setPolicy: (policy: GameState['players'][number]['policy'], pos?: Pos) => void;
  setGlobalPolicy: (policy: GameState['players'][number]['policy']) => void;
  finishTurn: () => void;
  saveNow: () => void;
  saveInfo: () => SaveSummary;
}

let toastId = 1;

export const useGame = create<UiState>((set, get) => {
  const bump = (game: GameState) => {
    set({ game, rev: game.revision });
    saveGame(game);
  };

  const action = (gameAction: GameAction, success: string, sound: 'build' | 'claim' | 'research' | 'link' | null): boolean => {
    const game = get().game;
    if (!game) return false;
    const result = applyAction(game, 0, gameAction);
    if (!result.ok) {
      get().toast(result.reason, 'bad');
      audio.sfx('error');
      return false;
    }
    bump(game);
    get().toast(success, 'good');
    if (sound) audio.sfx(sound);
    return true;
  };

  return {
    screen: 'menu',
    game: null,
    rev: 0,
    selected: null,
    buildKind: null,
    linkSource: null,
    overlay: 'none',
    modal: null,
    summary: null,
    toasts: [],
    muted: false,
    focus: null,
    objectivesOpen: true,
    hover: null,

    startGame: (setup) => {
      const game = createGame({
        seed: setup.seed,
        size: setup.size,
        maxTurns: setup.maxTurns,
        playerName: setup.playerName,
        credits: setup.credits ?? BALANCE.startCredits,
      });
      const startTile = game.tiles.find((t) => t.structure?.kind === 'substation' && t.structure.owner === 0);
      set({
        game,
        rev: game.revision,
        screen: 'game',
        selected: startTile ? { x: startTile.x, y: startTile.y } : null,
        buildKind: null,
        linkSource: null,
        overlay: 'none',
        modal: null,
        summary: null,
        toasts: [],
        focus: startTile ? { x: startTile.x, y: startTile.y, nonce: Date.now() } : null,
      });
      saveGame(game);
      audio.resume();
      get().toast(`Welcome to ${game.players[0].corp}. Claim land, build power, turn watts into compute.`, 'info');
    },

    continueGame: () => {
      const game = loadGame();
      if (!game) {
        get().toast('No saved company found', 'bad');
        return;
      }
      const startTile = game.tiles.find((t) => t.structure?.kind === 'substation' && t.structure.owner === 0);
      set({
        game,
        rev: game.revision,
        screen: 'game',
        selected: startTile ? { x: startTile.x, y: startTile.y } : null,
        buildKind: null,
        linkSource: null,
        modal: null,
        summary: null,
        overlay: 'none',
        focus: startTile ? { x: startTile.x, y: startTile.y, nonce: Date.now() } : null,
      });
      audio.resume();
    },

    quitToMenu: () => {
      set({ screen: 'menu', modal: null, game: null, selected: null, buildKind: null, linkSource: null });
      audio.stopMusic();
    },

    select: (pos) => {
      set({ selected: pos, buildKind: null });
      if (pos) audio.sfx('click');
    },

    setHover: (pos) => set({ hover: pos }),

    setBuildKind: (kind) => {
      const current = get().buildKind;
      set({ buildKind: current === kind ? null : kind, linkSource: null });
    },

    setOverlay: (overlay) => {
      set({ overlay: get().overlay === overlay ? 'none' : overlay });
      audio.sfx('click');
    },

    setModal: (modal) => {
      set({ modal });
      if (modal) audio.sfx('click');
    },

    toggleObjectives: () => set({ objectivesOpen: !get().objectivesOpen }),

    toggleMute: () => {
      const muted = !get().muted;
      set({ muted });
      audio.setMuted(muted);
    },

    focusTile: (x, y) => set({ focus: { x, y, nonce: Date.now() } }),

    toast: (text, kind = 'info') => {
      const id = toastId++;
      set({ toasts: [...get().toasts.slice(-3), { id, text, kind }] });
      window.setTimeout(() => get().dismissToast(id), 4200);
    },

    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    handleTileClick: (pos, mods) => {
      const { game, buildKind, linkSource } = get();
      if (!game) return;
      const tile = tileAt(game, pos.x, pos.y);
      if (!tile) return;
      if (linkSource) {
        if (linkSource.x === pos.x && linkSource.y === pos.y) {
          set({ linkSource: null });
          return;
        }
        const legality = canLink(game, game.players[0], linkSource, pos);
        if (!legality.ok) {
          get().toast(legality.reason, 'bad');
          audio.sfx('error');
          return;
        }
        if (action({ type: 'link', ax: linkSource.x, ay: linkSource.y, bx: pos.x, by: pos.y }, 'Corridor energised', 'link')) {
          set({ linkSource: null });
        }
        return;
      }
      if (buildKind) {
        const legality = canBuild(game.players[0], tile, buildKind);
        if (!legality.ok) {
          get().toast(legality.reason, 'bad');
          audio.sfx('error');
          return;
        }
        if (action({ type: 'build', x: pos.x, y: pos.y, kind: buildKind }, `${STRUCTURES[buildKind].name} online`, 'build')) {
          set({ selected: pos, buildKind: null });
        }
        return;
      }
      if (mods.shift) {
        const legality = canClaim(game, game.players[0], tile);
        if (!legality.ok) {
          get().toast(legality.reason, 'bad');
          audio.sfx('error');
          return;
        }
        action({ type: 'claim', x: pos.x, y: pos.y }, 'Territory claimed', 'claim');
        set({ selected: pos });
        return;
      }
      set({ selected: pos });
      audio.sfx('click');
    },

    build: (kind) => {
      const { game, selected } = get();
      if (!game || !selected) return;
      const tile = tileAt(game, selected.x, selected.y);
      if (!tile) return;
      const legality = canBuild(game.players[0], tile, kind);
      if (!legality.ok) {
        get().toast(legality.reason, 'bad');
        audio.sfx('error');
        return;
      }
      if (action({ type: 'build', x: selected.x, y: selected.y, kind }, `${STRUCTURES[kind].name} online`, 'build')) {
        set({ buildKind: null });
      }
    },

    claim: () => {
      const { game, selected } = get();
      if (!game || !selected) return;
      const tile = tileAt(game, selected.x, selected.y);
      if (!tile) return;
      const wasNeutral = tile.structure?.owner === -1;
      const legality = canClaim(game, game.players[0], tile);
      if (!legality.ok) {
        get().toast(legality.reason, 'bad');
        audio.sfx('error');
        return;
      }
      action(
        { type: 'claim', x: selected.x, y: selected.y },
        wasNeutral ? 'Stranded substation captured' : 'Territory claimed',
        'claim',
      );
    },

    upgrade: () => {
      const { game, selected } = get();
      if (!game || !selected) return;
      const tile = tileAt(game, selected.x, selected.y);
      if (!tile) return;
      const legality = canUpgrade(game.players[0], tile);
      if (!legality.ok) {
        get().toast(legality.reason, 'bad');
        audio.sfx('error');
        return;
      }
      action({ type: 'upgrade', x: selected.x, y: selected.y }, 'Facility upgraded', 'build');
    },

    beginLink: () => {
      const { game, selected } = get();
      if (!game || !selected) return;
      const tile = tileAt(game, selected.x, selected.y);
      if (tile?.structure?.kind !== 'substation' || tile.structure.owner !== 0) {
        get().toast('Select one of your substations first', 'bad');
        return;
      }
      set({ linkSource: selected, buildKind: null });
      get().toast('Now click a second substation to energise the corridor', 'info');
    },

    cancelLink: () => set({ linkSource: null, buildKind: null }),

    research: (techId) => {
      action({ type: 'research', tech: techId }, 'Research complete', 'research');
    },

    setPolicy: (policy, pos) => {
      const { game } = get();
      if (!game) return;
      if (pos) {
        action({ type: 'policy', policy, x: pos.x, y: pos.y }, 'Operating policy updated', null);
      } else {
        get().setGlobalPolicy(policy);
      }
    },

    setGlobalPolicy: (policy) => {
      const game = get().game;
      if (!game) return;
      const result = applyAction(game, 0, { type: 'policy', policy });
      if (!result.ok) {
        get().toast(result.reason, 'bad');
        return;
      }
      bump(game);
      get().toast('Fleet policy updated', 'good');
    },

    finishTurn: () => {
      const game = get().game;
      if (!game || game.victory.over) return;
      const summary = endTurn(game);
      bump(game);
      set({ summary, modal: game.victory.over ? 'victory' : 'summary', selected: null, buildKind: null, linkSource: null });
      audio.sfx(game.victory.over ? 'victory' : 'turn');
    },

    saveNow: () => {
      const game = get().game;
      if (!game) return;
      saveGame(game);
      get().toast('Game saved', 'good');
    },

    saveInfo: () => saveSummary(),
  };
});

/** Wipe the save slot (used by the main menu's new game flow). */
export function resetSave(): void {
  clearSave();
}
