/**
 * Headless AI league: runs complete matches and reports balance metrics.
 *   npm run sim -- seeds=8 turns=40 size=20
 */
import { runHeadlessMatch, describeMatch, type MatchResult } from '../src/engine/headless.ts';

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const [k, v] = arg.split('=');
  args.set(k, v ?? '1');
}

const seeds = Math.max(1, Number(args.get('seeds') ?? 6));
const turns = Number(args.get('turns') ?? 40);
const size = Number(args.get('size') ?? 20);
const verbose = args.get('verbose') === '1';
const baseSeed = Number(args.get('base') ?? 1000);

const results: MatchResult[] = [];
for (let i = 0; i < seeds; i++) {
  const seed = baseSeed + i * 7;
  const result = runHeadlessMatch({
    seed,
    size,
    maxTurns: turns,
    allAi: true,
    onTurn: verbose
      ? (state) => {
          if (state.turn % 5 === 0 || state.turn === 1) {
            const row = state.players
              .map((p) => `${p.corp.slice(0, 7)}:${Math.round(state.report[p.id].compute)}cu/$${Math.round(p.credits)}`)
              .join('  ');
            console.log(`  t${String(state.turn).padStart(2)} ${row}`);
          }
        }
      : undefined,
  });
  results.push(result);
  console.log(describeMatch(result));
}

const winners = new Map<string, number>();
for (const r of results) {
  const key = r.winnerCorp ? `${r.winnerCorp} (${r.kind})` : 'none';
  winners.set(key, (winners.get(key) ?? 0) + 1);
}
const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
const problems = results.flatMap((r) => r.problems);

console.log('\n=== League summary ===');
console.log(`matches: ${results.length} | avg turns: ${avg(results.map((r) => r.turns)).toFixed(1)} | avg runtime: ${avg(results.map((r) => r.durationsMs)).toFixed(0)}ms`);
console.log(`avg winner compute: ${avg(results.map((r) => Math.max(...r.players.map((p) => p.compute)))).toFixed(0)} CU`);
console.log(`avg final credits (leader): ${avg(results.map((r) => Math.max(...r.players.map((p) => p.credits)))).toFixed(0)}`);
console.log(`avg structures: ${avg(results.map((r) => r.players.reduce((a, p) => a + p.structures, 0))).toFixed(0)}`);
console.log(`avg techs: ${avg(results.map((r) => avg(r.players.map((p) => p.techs)))).toFixed(1)}`);
console.log('wins:', [...winners.entries()].map(([k, v]) => `${k}×${v}`).join(', '));
if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const p of problems) console.log(' -', p);
  process.exitCode = 1;
}
