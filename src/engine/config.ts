/** Central balance sheet. Every tunable number lives here. */
import type { Policy, StructureKind, Terrain, TechDef, WeatherDef, Persona } from './types';

export interface TerrainDef {
  id: Terrain;
  name: string;
  blurb: string;
  land: boolean;
  /** Solar / wind output multipliers. */
  solar: number;
  wind: number;
  /** Multiplies PUE: <1 means better (cheaper) cooling. */
  cooling: number;
  /** Multiplies compute output: urban districts are fibre-dense. */
  compute: number;
  /** Construction cost multiplier. */
  buildCost: number;
  /** Transmission line cost multiplier. */
  lineCost: number;
}

export const TERRAINS: Record<Terrain, TerrainDef> = {
  ocean: { id: 'ocean', name: 'Open Water', blurb: 'Cable routes only. Nothing can be built here.', land: false, solar: 0, wind: 0, cooling: 1, compute: 0, buildCost: 99, lineCost: 99 },
  coast: { id: 'coast', name: 'Coast', blurb: 'Sea-water cooling cuts PUE; strong offshore wind.', land: true, solar: 0.92, wind: 1.22, cooling: 0.92, compute: 1.03, buildCost: 1, lineCost: 1.1 },
  plains: { id: 'plains', name: 'Plains', blurb: 'Cheap to develop. Balanced solar and wind.', land: true, solar: 1, wind: 1, cooling: 1, compute: 1, buildCost: 1, lineCost: 1 },
  forest: { id: 'forest', name: 'Forest', blurb: 'Slower construction and weaker sun, but cooler air.', land: true, solar: 0.72, wind: 0.9, cooling: 0.99, compute: 1, buildCost: 1.12, lineCost: 1.25 },
  desert: { id: 'desert', name: 'Desert', blurb: 'Best solar in the world — and the worst cooling.', land: true, solar: 1.2, wind: 0.82, cooling: 1.08, compute: 0.98, buildCost: 1.08, lineCost: 1.1 },
  mountain: { id: 'mountain', name: 'Mountain', blurb: 'Wind ridge. Cold air helps cooling, but lines are costly.', land: true, solar: 0.8, wind: 1.35, cooling: 0.93, compute: 1, buildCost: 1.25, lineCost: 1.6 },
  river: { id: 'river', name: 'River', blurb: 'The only place for hydro dams. Excellent cooling.', land: true, solar: 0.95, wind: 1, cooling: 0.95, compute: 1.02, buildCost: 1, lineCost: 1.15 },
  geothermal: { id: 'geothermal', name: 'Geothermal Field', blurb: 'Drill here for firm, weather-proof baseload.', land: true, solar: 1, wind: 0.95, cooling: 0.96, compute: 1, buildCost: 1.05, lineCost: 1.2 },
  urban: { id: 'urban', name: 'Urban District', blurb: 'Fibre, customers and permits. Compute runs 8% hotter here.', land: true, solar: 0.9, wind: 0.85, cooling: 1.05, compute: 1.08, buildCost: 0.95, lineCost: 0.85 },
  basin: { id: 'basin', name: 'Gas Basin', blurb: 'Pipeline access: gas turbines run 15% hotter here.', land: true, solar: 0.95, wind: 1, cooling: 1.02, compute: 1, buildCost: 0.95, lineCost: 1 },
};

export interface StructureDef {
  kind: StructureKind;
  name: string;
  short: string;
  category: 'generation' | 'storage' | 'network' | 'compute' | 'research';
  cost: number;
  maintenance: number;
  requires: string | null;
  /** Nameplate MW (generation), throughput MW (substation), or IT MW (compute). */
  mw: number;
  /** Fuel cost per dispatched MW. */
  fuel?: number;
  /** Base PUE for compute assets. */
  pue?: number;
  /** Compute units per MW of IT power. */
  eff?: number;
  /** Research per turn. */
  rp?: number;
  /** Battery energy capacity in MW-turns. */
  storage?: number;
  /** Battery charge/discharge rating in MW. */
  rate?: number;
  terrains: Terrain[];
  blurb: string;
  effect: string;
}

const ALL_LAND: Terrain[] = ['plains', 'coast', 'forest', 'desert', 'river', 'geothermal', 'urban', 'basin'];

export const STRUCTURES: Record<StructureKind, StructureDef> = {
  solar: {
    kind: 'solar', name: 'Solar Farm', short: 'Solar', category: 'generation', cost: 700, maintenance: 3, requires: null,
    mw: 16, terrains: ['plains', 'coast', 'forest', 'desert', 'urban', 'basin'],
    blurb: 'The cheapest megawatt you can buy — when the sun cooperates.', effect: '16 MW × sun × terrain',
  },
  wind: {
    kind: 'wind', name: 'Wind Turbine', short: 'Wind', category: 'generation', cost: 780, maintenance: 3.5, requires: null,
    mw: 15, terrains: ['plains', 'coast', 'mountain', 'forest', 'desert', 'basin'],
    blurb: 'Strong on ridges and coasts. Complements solar after dark.', effect: '15 MW × wind × terrain',
  },
  gas: {
    kind: 'gas', name: 'Gas Turbine', short: 'Gas', category: 'generation', cost: 950, maintenance: 7, requires: null,
    mw: 38, fuel: 3.0, terrains: ['plains', 'coast', 'desert', 'urban', 'basin'],
    blurb: 'Dispatchable on demand. Burns fuel, and fuel prices spike.', effect: '38 MW · fuel $5.2/MW · +15% on basin',
  },
  hydro: {
    kind: 'hydro', name: 'Hydro Dam', short: 'Hydro', category: 'generation', cost: 1150, maintenance: 8, requires: 'hydropower',
    mw: 30, terrains: ['river'],
    blurb: 'Firm, cheap and steady. Only buildable on rivers.', effect: '30 MW firm · rain boosts output',
  },
  nuclear: {
    kind: 'nuclear', name: 'Nuclear Reactor', short: 'Nuclear', category: 'generation', cost: 3800, maintenance: 30, requires: 'advancedNuclear',
    mw: 85, fuel: 0.5, terrains: ['plains', 'coast', 'urban', 'basin'],
    blurb: 'Enormous firm output and grid stability. Slow to pay back.', effect: '85 MW firm · +10 stability',
  },
  geothermal: {
    kind: 'geothermal', name: 'Geothermal Plant', short: 'Geo', category: 'generation', cost: 2200, maintenance: 15, requires: 'enhancedGeothermal',
    mw: 44, terrains: ['geothermal'],
    blurb: 'Weather-proof baseload, but only on geothermal fields.', effect: '44 MW firm · ignores weather',
  },
  battery: {
    kind: 'battery', name: 'Battery Bank', short: 'Battery', category: 'storage', cost: 800, maintenance: 4, requires: 'batteries',
    mw: 24, storage: 48, rate: 24, terrains: ALL_LAND,
    blurb: 'Soak up surplus sun, cover the evening peak, sell flexibility.', effect: '24 MW / 48 MW-h · 90% round trip',
  },
  substation: {
    kind: 'substation', name: 'Substation', short: 'Substation', category: 'network', cost: 320, maintenance: 3, requires: null,
    mw: 140, terrains: ALL_LAND,
    blurb: 'The hub of a grid island. Assets within 3 tiles connect to it.', effect: '140 MW throughput · 3 tile radius',
  },
  edge: {
    kind: 'edge', name: 'Edge Data Center', short: 'Edge DC', category: 'compute', cost: 1100, maintenance: 12, requires: null,
    mw: 14, pue: 1.42, eff: 1, rp: 8, terrains: ['plains', 'coast', 'forest', 'desert', 'urban', 'basin', 'river'],
    blurb: 'Small, quick to deploy. Converts delivered power into compute.', effect: '14 MW IT · PUE 1.42 · 1.00 CU/MW',
  },
  hyperscale: {
    kind: 'hyperscale', name: 'Hyperscale Campus', short: 'Hyperscale', category: 'compute', cost: 3000, maintenance: 45, requires: 'advancedCooling',
    mw: 46, pue: 1.3, eff: 1.06, rp: 22, terrains: ['plains', 'coast', 'desert', 'urban', 'basin'],
    blurb: 'Industrial-scale inference. Much better compute per watt.', effect: '46 MW IT · PUE 1.30 · 1.06 CU/MW',
  },
  gigafactory: {
    kind: 'gigafactory', name: 'AI Gigafactory', short: 'Gigafactory', category: 'compute', cost: 7500, maintenance: 130, requires: 'nextGenFactories',
    mw: 130, pue: 1.2, eff: 1.14, rp: 60, terrains: ['plains', 'coast', 'urban', 'basin'],
    blurb: 'A city of accelerators. The apex of compute infrastructure.', effect: '130 MW IT · PUE 1.20 · 1.14 CU/MW',
  },
  lab: {
    kind: 'lab', name: 'R&D Campus', short: 'R&D', category: 'research', cost: 800, maintenance: 6, requires: null,
    mw: 0, rp: 18, terrains: ['plains', 'coast', 'forest', 'urban', 'mountain'],
    blurb: 'Turns capital into research. The fastest route up the tech tree.', effect: '18 RP per turn',
  },
};

export const COMPUTE_KINDS: StructureKind[] = ['edge', 'hyperscale', 'gigafactory'];
export const GENERATOR_KINDS: StructureKind[] = ['solar', 'wind', 'gas', 'hydro', 'nuclear', 'geothermal'];

export const BALANCE = {
  startCredits: 1100,
  startResearch: 10,
  startTreasuryFloor: -2000,
  claimBase: 30,
  claimStep: 13,
  captureCost: 160,
  linkCostBase: 40,
  linkCostPerTile: 20,
  linkRange: 7,
  attachRadius: 3,
  importUplift: 1.6,
  exportHaircut: 0.5,
  exportCap: 140,
  powerBase: 5.0,
  computeBase: 24,
  computePriceFloor: 0.3,
  demandBase: 220,
  demandGrowth: 1.026,
  powerDrift: 0.008,
  batteryEfficiency: 0.9,
  flexBase: 1.6,
  flexEmergency: 3.4,
  congestedAt: 0.82,
  insolvencyTurns: 3,
  maxTurns: 40,
  victory: {
    computeShare: 0.45,
    computeTurns: 3,
    firmMw: 600,
    stability: 70,
    credits: 9000,
    energyTurns: 3,
    efficientCompute: 220,
    techTurns: 2,
  },
} as const;

export const POLICIES: Record<Policy, { id: Policy; name: string; short: string; blurb: string; util: number }> = {
  compute: { id: 'compute', name: 'Maximize Compute', short: 'Compute', blurb: 'Run every rack flat out. Most CU, no reserves.', util: 1 },
  profit: { id: 'profit', name: 'Maximize Profit', short: 'Profit', blurb: 'Trim utilisation when power is expensive relative to compute.', util: 0.93 },
  energy: { id: 'energy', name: 'Minimize Energy Cost', short: 'Efficiency', blurb: 'Run fewer megawatts. Fewer CU, much cheaper power bill.', util: 0.78 },
  flex: { id: 'flex', name: 'Grid Flexible', short: 'Flexible', blurb: 'Earn flexibility payments; ride through grid emergencies.', util: 0.86 },
  reliability: { id: 'reliability', name: 'Reliability First', short: 'Reliable', blurb: 'Spare capacity and reserves. Improves grid stability.', util: 0.94 },
};

export const WEATHERS: WeatherDef[] = [
  { id: 'clear', name: 'Clear Skies', blurb: 'Steady conditions across the territory.', solar: 1, wind: 1, cooling: 1, hydro: 1, powerPrice: 1, weight: 24 },
  { id: 'sunny', name: 'High Pressure', blurb: 'Solar surge. Wind drops away.', solar: 1.22, wind: 0.88, cooling: 1.04, hydro: 0.95, powerPrice: 0.96, weight: 14 },
  { id: 'heatwave', name: 'Heatwave', blurb: 'Cooling costs climb and the grid strains.', solar: 1.12, wind: 0.75, cooling: 1.14, hydro: 0.9, powerPrice: 1.22, weight: 9 },
  { id: 'overcast', name: 'Overcast', blurb: 'Solar output collapses, cooling improves.', solar: 0.52, wind: 1.06, cooling: 0.98, hydro: 1, powerPrice: 1.04, weight: 10 },
  { id: 'windy', name: 'Gale Front', blurb: 'Turbines at full tilt. Panels a little flat.', solar: 0.94, wind: 1.38, cooling: 1.02, hydro: 1.05, powerPrice: 0.9, weight: 10 },
  { id: 'storm', name: 'Storm Cell', blurb: 'Wind surges, solar fails, lines strain.', solar: 0.34, wind: 1.5, cooling: 0.96, hydro: 1.18, powerPrice: 1.28, weight: 6 },
  { id: 'rain', name: 'Rain Belt', blurb: 'Rivers run high. Panels wash out.', solar: 0.58, wind: 1.12, cooling: 0.95, hydro: 1.28, powerPrice: 0.98, weight: 10 },
  { id: 'coldsnap', name: 'Cold Snap', blurb: 'Free cooling, but power demand and prices spike.', solar: 0.86, wind: 1.1, cooling: 0.9, hydro: 0.95, powerPrice: 1.25, weight: 8 },
  { id: 'drought', name: 'Wind Drought', blurb: 'Still air. Turbines idle while the sun bakes.', solar: 1.06, wind: 0.3, cooling: 1.05, hydro: 0.86, powerPrice: 1.1, weight: 6 },
  { id: 'clearNight', name: 'Clear Night', blurb: 'No sun at all, cool air, modest demand.', solar: 0.12, wind: 0.95, cooling: 0.94, hydro: 1, powerPrice: 1.06, weight: 3 },
];

export const TECHS: TechDef[] = [
  // Compute
  { id: 'efficientGpus', name: 'Efficient GPUs', branch: 'compute', tier: 1, cost: 105, requires: [], blurb: 'Bin-sorted accelerators squeeze more tokens per watt.', effect: '+8% compute from every data center' },
  { id: 'advancedCooling', name: 'Advanced Cooling', branch: 'compute', tier: 2, cost: 190, requires: ['efficientGpus'], blurb: 'Free-cooling and precision air handling.', effect: '-6% PUE · unlocks Hyperscale Campus' },
  { id: 'liquidCooling', name: 'Liquid Cooling', branch: 'compute', tier: 3, cost: 330, requires: ['advancedCooling'], blurb: 'Direct-to-chip loops at 45 °C.', effect: '-8% PUE for all compute' },
  { id: 'aiAccelerators', name: 'AI Accelerators', branch: 'compute', tier: 3, cost: 350, requires: ['efficientGpus'], blurb: 'Custom silicon with fatter matrix units.', effect: '+10% compute output' },
  { id: 'nextGenFactories', name: 'Next-Gen AI Factories', branch: 'compute', tier: 4, cost: 560, requires: ['liquidCooling', 'aiAccelerators'], blurb: 'Campus-scale training halls and on-site substations.', effect: '+6% compute · unlocks AI Gigafactory' },

  // Energy
  { id: 'hydropower', name: 'Hydropower Engineering', branch: 'energy', tier: 1, cost: 170, requires: [], blurb: 'Turbines, penstocks and river surveys.', effect: 'Unlocks Hydro Dam' },
  { id: 'improvedSolar', name: 'Improved Solar Cells', branch: 'energy', tier: 1, cost: 130, requires: [], blurb: 'Bifacial modules on tracking mounts.', effect: '+15% solar output' },
  { id: 'advancedWind', name: 'Advanced Wind Turbines', branch: 'energy', tier: 2, cost: 165, requires: ['improvedSolar'], blurb: 'Longer blades and taller towers.', effect: '+15% wind output' },
  { id: 'batteries', name: 'High-Density Batteries', branch: 'energy', tier: 2, cost: 220, requires: ['hydropower'], blurb: 'Grid-scale lithium iron phosphate.', effect: 'Unlocks Battery Bank · +5% storage' },
  { id: 'enhancedGeothermal', name: 'Enhanced Geothermal', branch: 'energy', tier: 3, cost: 350, requires: ['improvedSolar'], blurb: 'Deep directional drilling into hot rock.', effect: 'Unlocks Geothermal Plant' },
  { id: 'advancedNuclear', name: 'Advanced Nuclear', branch: 'energy', tier: 4, cost: 500, requires: ['batteries'], blurb: 'Small modular reactors with passive safety.', effect: 'Unlocks Nuclear Reactor · +6 stability' },
  { id: 'smartGridDispatch', name: 'Smart Grid Dispatch', branch: 'energy', tier: 2, cost: 250, requires: ['batteries'], blurb: 'Forecasting and automated unit commitment.', effect: '+10% line capacity · +8 stability' },

  // Optimization
  { id: 'gpuPowerManagement', name: 'GPU Power Management', branch: 'optimization', tier: 1, cost: 130, requires: [], blurb: 'Clock and voltage curves tuned per workload.', effect: '-4% facility load · +6% compute' },
  { id: 'workloadScheduling', name: 'Workload-Aware Scheduling', branch: 'optimization', tier: 2, cost: 220, requires: ['gpuPowerManagement'], blurb: 'Batch the deferrable work into cheap hours.', effect: '+35% flexibility revenue' },
  { id: 'adaptiveInference', name: 'Adaptive Inference', branch: 'optimization', tier: 3, cost: 310, requires: ['workloadScheduling'], blurb: 'Speculative decoding and KV-cache reuse.', effect: '+8% compute · +6 stability in flex mode' },
  { id: 'demandResponse', name: 'Demand Response', branch: 'optimization', tier: 3, cost: 280, requires: ['workloadScheduling'], blurb: 'Sell curtailment into the balancing market.', effect: '+45% flexibility revenue · unlocks flex income' },
  { id: 'autonomousFleet', name: 'Autonomous Fleet Optimization', branch: 'optimization', tier: 4, cost: 640, requires: ['adaptiveInference', 'demandResponse'], blurb: 'A closed-loop agent tunes the whole fleet.', effect: '+15% compute · +10 stability · Technology victory' },

  // Infrastructure
  { id: 'hvTransmission', name: 'High-Voltage Transmission', branch: 'infrastructure', tier: 1, cost: 120, requires: [], blurb: '765 kV lines carry far more power per corridor.', effect: '+60% line capacity' },
  { id: 'modularSubstations', name: 'Modular Substations', branch: 'infrastructure', tier: 2, cost: 220, requires: ['hvTransmission'], blurb: 'Containerised switchgear, faster to site.', effect: '+40% substation throughput · -10% cost' },
  { id: 'gridInterconnection', name: 'Grid Interconnection', branch: 'infrastructure', tier: 3, cost: 350, requires: ['hvTransmission'], blurb: 'Longer corridors, bigger balancing areas.', effect: '+2 line range · +25% line capacity' },
  { id: 'advancedGridOps', name: 'Advanced Grid Operations', branch: 'infrastructure', tier: 4, cost: 450, requires: ['gridInterconnection', 'smartGridDispatch'], blurb: 'Digital twins and autonomous switching.', effect: '+12 stability · +5% all generation' },
];

export const TECH_MAP: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export const PERSONAS: Record<Persona, {
  corp: string;
  name: string;
  color: string;
  accent: string;
  blurb: string;
  weights: { generation: number; compute: number; grid: number; research: number; expansion: number; storage: number; flexibility: number };
  researchBias: Record<string, number>;
  policy: Policy;
}> = {
  helios: {
    corp: 'Helios Energy',
    name: 'Helios Energy',
    color: '#f5a524',
    accent: '#ffd479',
    blurb: 'Renewable energy developer. Floods the map with cheap solar and wind, then sells the megawatts.',
    weights: { generation: 1.5, compute: 0.8, grid: 1, research: 0.9, expansion: 1.25, storage: 0.9, flexibility: 0.7 },
    researchBias: { improvedSolar: 2.4, advancedWind: 1.9, hydropower: 1.6, enhancedGeothermal: 1.5, batteries: 1.2, hvTransmission: 1.1 },
    policy: 'profit',
  },
  titan: {
    corp: 'Titan Compute',
    name: 'Titan Compute',
    color: '#ff5d8f',
    accent: '#ff9ebb',
    blurb: 'Hyperscaler. Builds data centers first and worries about the grid afterwards.',
    weights: { generation: 1.05, compute: 1.6, grid: 0.85, research: 1.1, expansion: 1.15, storage: 0.6, flexibility: 0.5 },
    researchBias: { efficientGpus: 2.2, advancedCooling: 2.2, aiAccelerators: 1.8, nextGenFactories: 2, gpuPowerManagement: 1.3 },
    policy: 'compute',
  },
  volt: {
    corp: 'Volt Dynamics',
    name: 'Volt Dynamics',
    color: '#8f7bff',
    accent: '#c0b4ff',
    blurb: 'Grid operator at heart. Batteries, demand response and transmission chokepoints are its weapons.',
    weights: { generation: 1, compute: 1, grid: 1.6, research: 1.05, expansion: 1, storage: 1.7, flexibility: 1.9 },
    researchBias: { batteries: 2.4, smartGridDispatch: 2, demandResponse: 2, workloadScheduling: 1.8, gridInterconnection: 1.6, hvTransmission: 1.5, autonomousFleet: 1.2 },
    policy: 'flex',
  },
};

export const BRANCH_META: Record<TechDef['branch'], { name: string; color: string }> = {
  compute: { name: 'Compute', color: '#ff7a59' },
  energy: { name: 'Energy', color: '#4fd1c5' },
  optimization: { name: 'Optimization', color: '#b794f6' },
  infrastructure: { name: 'Infrastructure', color: '#7fb3ff' },
};

export const PLAYER_COLORS = [
  { color: '#3fd8c2', accent: '#8ffcec', name: 'You' },
  { color: '#f5a524', accent: '#ffd479' },
  { color: '#ff5d8f', accent: '#ff9ebb' },
  { color: '#8f7bff', accent: '#c0b4ff' },
];
