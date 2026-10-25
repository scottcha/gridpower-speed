# GRIDPOWER — Balance

All tunable values live in `src/engine/config.ts`. This document records the shipped numbers, the economic reasoning behind them, and what ten complete simulated matches actually did.

Units: a turn is one operating period. Generation and load are average **MW** over that period. Battery capacity is stored as MW-periods and displayed as **MWh**. All money is in credits ($).

## 1. Starting position

| | |
|---|---|
| Treasury | $1,100 |
| Research | 10 RP |
| Assets | 1 substation, 1 solar farm (16 MW), 1 edge data center (14 MW IT, PUE 1.42) |
| Territory | 5 tiles |
| Survey | radius 4 |
| Powers | all start with 2 free buildable tiles and 8 RP/turn from the edge site |

The starter site draws about 20 MW; the starter solar farm supplies roughly 15 MW in average weather, so the first turn imports 4–6 MW at $8/MW and still nets about $250–$350. That is the first lesson: compute is worth more than electricity, but owning generation is worth much more than importing it.

## 2. Structure economics

| Structure | Cost | Capacity | Upkeep/turn | Fuel | Notes |
|---|---:|---|---:|---:|---|
| Solar Farm | $700 | 16 MW | $3 | — | 0.72–1.20 terrain factor; weather-driven |
| Wind Turbine | $780 | 15 MW | $3.5 | — | 0.82–1.35 terrain; strongest on ridges/coast |
| Gas Turbine | $950 | 38 MW dispatchable | $7 | $3.0/MW | +15% on gas basins |
| Hydro Dam | $1,150 | 30 MW firm | $8 | — | rivers only; rain bonus |
| Geothermal Plant | $2,200 | 44 MW firm | $15 | — | geothermal fields only |
| Nuclear Reactor | $3,800 | 85 MW firm | $30 | $0.5/MW | large, stable, capital-hungry |
| Battery Bank | $800 | 24 MW / 48 MWh | $4 | — | 90% round trip |
| Substation | $320 | 140 MW throughput | $3 | — | 3-tile attachment radius |
| Transmission corridor | $40 + $20/tile × terrain | 160 MW | $0.8 | — | max 7 tiles, 9 with tech |
| Edge Data Center | $1,100 | 14 MW IT, PUE 1.42 | $12 | — | 1.00 CU/MW |
| Hyperscale Campus | $3,000 | 46 MW IT, PUE 1.30 | $45 | — | 1.06 CU/MW |
| AI Gigafactory | $7,500 | 130 MW IT, PUE 1.20 | $130 | — | 1.14 CU/MW |
| R&D Campus | $800 | 18 RP/turn | $6 | — | research engine |

Claims cost `$30 + $13 × claims`. Capturing a neutral substation costs a flat $160.

### Payback examples

- An edge site with self-generated solar: revenue 14 CU × $24 = $336, upkeep $12, marginal power near zero → about $320/turn, 3.4-turn payback when the power is already built. If it must import 20 MW at $8, it nets ~$165 and takes 6.7 turns.
- A solar farm replacing imports saves 16 MW × $8 = $128/turn, so a $700 build pays back in 5.5 turns; it also adds stability to a solar-heavy fleet's daytime margin.
- A gas turbine (38 MW) displaces up to $304 of imports, costs $114 in fuel and $7 upkeep, so it earns ~$180/turn when it is actually needed and is a poor buy when it is not.
- A battery discharges 24 MW into load, avoiding $192 of imports per full cycle, and charges from otherwise-curtailed surplus. Its $800 cost is usually repaid in 4–6 turns of peaking duty, and faster during grid emergencies.
- A hyperscale campus needs ~60 MW, which is roughly four solar farms or one gas turbine plus storage. The combination (campus + firm power) is the standard midgame growth unit.

## 3. Market formulas

**Power spot** = `$5.00 × weather power multiplier × event multiplier × (1 + 0.008 × (turn − 1))`.
Import = spot × 1.6. Export = spot × 0.5. Import rights = half substation throughput per substation. Export cap = 140 MW per company per turn.

**Compute clearing price** = `$24 × clamp(1.12 / (0.6 + 0.8 × supply/demand), 0.3, 1.3) × event multiplier`.
**Demand** = `220 × 1.026^(turn − 1)` CU.

| Supply / demand | Price at base $24 |
|---|---:|
| 0.25 | $31.20 (cap) |
| 0.50 | $26.67 |
| 1.00 | $20.36 |
| 1.50 | $15.55 |
| 2.00 | $12.52 |
| 3.00 | $9.02 |

A 40-turn standard game reaches roughly 600–750 CU of demand. Four companies producing ~150–250 CU each oversupply the market, which is why the late game compresses margins and why efficiency technologies (compute per MW) matter more than raw capacity.

## 4. Research pacing

Tier 1 technologies cost 105–170 RP, tier 2 165–250, tier 3 280–350, tier 4 450–640. The cost scales up to 2× with cumulative compute, so a large fleet pays more per technology.

- The starting edge site yields 8 RP/turn. Without a lab, the first technology lands around turn 12.
- An R&D campus ($800) adds 18 RP/turn and is the single biggest accelerator of the tech tree.
- A 40-turn game with 2–3 campuses and a growing compute fleet produces 10–16 technologies. The full 21-tech tree is intentionally not affordable in one run.

## 5. Victory thresholds

| Path | Threshold | Held |
|---|---|---|
| Compute dominance | ≥ 45% of shared compute | 3 turns |
| Energy empire | 600 MW firm, every island ≥ 70% stability, ≥ $9,000 | 3 turns |
| Technology leadership | Autonomous Fleet + ≥ 220 CU at ≥ 1.30 CU/MW fleet efficiency | 2 turns |
| Score | Highest `compute × 1.6 + firm MW × 1.4 + techs × 70 + credits × 0.02` | turn 40 |
| Insolvency | below −$2,000 | 3 turns |

Firm capacity counts gas, hydro, nuclear, geothermal and battery discharge; solar and wind do not provide reserves. This is what makes the energy path a real strategy rather than "build the most solar".

## 6. Ten-match league

Command: `npm run sim -- seeds=10 turns=40 size=20 base=3000`. All four seats are AI-controlled so the match is symmetric; the human seat is labelled "Lumen Grid" and uses the Helios persona in the harness.

| Seed | Result | Winner | Turns |
|---:|---|---|---:|
| 3000 | Score | Titan Compute | 40 |
| 3007 | Compute dominance | Titan Compute | 37 |
| 3014 | Score | Helios Energy | 40 |
| 3021 | Compute dominance | Volt Dynamics | 36 |
| 3028 | Compute dominance | Volt Dynamics | 30 |
| 3035 | Score | Helios Energy | 40 |
| 3042 | Score | Helios Energy | 40 |
| 3049 | Score | Titan Compute | 40 |
| 3056 | Score | Titan Compute | 40 |
| 3063 | Score | Titan Compute | 40 |

Aggregates:

| Metric | Value |
|---|---:|
| Matches | 10 |
| Average turns | 38.2 |
| Average runtime per match | 134 ms |
| Average winner compute | 604 CU |
| Average leader treasury | $18,747 |
| Average structures on the map | 145 |
| Average technologies per company | 11.5 |
| Score victories | 7 |
| Compute victories | 3 |
| Crashes / stalls / runaway resources | 0 |

Win split: Titan Compute 5 (4 score, 1 compute), Helios Energy 3 (score), Volt Dynamics 2 (compute). The fourth seat uses the Helios persona and did not win this set.

These numbers were produced on the shipped build, including the 600 MW / $9,000 energy threshold and the start-asset terrain guarantee.

**Interpretation.** Titan's compute-first strategy is the most consistent in symmetric AI play; Volt's storage/flexibility plan converts early market share into two compute wins; Helios survives to the score finish with the largest generation fleet. The AI league does not produce energy or technology victories because those require a deliberate multi-turn commitment that the heuristic planner does not pursue opportunistically — both are checked by engine tests and are reachable for a focused human. The variety of endings and the absence of crashes, stalls or runaway treasuries made this set the shipping balance.

## 7. What changed during tuning

The first builds looked reasonable on paper and failed in simulation. The important corrections:

1. **Generation became a better deal than compute.** The first AI league stalled at 15 CU while companies piled up solar farms. Edge data centers originally cost $1,600–$10,500; generation paid back faster than compute. Data centers were cut to $1,100 / $3,000 / $7,500 and power prices rebalanced (spot $8.10 → $5.00, import uplift 1.12 → 1.6, export haircut 0.62 → 0.5) so owning generation is valuable but compute is the product.
2. **The AI starved itself on claims.** Every credit went into cheap adjacent tiles, so nobody could afford a data center. Claims are now capped at two per turn and only happen when capital is 1.35× the next build.
3. **The AI panic-built solar at night**, because headroom was computed from instantaneous weather. Planning now uses average-weather generation; dispatch still uses the real weather.
4. **Unusable terrain could deadlock a company** (two free river tiles and no hydro technology). Build legality is now part of the planner's tile choice, and river tiles can host edge sites and substations.
5. **Battery charging was undercounted** because surplus was measured from dispatched generation rather than available generation. Charging, exports and curtailment now account for un-dispatched potential.
6. **Maps were noisy specks of land** because ocean was guessed per tile. Continents now come from one low-frequency field, smoothed over three passes, with biomes classified by quantiles and starts chosen by farthest-point sampling. This fixed both fairness and the "washed out" look.
7. **Research was simultaneously too cheap late and too slow early.** Tier costs were raised roughly 50%, size scaling was raised to 2×, and R&D campuses were priced at $800 / 18 RP so the early choice is real.
8. **Energy victory was unreachable in practice.** The threshold moved from 700 MW / $12,000 to 600 MW / $9,000.

## 8. Balance risks and knobs

Known tensions, and where to change them:

| Risk | Knob |
|---|---|
| Late-game treasuries grow faster than useful builds | `BALANCE.computeBase`, `demandGrowth`, structure maintenance, tech size scaling |
| Compute dominance is rare among four equal AIs | `victory.computeShare` (45%) and `computeTurns` |
| Titan's compute-first opening is strongest in AI play | Titan weights in `PERSONAS`, edge site cost, import price |
| Solar remains the default first build | solar cost/output, gas fuel, battery cost |
| Corridors are easy to ignore | line cost, substation throughput, congestion penalty |
| An R&D campus is almost always correct | lab cost/RP, DC research generation, tech costs |
| Importing is viable without generation | `importUplift`, import rights, substation throughput |

## 9. Strategy notes

- **Own your power.** Importing 20 MW costs ~$160/turn; a $700 solar farm plus a battery removes most of it and supports the next data center.
- **Firm beats cheap when stability matters.** Solar-heavy fleets have high daytime output and low reserves; gas, hydro, geothermal and batteries are what keep compute online through heatwaves and nights.
- **Read the forecast.** A Clear Night or Wind Drought is visible one turn ahead. Charge batteries, bring gas online, or lower utilisation before it arrives.
- **Compute efficiency compounds.** Each PUE and CU/MW technology multiplies every site you already own. A 20% efficiency gain on a 500 CU fleet is worth more than another 30 MW of generation.
- **Flexibility is event-driven.** Grid Flexible sites earn modest steady income and very large payments during Grid Emergencies. Pair them with Demand Response.
- **Land is the long-run constraint, not credits.** Claims get expensive, and every site needs a tile. Twenty-five to thirty claims is a typical strong game.
- **Expand the market carefully.** Your own compute lowers the clearing price for everyone, including you. Selling 600 CU into 600 CU of demand is much less profitable per unit than selling 300 CU into 500 CU of demand.
