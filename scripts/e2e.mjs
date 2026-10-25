import { chromium } from 'playwright-core';
import { ensureServer } from './tools.mjs';

const server = await ensureServer();
const base = server.base;
const browser = await chromium.launch({ args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(String(err)));

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.log(`FAIL ${name} ${detail}`);
}

const state = () => page.evaluate(() => {
  const gp = window.__gp;
  const s = gp.useGame.getState();
  return {
    turn: s.game.turn,
    credits: s.game.players[0].credits,
    claims: s.game.players[0].claims,
    techs: s.game.players[0].techs,
    research: s.game.players[0].research,
    modal: s.modal,
    selected: s.selected,
    over: s.game.victory.over,
    winner: s.game.victory.winner,
    structures: s.game.tiles.filter((t) => t.owner === 0 && t.structure).length,
    owned: s.game.tiles.filter((t) => t.owner === 0).length,
  };
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
check('menu renders', await page.getByText('GRIDPOWER', { exact: false }).first().isVisible());
check('title', (await page.title()) === 'GRIDPOWER');

// Fixed seed for reproducibility.
await page.locator('input[inputmode="numeric"]').fill('20261024');
await page.getByRole('button', { name: /Enter the grid/i }).click();
await page.waitForTimeout(1500);
let s = await state();
check('game starts at turn 1', s.turn === 1, JSON.stringify(s));
check('starts with a connected data center', s.structures >= 3, String(s.structures));
check('canvas is interactive', await page.locator('canvas.world').isVisible());

// Click an adjacent tile and claim it via the contextual bar.
const tilePoint = await page.evaluate(() => {
  const gp = window.__gp;
  const st = gp.useGame.getState();
  const game = st.game;
  const renderer = gp.renderer();
  const owned = game.tiles.filter((t) => t.owner === 0);
  const pick = game.tiles.find(
    (t) => t.owner === null && t.terrain !== 'ocean' && owned.some((o) => Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1),
  );
  const p = renderer.tileScreen(pick.x, pick.y);
  return { x: p.x, y: p.y, tile: { x: pick.x, y: pick.y }, terrain: pick.terrain };
});
await page.mouse.click(tilePoint.x, tilePoint.y);
await page.waitForTimeout(350);
s = await state();
check('canvas click selects the hovered tile', s.selected && s.selected.x === tilePoint.tile.x && s.selected.y === tilePoint.tile.y, JSON.stringify(s.selected));
const claimBtn = page.locator('.build-bar button', { hasText: 'Claim' });
check('claim button is offered', (await claimBtn.count()) > 0);
if (await claimBtn.count()) {
  await claimBtn.first().click();
  await page.waitForTimeout(500);
  s = await state();
  check('claim succeeds', s.claims === 1 && s.owned > 0, JSON.stringify({ claims: s.claims, owned: s.owned }));
}

// Build a lab when offered (accelerates the research check), otherwise anything.
const labOption = page.locator('.build-option:not([disabled])', { hasText: /R&D|Lab/i }).first();
const buildOption = (await labOption.count()) ? labOption : page.locator('.build-option:not([disabled])').first();
check('build palette offers a structure', (await buildOption.count()) > 0);
if (await buildOption.count()) {
  const before = (await state()).structures;
  await buildOption.click();
  await page.waitForTimeout(500);
  const after = await state();
  check('construction increases structure count', after.structures > before, `${before} -> ${after.structures}`);
}

// Research path: run enough turns to bank RP, then buy a ready technology.
for (let i = 0; i < 24; i++) {
  const current = await state();
  if (current.research >= 145 || current.turn >= 22) break;
  await page.getByRole('button', { name: /^End turn/ }).click();
  await page.waitForTimeout(220);
  if (await page.getByRole('button', { name: /Next turn/i }).count()) {
    await page.getByRole('button', { name: /Next turn/i }).click();
    await page.waitForTimeout(120);
  }
}
s = await state();
check('turns advance', s.turn >= 6, String(s.turn));
await page.keyboard.press('t');
await page.waitForTimeout(300);
check('tech modal opens', (await page.locator('.tech-layout').count()) === 1);
const affordable = page.locator('.tech-node.affordable').first();
if (await affordable.count()) {
  const before = (await state()).techs.length;
  const beforeRp = (await state()).research;
  await affordable.click();
  await page.waitForTimeout(350);
  const after = await state();
  check('research completes', after.techs.length > before, JSON.stringify(after.techs));
  check('tech modal reflects the purchase immediately', (await page.locator('.tech-node.researched').count()) > 0);
  check('research points are deducted in the UI', after.research < beforeRp, `${beforeRp} -> ${after.research}`);
} else {
  check('research became affordable', false, `RP=${(await state()).research}`);
}
await page.keyboard.press('Escape');

// Save, reload, and continue from the same turn.
const savedTurn = (await state()).turn;
await page.getByRole('button', { name: 'Menu' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /Save game/i }).click();
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(700);
check('continue option appears after reload', (await page.getByRole('button', { name: /^Continue$/ }).count()) > 0);
if (await page.getByRole('button', { name: /^Continue$/ }).count()) {
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(900);
  const resumed = await state();
  check('save round-trips the turn', resumed.turn === savedTurn, `${resumed.turn} vs ${savedTurn}`);
  check('save round-trips structures', resumed.structures >= 3, String(resumed.structures));
}

// Laptop layout check on a normal mid-campaign turn.
await page.setViewportSize({ width: 1366, height: 768 });
await page.waitForTimeout(500);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('1366x768 has no horizontal overflow', overflow <= 0, String(overflow));
await page.screenshot({ path: 'screenshots/16-laptop.png' });
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);

// Run the campaign to a conclusion. Space ends a turn and closes the summary,
// which keeps the driver stable while React re-renders the HUD every turn.
let guard = 0;
while (guard < 130) {
  const current = await state();
  if (current.over) break;
  await page.keyboard.press('Space');
  await page.waitForTimeout(170);
  guard++;
}
const finished = await state();
check('campaign reaches a victory condition', finished.over === true, JSON.stringify(finished));
check('victory screen is shown', (await page.getByText(/Campaign over|Dominance achieved/i).count()) > 0);
check('no runtime errors', errors.length === 0, errors.join(' | '));

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
if (errors.length) console.log('errors:', errors);
await browser.close();
server.stop();
process.exit(passed === checks.length ? 0 : 1);
