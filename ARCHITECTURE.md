# GRIDPOWER — Architecture

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 5.9, strict | The simulation is full of money/energy invariants; types catch most of them |
| UI | React 19 | Panels, modals and lists change constantly; declarative rendering keeps it maintainable |
| Build | Vite 7 | Fast dev server, simple production bundling, no runtime service |
| State | Zustand 5 | Tiny, no provider tree, easy to bridge to a mutable simulation |
| Simulation | Plain TypeScript modules | No DOM, no framework, deterministic and testable in Node |
| Rendering | Custom Canvas 2D isometric renderer | Full control over the art direction and animation, no engine dependency |
| Tests | Vitest | Same transform pipeline as the app; fast headless runs |
| Browser automation | Playwright (Chromium) | Real clicks, screenshots, save/reload validation |

There is no backend, no remote asset, no API key and no runtime network dependency. Fonts are bundled from `@fontsource-variable`.

## 2. Module map

```
src/engine
  types.ts          authoritative types (GameState, Tile, Player, reports, victory)
  config.ts         all balance and content data (structures, techs, weather, personas)
  rng.ts            serialisable xorshift stream, hashes, value noise, fBm
  worldgen.ts       terrain field → continents → biomes → rivers → starts → neutral hubs
  board.ts          pure geometry: tile lookup, neighbours, reveal, substation attachment
  progression.ts    tech modifiers, build/claim/link/upgrade legality and prices
  grid.ts           islands, min-cost-flow dispatch, stability, storage, projections
  markets.ts        weather, forecasts, events, price formulas
  actions.ts        the only mutation entry point (player and AI)
  simulation.ts     turn resolution, settlement, victory/score, turn advance
  ai.ts             utility planner for the three rival companies
  save.ts           versioned localStorage saves and defensive parsing
  headless.ts       complete AI-only match runner
src/render
  palette.ts        art direction constants
  art.ts            vector art for each structure
  renderer.ts       camera, projection, ground, borders, corridors, overlays, weather, effects
src/state/store.ts  UI state + action wrappers + autosave
src/ui/*            React HUD, inspector, modals, charts, minimap, icons
src/audio/audio.ts  WebAudio synthesis
```

Dependency direction is one-way: `engine` imports nothing from `render`, `ui` or `state`. `render` reads `engine` and `ui`; `ui` reads `engine` through the store. The engine can run in Node with no DOM.

## 3. State model and mutation discipline

`GameState` is a single mutable object tree: tiles, players, links, market, reports, history, log, victory, summary and an RNG cursor. There is exactly one authoritative copy.

- **All gameplay mutations go through `applyAction(state, playerId, action)`** for player and AI alike. It validates ownership, terrain, technology, adjacency, distance, capacity, cost and affordability, then mutates and increments `state.revision`.
- **Turn-level changes go through `resolveTurn` / `endTurn`**. They never come from React components.
- Rendering is read-only: the renderer never writes to the game state.
- `state.revision` is the invalidation token. UI panels subscribe to it and re-render; the projection cache and effect tracker key off it. The revision increments on every mutation.

`previewPlayer(state, playerId)` runs the full dispatch without side effects: it snapshots battery state of charge, dispatches, and restores the snapshot. This is how the HUD shows live projected power, compute, net income and market share before the turn is resolved, and how the AI plans.

## 4. Determinism

- Every random draw goes through the serialisable xorshift stored in `state.rng`. Map generation uses a separate holder seeded from the game seed.
- Map generation uses hash/value noise with the seed folded into the coordinates, not `Math.random`.
- AI decisions have no randomness; they derive from state, persona weights and deterministic candidate ordering.
- Weather is drawn from the previous turn's two-candidate forecast; events are drawn with weights through the same stream.
- The test suite resolves eight identical turns from two identical states and compares serialized state byte-for-byte.

`makeRng(holder)` advances `holder.rng`; because the cursor is part of the save, loading and continuing produces the same future as the original timeline.

## 5. Turn pipeline

`endTurn(state)`:

1. For each AI company, run one action phase (claims, builds, links, research, policies).
2. Dispatch every company against the current market signal: `powerPrice`, last `computePrice`, fuel multiplier.
3. Sum all compute; clear the market with `computePriceFor(demand, supply, base, eventMult)`.
4. Settle each company: compute revenue, power/flex revenue, imports, fuel, maintenance, credits, research, stats.
5. Apply event grants; update insolvency streaks.
6. Evaluate victory for every company (compute/energy/tech streaks, score at the horizon).
7. Write the turn history record and summary highlights.
8. If not over: advance the turn, tick events, draw the weather from the forecast, generate a new forecast, roll new events, grow demand, recompute the power price.
9. Increment the revision and return the summary.

The UI then opens the summary modal; the next turn's forecast is already in state.

### Dispatch details

For each island (`islandsOf`):

- Build a flow network: source, per-generator nodes, per-substation in/out gate nodes, per-compute load nodes, per-battery nodes, a sink.
- Generator → inlet edge capacity = available output, cost = marginal fuel cost (renewables 0.05, hydro 0.3, geothermal 0.4, battery 0.25, nuclear fuel ×1.2, gas fuel ×event multiplier).
- Substation gate capacity = throughput; corridors are two directed edges with line capacity and a tiny 0.04 cost.
- Load outlet edges carry the requested power; load → sink edges use a large negative cost so the algorithm prioritises serving compute over exports or cost minimisation.
- Imports are a source node per substation, capped at half throughput, priced at `spot × 1.6`.
- Solve with successive shortest augmenting paths using Bellman–Ford (graphs are tiny; negative sink costs are safe because load edges terminate at the sink).
- Read flows off the original edge capacities. Unused generation becomes surplus; batteries charge up to their rate and remaining storage, then the rest is exported up to the 140 MW player cap, and any remainder is curtailed.
- Stability is computed per island from firm capacity, import rights, battery availability, unserved load, congestion, technology and policy biases.

Serving load dominates the objective, but it is not free: imports are expensive and limited, so a constrained island throttles. This is what makes transmission upgrades and substation throughput feel meaningful.

## 6. AI

`runAiTurns` calls `takeTurn` per AI company. The planner is a prioritised utility loop with a 14-action budget:

1. Research the best affordable technology, weighted by persona bias, branch weight, tier and unlocks.
2. Link disconnected substations.
3. Cover real shortfalls, heavy imports or weak stability with generation or batteries.
4. Build a data center when average-weather headroom covers it and capital allows.
5. Keep at least one buildable land tile (claim when the usable free tiles run low).
6. Add storage for surplus or stability.
7. Build generation toward the next data center.
8. Claim valuable adjacent territory when capital is comfortably above the next build.
9. Add an R&D campus when research is slow.
10. Upgrade existing compute when unlocked.
11. Add a second substation when a hub saturates.
12. Build a resource outpost.
13. Spend surplus capital on generation rather than hoarding.

The AI uses `expectedGeneration` (average weather) for headroom planning, ignores current weather for capacity decisions, and uses `previewPlayer` to see its actual served load. It uses the same `applyAction` as the player, so every action is validated by the same rules. Tests check every AI structure sits on a tile owned by that AI and that full matches contain no illegal moves.

## 7. Rendering

`GridRenderer` owns a canvas, camera (`cx`, `cy`, `zoom`), pointer state and effect list.

- **Projection**: `wx = (x − y) × TW/2`, `wy = (x + y) × TH/2 − size × TH/2`; elevation lifts a tile by up to two steps. Screen = viewport centre + (world − camera) × zoom.
- **Inverse**: undo the map-centre offset, derive an approximate tile, then test a 5×5 neighbourhood by projecting each candidate and comparing the point against its diamond. This is robust to elevation and is covered by a browser round-trip check.
- **Depth**: tiles are sorted by `x + y`, then `y`; the same order draws ground, borders, rivers, corridors, structures and effects, so buildings correctly occlude what is behind them.
- **Ground**: two-tone diamonds with low-poly facets, elevation cliffs with strata, biome detail (grass, dunes, pines, snow caps, urban blocks, geothermal cracks, gas pipes), and continuous river polylines.
- **Fog**: unexplored land is shown as a muted biome silhouette with a cool veil and dashed outline; unexplored water stays water. Resource-specific details are hidden until surveyed. Structures and borders only render for revealed tiles.
- **Structures**: `art.ts` draws each kind from isometric prisms and custom details, with time-based animation (blades, fans, steam, LED activity, glints, state-of-charge bars), an ownership plinth and pennant, utilisation rings, and an off-grid cross.
- **Corridors**: three conductors with sag, a glow, load-based colour, animated dashes, and a pylon. Congestion is visible before it bites.
- **Effects**: construction rings and sparks when a structure appears; link rings when a corridor is energised.
- **Weather**: rain/snow particle systems, storm darkening, heat and night tints, plus a soft light/vignette pass for legibility.
- **Overlays**: power, compute, territory and sites, all driven by the live projection.

Performance: 400 tiles and ~150 structures render comfortably at 60 fps at 1440p. Projections are cached per `seed/revision/player`, so the renderer's per-frame `getPreview()` is a map lookup after the first call.

## 8. UI and store

`useGame` (Zustand) holds screen, the game reference, `rev`, selection, build mode, link source, overlay, modal, summary, toasts, mute, camera focus request, hover and tutorial state.

- Engine actions are wrapped in store methods (`claim`, `build`, `upgrade`, `research`, `finishTurn`, ...) that call `applyAction`, show a toast, play a sound, autosave and bump the revision.
- Components subscribe to `rev` as well as their data; the revision is used as a `data-rev` marker rather than a React `key`, so panels update without remounting and losing scroll/focus.
- `projection(game)` / `projectionFor(game, id)` cache dispatch previews per revision; the top bar, inspector, objectives and rivals all read from them.
- `saveGame` runs after every mutation and turn resolution. `loadGame` is defensive: it validates version, size and top-level shape before handing the object to the engine.
- The main menu offers "Continue" when a save exists. The pause menu can save, mute, open help, start a new company or quit.
- The dev build exposes `window.__gp = { useGame, renderer }` purely as a test seam for Playwright; it is excluded from the production build by `import.meta.env.DEV`.

## 9. Save format

A single JSON object in `localStorage` under `gridpower.save.v1`, plus a timestamp key. It contains the full `GameState`, including the RNG cursor, tile reveal masks, structures with battery state of charge and per-site policies, corridors, history, victory progress and AI memory. The parser rejects wrong versions, truncated tile arrays and non-object sections. The unit tests round-trip a state and compare the serialized output.

## 10. Testing and validation

- **25 Vitest tests** cover world determinism, start fairness, claim legality and escalation, construction rules and cost multipliers, PUE and load, dispatch priority, island merging, capacity limits, off-grid assets, battery conservation, research gating, all three victory paths, insolvency, score victory, save round-trips, turn determinism and AI legality across full matches.
- **Headless league** (`npm run sim`) runs complete matches in Node. A 40-turn, four-company match resolves in roughly 120–160 ms, which makes balance sweeps cheap.
- **Playwright e2e** (`npm run e2e`) drives the real UI: new game, canvas click selection, claim, build, eight-plus turns, opening the tech tree and buying a technology, save → reload → continue, then a full 40-turn campaign via the keyboard shortcut, plus a 1366×768 layout check.
- **Screenshots** (`npm run shots`) are captured from the running app at 1440×900.

## 11. Known architectural limits

- The power model is a linear flow approximation; it has no voltage/reactive power/frequency state. Stability is a designed abstraction, not a simulated dynamic.
- The AI is greedy with a fixed budget and no search; it can overbuild generation and does not coordinate with itself.
- The renderer draws at most a few hundred structures and is not designed for thousands of tiles; a 24×24 map is the practical maximum.
- State is intentionally mutable for performance and simplicity; the single-entry-point discipline (`applyAction` / `resolveTurn`) is what keeps it safe.
