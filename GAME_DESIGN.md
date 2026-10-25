# GRIDPOWER — Game Design

## 1. Fantasy and pillars

You are the founder of an AI infrastructure company during a compute boom. Land is cheap, electricity is the binding constraint, and the world will pay for tokens. The game is about the physical supply chain of intelligence: **watts → transmission → cooling → compute → revenue**, and about the fact that every one of those links is contestable.

Four 4X pillars map directly onto the subject:

- **Explore** — the map starts fogged. Claims reveal two tiles around them; the starting survey reveals a radius of four. Resource fields, metro districts, rivers and mountain passes make some regions decisively better than others.
- **Expand** — claims must border your territory and rise in price with every claim (`$30 + $13 × claims`). Land is the long-run limit on fleet size.
- **Exploit** — power generation, transmission corridors, storage, compute efficiency and operating policies all convert capital into cash flow. The shared compute market means your own expansion lowers the price you sell at.
- **Exterminate / compete** — competition is territorial (contested tiles and neutral substations), economic (market share, cheaper capital) and infrastructural (corridors and chokepoints). There are no soldiers and no direct attacks.

The intended feeling: a miniature industrial diorama where the player can see the whole machine — the sun hitting the panels, the line loading up, the racks glowing, the price falling.

## 2. Turn loop

Each turn is one operating period.

1. Review the previous summary, forecasts, prices and objectives.
2. Claim land.
3. Build and upgrade generation, storage, substations, corridors and data centers.
4. Spend research points in the tech tree.
5. Set fleet or per-site operating policies.
6. End the turn. **Rivals act first**, using the same action API as the player.
7. Resolution: weather, dispatch, storage, compute, market clearing, revenue, stability, events, victory checks.
8. The turn summary opens; the next turn's weather forecast and events are already visible.

The player can complete two or three meaningful actions on turn one and roughly four to eight in the midgame. Early turns take about 30–60 seconds; the midgame 1–2 minutes. A standard 20×20, 40-turn campaign runs 45–90 minutes.

## 3. World and terrain

Maps are seeded and generated from a low-frequency continent field, then smoothed to remove one-tile islands and lakes. Biomes are classified by quantiles so every seed has roughly 20% desert, 32% forest, 12% mountains and the rest plains and coast. Rivers are carved downhill from ridges; geothermal fields sit at mountain feet; gas basins occupy sedimentary lowlands; metro clusters sit on flat ground. Four starts are selected by farthest-point sampling over high-quality tiles, with a hard minimum spacing and a guaranteed contiguous landmass.

| Terrain | Solar | Wind | Cooling | Compute | Build cost | Notes |
|---|---:|---:|---:|---:|---:|---|
| Plains | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | Balanced |
| Coast | 0.92 | 1.22 | 0.92 | 1.03 | 1.00 | Sea-water cooling, offshore wind |
| Forest | 0.72 | 0.90 | 0.99 | 1.00 | 1.12 | Slower construction, weak sun |
| Desert | 1.20 | 0.82 | 1.08 | 0.98 | 1.08 | Best solar, worst cooling |
| Mountain | 0.80 | 1.35 | 0.93 | 1.00 | 1.25 | Wind ridge, costly corridors |
| River | 0.95 | 1.00 | 0.95 | 1.02 | 1.00 | Hydro sites, good cooling |
| Geothermal | 1.00 | 0.95 | 0.96 | 1.00 | 1.05 | Only place for geothermal plants |
| Urban | 0.90 | 0.85 | 1.05 | 1.08 | 0.95 | Fibre-dense metro, hotter air |
| Basin | 0.95 | 1.00 | 1.02 | 1.00 | 0.95 | Gas turbines run 15% hotter |
| Ocean | — | — | — | — | — | Buildable: nothing |

Cooling multiplies PUE; compute multiplies data center output. Terrain is therefore a genuine siting decision, not decoration.

## 4. Resources and the core formulas

**Credits ($)** are the only spendable currency. **Electricity (MW)** is a flow, not a stock. **Compute (CU)** is the product sold each turn. **Research (RP)** is banked and spent on technologies. **Grid stability** is a per-island reliability score.

### Data centers

```
effective PUE = base PUE × terrain cooling × weather cooling × tech PUE modifiers
requested power = IT MW × effective PUE × policy utilisation × load modifiers
compute = (delivered MW / PUE) × compute per MW × compute modifiers × terrain compute bonus
```

A site only produces when it receives power. If its substation island cannot supply it, the shortfall is either imported at a premium or the racks throttle. Stability below 50/35/20% multiplies compute by 0.92/0.80/0.60 respectively.

| Facility | Cost | IT | PUE | CU/MW | Upkeep | RP/turn | Unlock |
|---|---:|---:|---:|---:|---:|---:|---|
| Edge Data Center | $1,100 | 14 MW | 1.42 | 1.00 | $12 | 8 | start |
| Hyperscale Campus | $3,000 | 46 MW | 1.30 | 1.06 | $45 | 22 | Advanced Cooling |
| AI Gigafactory | $7,500 | 130 MW | 1.20 | 1.14 | $130 | 60 | Next-Gen AI Factories |

Upgrades pay the difference in cost (with a 10% discount) and keep the site policy.

A typical edge site on plains in clear weather draws ~20 MW, produces 14 CU and nets about $100–$180 per turn depending on the compute price, the power source and maintenance. Efficiency technologies are what turn a marginal site into a compounding one.

### Generation

| Facility | Cost | MW | Upkeep | Fuel | Unlock |
|---|---:|---:|---:|---:|---|
| Solar Farm | $700 | 16 | $3 | — | start |
| Wind Turbine | $780 | 15 | $3.5 | — | start |
| Gas Turbine | $950 | 38 | $7 | $3.0/MW | start |
| Hydro Dam | $1,150 | 30 | $8 | — | Hydropower |
| Geothermal Plant | $2,200 | 44 | $15 | — | Enhanced Geothermal |
| Nuclear Reactor | $3,800 | 85 | $30 | $0.5/MW | Advanced Nuclear |

Solar output is `16 × terrain solar × weather solar`; wind is `15 × terrain wind × weather wind`; hydro responds to rain; gas is dispatchable at its fuel price; geothermal and nuclear ignore weather. Gas is the only source whose output can be called on without weather risk, which makes fuel spikes a real event.

### Batteries

Battery banks are 24 MW / 48 MWh with a 90% round trip and $800 capex. They charge from surplus generation (after load) and discharge into the min-cost dispatch, which prices their energy at $0.25/MW — above free renewables, below gas. They earn no explicit arbitrage revenue; their value shows up as avoided imports, additional served compute and flexibility payments. Charge is conserved every turn and clamped to capacity.

### Operating policies

| Policy | Utilisation | Effect |
|---|---:|---|
| Maximize Compute | 100% | Maximum CU, lowest reserve, −2 stability per site |
| Maximize Profit | 70–100% | Throttles when power is expensive relative to compute |
| Minimize Energy Cost | 78% | Much lower draw, fewer CU |
| Grid Flexible | 86% | Flexibility income; +3 stability per site |
| Reliability First | 94% | +5 stability per site |

Flexibility income is `IT MW × 1.6 × flexibility tech multiplier × event multiplier`. During a Grid Emergency event the event multiplier is 3.4×, which is the single largest spike in the game.

## 5. Grid and transmission

Each player's electrical network is a graph of substations connected by built corridors.

- An asset joins a substation island if it is within **3 tiles** (Manhattan) of one of the player's substations.
- A corridor can join two substations up to **7 tiles** apart (9 with Grid Interconnection). Its cost is `$40 + $20 × distance × corridor terrain multiplier`; mountains are expensive.
- Base line capacity is 160 MW (multiplied by High-Voltage Transmission, Smart Grid Dispatch and Grid Interconnection).
- Base substation throughput is 140 MW (×1.4 with Modular Substations). This is the hub bottleneck.
- Import rights are half of throughput per substation, priced at `spot × 1.6`; exports earn `spot × 0.5` and are capped at 140 MW per player per turn.

Dispatch inside each island is solved as a **min-cost max-flow** problem: source → generators (capacity = output, cost = marginal fuel), generators → substation inlets, substation gates (throughput), corridors (capacity, bidirectional), outlets → loads (capacity = requested power), loads → sink (with a large negative cost so serving compute dominates the objective). Imports enter at their substation at the import price. The solver returns per-generator dispatch, per-site delivery, imports and line flows. Unused potential becomes surplus for batteries and exports; the remainder is curtailed.

This model produces the important behaviours without pretending to be an AC solver:

- Cheap renewable output stranded on a disconnected island is worthless.
- A corridor at capacity creates congestion, raises stability penalties and forces imports.
- A single substation saturates at 140 MW; players need a second hub or modular substations.
- Battery discharge participates in the same merit order as generators.

**Grid stability** per island:

```
reserve = max(0, firm capacity + battery rate + import rights − served) / served
stability = 62 + 34 × min(1, reserve / 0.35)
          − 22 × unserved share
          − 14 × congested corridor share
          + tech stability + policy bias + event penalties
```

Firm capacity means gas, hydro, nuclear, geothermal and batteries; solar and wind do not count toward reserves, which is why a solar-only grid can be profitable but fragile. Stability is clamped to 0–100 and the player's reported stability is the minimum across islands.

## 6. Markets, weather and events

Weather is drawn from ten states with weights. Each turn shows the **next** turn's forecast as two weighted candidates; the actual weather is drawn from that pair, so the forecast is honest.

| Weather | Solar | Wind | Cooling | Hydro | Power price | Weight |
|---|---:|---:|---:|---:|---:|---:|
| Clear Skies | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 24 |
| High Pressure | 1.22 | 0.88 | 1.04 | 0.95 | 0.96 | 14 |
| Heatwave | 1.12 | 0.75 | 1.14 | 0.90 | 1.22 | 9 |
| Overcast | 0.52 | 1.06 | 0.98 | 1.00 | 1.04 | 10 |
| Gale Front | 0.94 | 1.38 | 1.02 | 1.05 | 0.90 | 10 |
| Storm Cell | 0.34 | 1.50 | 0.96 | 1.18 | 1.28 | 6 |
| Rain Belt | 0.58 | 1.12 | 0.95 | 1.28 | 0.98 | 10 |
| Cold Snap | 0.86 | 1.10 | 0.90 | 0.95 | 1.25 | 8 |
| Wind Drought | 1.06 | 0.30 | 1.05 | 0.86 | 1.10 | 6 |
| Clear Night | 0.12 | 0.95 | 0.94 | 1.00 | 1.06 | 3 |

**Power spot price** = `$5.00 × weather multiplier × event multiplier × (1 + 0.008 × (turn − 1))`. Import and export prices apply the 1.6× and 0.5× factors above.

**Compute clearing price**:

```
ratio = fleet supply / demand
price = $24 × clamp(1.12 / (0.6 + 0.8 × ratio), 0.3, 1.3) × event multiplier
demand = 220 × 1.026^(turn − 1)
```

At low supply the price is capped at 130% of base; at 2× oversupply it falls to roughly 50%. Every company sells at the same price, so expanding supply is a strategic act against rivals as well as an investment.

Eight event types appear with weighted probability (0–2 per turn, lasting one or two turns): AI Demand Boom, Compute Glut, Solar Oversupply, Fuel Price Spike, Grid Emergency, Talent Boom, Compute Subsidy, Regulatory Review. Each modifies price, output, stability, research or flexibility.

## 7. Technology tree

Twenty-one technologies, four branches, four tiers. Costs scale with fleet size (up to 2×) so late research remains a choice. Major unlocks are gates, not just multipliers.

| Branch | Tier | Tech | Base RP | Requires | Effect |
|---|---:|---|---:|---|---|
| Compute | 1 | Efficient GPUs | 105 | — | +8% compute |
| Compute | 2 | Advanced Cooling | 190 | Efficient GPUs | −6% PUE, Hyperscale |
| Compute | 3 | Liquid Cooling | 330 | Advanced Cooling | −8% PUE |
| Compute | 3 | AI Accelerators | 350 | Efficient GPUs | +10% compute |
| Compute | 4 | Next-Gen AI Factories | 560 | Liquid Cooling, AI Accelerators | +6% compute, Gigafactory |
| Energy | 1 | Hydropower Engineering | 170 | — | Hydro dams |
| Energy | 1 | Improved Solar Cells | 130 | — | +15% solar |
| Energy | 2 | Advanced Wind Turbines | 165 | Improved Solar | +15% wind |
| Energy | 2 | High-Density Batteries | 220 | Hydropower | Batteries |
| Energy | 2 | Smart Grid Dispatch | 250 | Batteries | +10% line capacity, +8 stability |
| Energy | 3 | Enhanced Geothermal | 350 | Improved Solar | Geothermal plants |
| Energy | 4 | Advanced Nuclear | 500 | Batteries | Nuclear, +6 stability |
| Optimization | 1 | GPU Power Management | 130 | — | −4% load, +6% compute |
| Optimization | 2 | Workload-Aware Scheduling | 220 | GPU Power Management | +35% flexibility revenue |
| Optimization | 3 | Adaptive Inference | 310 | Workload Scheduling | +8% compute, +6 stability |
| Optimization | 3 | Demand Response | 280 | Workload Scheduling | +45% flexibility revenue |
| Optimization | 4 | Autonomous Fleet Optimization | 640 | Adaptive Inference, Demand Response | +15% compute, +10 stability, Technology victory |
| Infrastructure | 1 | High-Voltage Transmission | 120 | — | +60% line capacity |
| Infrastructure | 2 | Modular Substations | 220 | High-Voltage Transmission | +40% substation throughput, −10% cost |
| Infrastructure | 3 | Grid Interconnection | 350 | High-Voltage Transmission | +2 corridor range, +25% capacity |
| Infrastructure | 4 | Advanced Grid Operations | 450 | Grid Interconnection, Smart Grid Dispatch | +12 stability, +5% generation |

A normal 40-turn game yields 10–16 technologies for a well-run company; the full tree is intentionally out of reach.

## 8. Rival companies

All three use the same action rules as the player: no cheating, no free resources.

**Helios Energy** — renewable developer. Weights generation 1.5, expansion 1.25; researches solar, wind, hydro, geothermal. Floods cheap power onto the map and builds compute when the power is already paid for. Tends to end with many solar farms and a strong credit balance.

**Titan Compute** — hyperscaler. Weights compute 1.6; builds data centers first and fills the grid afterwards. Runs a maximize-compute policy, accepts imports, and grows the largest fleet if it survives stability pressure.

**Volt Dynamics** — grid operator. Weights storage 1.7, flexibility 1.9 and grid 1.6. Builds batteries and substations, uses grid-flexible and reliability policies, researches demand response and smart dispatch. Its goal is to make everyone else's reliability its revenue.

The AI evaluates, each action phase, a small set of goals in order: research, reconnect, cover shortfall, add compute, add storage, claim land, add research, upgrade, add a hub, outpost, or build ahead of demand. It uses a planning generation figure that ignores current weather so it does not panic-build solar at night. It reserves capital for the next meaningful asset instead of spending every credit on claims.

AI action costs are bounded: each company gets up to 14 actions per turn, and all three rivals act in a few milliseconds.

## 9. Victory

- **Compute dominance** — hold at least 45% of the shared compute market for 3 consecutive turns.
- **Energy empire** — 600 MW of firm capacity, every island at 70% stability, and $9,000 in the bank, held for 3 turns.
- **Technology leadership** — complete Autonomous Fleet Optimization and sustain 220 CU at a fleet efficiency of at least 1.30 CU/MW for 2 turns.
- **Score** — at turn 40 the highest empire score wins: `total compute × 1.6 + firm MW × 1.4 + techs × 70 + credits × 0.02`.
- **Insolvency** — three consecutive turns below −$2,000 ends a company. For the human, that is a defeat; for a rival, its assets are liquidated and its land freed.

All three main paths are checked in the engine tests. In automated all-AI leagues most games end on score because the rivals are balanced against each other; focused human play can close out compute or technology earlier.

## 10. Onboarding and interface intent

The game never front-loads a tutorial. Instead:

- Turn one begins with a short mission toast and a "Next moves" card that updates with the most useful three actions for the current state (claim a tile, cover a shortfall, build a second generator, spend RP, merge islands, capture a neutral hub, store surplus, stabilise the grid).
- The right-side inspector explains every structure's numbers in plain language, with live projections, legality reasons and costs.
- The build palette only shows structures the terrain can host, and disables those you cannot afford, with a hover reason.
- The help panel explains the loop, the five resources, and the controls in one screen.
- Contextual warnings surface in the turn summary (imports above 20% of load, stability under 50%, operating losses).

The UI uses a dark navy glass panel system, one accent per resource, a compact top bar, a contextual bottom build palette, and four map layers. All numbers are formatted compactly ($1.2k, 48 MW, 23%) so the state of a 40-turn empire stays readable.

## 11. Presentation

- Custom isometric Canvas 2D renderer with depth-sorted tiles, elevation cliffs, continuous rivers, low-poly facets, and an outer sea frame.
- Hand-authored vector art for all twelve structures: blade rotation, cooling fans, steam, solar glints, battery state-of-charge LEDs, server activity lights, transformer insulators, pennants in each company's colour, and utilisation rings.
- Transmission corridors are drawn as three conductors with animated flow, pylons and congestion colouring.
- Construction and new corridors spawn expanding energy rings; every new asset gets a faint ownership plinth.
- Weather is visible: rain streaks, snow, heat shimmer, night tint, storm darkening.
- Sound is synthesized with WebAudio: UI clicks, construction thumps, claim arpeggios, research chimes, corridor energising, error buzz, victory fanfare, and a slow ambient chord bed with a toggle.
- Map layers: power (island stability tint), compute (utilisation), territory (ownership), and sites (resource value).
- A minimap, victory progress, market forecast, event log, rival comparison, company report, and animated turn summary.

## 12. Deliberate trade-offs

- **Compute is the product, power is the constraint.** Power is cheap relative to compute, so the interesting question is not "is electricity expensive?" but "can I get enough of it to the racks, and at what reliability?"
- **No hard blackouts.** Shortfalls are served by imports at a premium and throttling, with stability penalties. This keeps a struggling player in the game and makes the import price a strategic lever.
- **No military units.** Competition is land, infrastructure and market share — closer to the brief and much easier to read on a map.
- **Deterministic events and combat-free resolution** make it possible to save, replay a seed, and test thousands of turns quickly.
- **One difficulty.** Personalities create asymmetric play without a menu of multipliers.
