/**
 * Authoritative simulation types. The renderer and UI only read these shapes;
 * all mutation flows through actions.ts / simulation.ts.
 */

export type Terrain =
  | 'ocean'
  | 'coast'
  | 'plains'
  | 'forest'
  | 'desert'
  | 'mountain'
  | 'river'
  | 'geothermal'
  | 'urban'
  | 'basin';

export type StructureKind =
  | 'solar'
  | 'wind'
  | 'gas'
  | 'hydro'
  | 'nuclear'
  | 'geothermal'
  | 'battery'
  | 'substation'
  | 'edge'
  | 'hyperscale'
  | 'gigafactory'
  | 'lab';

export type StructureCategory = 'generation' | 'storage' | 'network' | 'compute' | 'research';

export type Policy = 'compute' | 'profit' | 'energy' | 'flex' | 'reliability';

export type Persona = 'helios' | 'titan' | 'volt';

export interface Pos {
  x: number;
  y: number;
}

export interface Link {
  owner: number;
  a: Pos;
  b: Pos;
}

export interface Structure {
  kind: StructureKind;
  /** -1 == neutral, claimable world asset. */
  owner: number;
  builtTurn: number;
  policy?: Policy;
  /** Battery state of charge, in MW-turns. */
  charge?: number;
  /** Turn on which an offline structure comes back online. */
  offlineUntil?: number;
}

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  /** 0 = lowland, 1 = hill, 2 = ridge. Purely visual + wind/hydro flavour. */
  elevation: number;
  /** Deterministic 0..1 art variation. */
  variant: number;
  owner: number | null;
  structure: Structure | null;
  /** Bitmask of players that have revealed this tile. */
  revealed: number;
}

export interface TechDef {
  id: string;
  name: string;
  branch: 'compute' | 'energy' | 'optimization' | 'infrastructure';
  tier: number;
  cost: number;
  requires: string[];
  blurb: string;
  effect: string;
}

export interface PlayerStats {
  totalCompute: number;
  totalRevenue: number;
  peakCompute: number;
  peakCredits: number;
  built: number;
  claims: number;
  techs: number;
}

export interface Player {
  id: number;
  name: string;
  corp: string;
  /** Primary brand colour (hex). */
  color: string;
  /** Secondary brand colour used for glows and stripes. */
  accent: string;
  isAI: boolean;
  persona: Persona | null;
  credits: number;
  research: number;
  techs: string[];
  claims: number;
  policy: Policy;
  stats: PlayerStats;
  /** AI scratch memory, serialized with the save so behaviour stays stable. */
  aiMemory: {
    lastShortfall: number;
    lastStability: number;
    focus: string | null;
    aggression: number;
  };
  /** Consecutive turns with deeply negative treasury. */
  deficitStreak: number;
  bankrupt: boolean;
}

export interface EventMod {
  id: string;
  label: string;
  desc: string;
  turnsLeft: number;
  computePriceMult?: number;
  powerPriceMult?: number;
  fuelMult?: number;
  solarMult?: number;
  windMult?: number;
  coolingMult?: number;
  stabilityDelta?: number;
  flexBonus?: number;
  researchBonus?: number;
  grant?: number;
}

export interface MarketState {
  /** $ per MW-turn of delivered power. */
  powerPrice: number;
  /** $ per compute unit. */
  computePrice: number;
  /** Total compute units the market will absorb this turn. */
  demand: number;
  /** Total compute offered by all companies last turn. */
  supply: number;
  /** Candidate weather ids for next turn with weights, used as the forecast. */
  forecast: { weather: string; weight: number }[];
  events: EventMod[];
}

export interface WeatherDef {
  id: string;
  name: string;
  blurb: string;
  solar: number;
  wind: number;
  cooling: number;
  hydro: number;
  powerPrice: number;
  weight: number;
}

export interface GridReport {
  islandId: number;
  substations: Pos[];
  generation: number;
  load: number;
  served: number;
  imported: number;
  exported: number;
  charged: number;
  discharged: number;
  capacity: number;
  reserve: number;
  stability: number;
  congested: number;
  curtailed: number;
}

export interface PlayerTurnReport {
  playerId: number;
  generation: number;
  load: number;
  served: number;
  imported: number;
  exported: number;
  charged: number;
  discharged: number;
  curtailed: number;
  compute: number;
  /** IT megawatts delivered to compute load. */
  itMW: number;
  computeRevenue: number;
  powerRevenue: number;
  powerCost: number;
  fuelCost: number;
  maintenance: number;
  net: number;
  research: number;
  stability: number;
  islands: GridReport[];
  /** tile key -> utilisation 0..1 for compute assets */
  dcUtil: Record<string, number>;
  /** "ax,ay-bx,by" -> MW flowing on that corridor */
  linkFlow: Record<string, number>;
}

export interface TurnRecord {
  turn: number;
  weather: string;
  powerPrice: number;
  computePrice: number;
  demand: number;
  players: {
    playerId: number;
    credits: number;
    compute: number;
    revenue: number;
    generation: number;
    stability: number;
    share: number;
    score: number;
    techs: number;
  }[];
}

export interface VictoryProgress {
  computeShare: number;
  computeStreak: number;
  firmMw: number;
  minStability: number;
  energyStreak: number;
  efficientCompute: number;
  techComplete: boolean;
  techStreak: number;
  score: number;
}

export interface VictoryState {
  over: boolean;
  winner: number | null;
  kind: 'compute' | 'energy' | 'tech' | 'score' | 'insolvency' | null;
  progress: VictoryProgress[];
}

export interface TurnSummary {
  turn: number;
  weatherId: string;
  weatherName: string;
  events: EventMod[];
  powerPrice: number;
  computePrice: number;
  demand: number;
  supply: number;
  highlights: string[];
}

export type LogKind =
  | 'build'
  | 'claim'
  | 'research'
  | 'market'
  | 'weather'
  | 'rival'
  | 'victory'
  | 'warn'
  | 'grid';

export interface LogEntry {
  turn: number;
  playerId: number | null;
  kind: LogKind;
  text: string;
}

export interface GameSetup {
  seed: number;
  size: number;
  maxTurns: number;
  playerName: string;
  credits: number;
}

export interface GameState {
  version: number;
  seed: number;
  /** Deterministic random stream cursor. */
  rng: number;
  turn: number;
  maxTurns: number;
  size: number;
  tiles: Tile[];
  players: Player[];
  links: Link[];
  weather: WeatherDef;
  market: MarketState;
  report: PlayerTurnReport[];
  history: TurnRecord[];
  log: LogEntry[];
  victory: VictoryState;
  summary: TurnSummary | null;
  lastSummaryTurn: number;
  /** Bumped on every mutation; renderer uses it to invalidate art caches. */
  revision: number;
}

export interface TileLookup {
  (x: number, y: number): Tile | null;
}
