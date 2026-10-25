import { chromium } from 'playwright-core';
import { ensureServer } from './tools.mjs';

const server = await ensureServer();
const base = server.base;
const browser = await chromium.launch({ args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: 'screenshots/01-menu.png' });
await page.locator('input[inputmode="numeric"]').fill('20261024');
await page.getByRole('button', { name: /Enter the grid/i }).click();
await page.waitForTimeout(1800);
await page.screenshot({ path: 'screenshots/02-world.png' });

// Modals
await page.keyboard.press('t');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/03-tech.png' });
await page.keyboard.press('Escape');
await page.keyboard.press('m');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/04-market.png' });
await page.keyboard.press('Escape');
await page.keyboard.press('e');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/05-empire.png' });
await page.keyboard.press('Escape');
await page.keyboard.press('r');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/06-rivals.png' });
await page.keyboard.press('Escape');

// Claim an adjacent tile with a real shift-click.
const target = await page.evaluate(() => {
  const gp = window.__gp;
  const st = gp.useGame.getState();
  const game = st.game;
  const renderer = gp.renderer();
  const owned = game.tiles.filter((t) => t.owner === 0);
  const pick = game.tiles.find(
    (t) =>
      t.owner === null &&
      t.terrain !== 'ocean' &&
      owned.some((o) => Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1),
  );
  if (!pick || !renderer) return null;
  const p = renderer.tileScreen(pick.x, pick.y);
  return { x: p.x, y: p.y, tx: pick.x, ty: pick.y };
});
if (target) {
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(500);
  const claimBtn = page.locator('.build-bar button', { hasText: 'Claim tile' });
  if (await claimBtn.count()) {
    await claimBtn.first().click();
    await page.waitForTimeout(700);
  }
}
const claimed = await page.evaluate(() => {
  const st = window.__gp.useGame.getState();
  return { claims: st.game.players[0].claims, selected: st.selected };
});

// Build a solar farm on the newly claimed tile through the build palette.
const built = await page.evaluate(() => {
  const st = window.__gp.useGame.getState();
  const game = st.game;
  const sel = st.selected;
  if (!sel) return null;
  const tile = game.tiles[sel.y * game.size + sel.x];
  return tile?.structure ? 'already' : tile?.owner;
});
let builtAfter = null;
if (built === 0) {
  const option = page.locator('.build-option:not([disabled])').first();
  if (await option.count()) {
    await option.click();
    await page.waitForTimeout(650);
    builtAfter = await page.evaluate(() => {
      const gp = window.__gp;
      const st = gp.useGame.getState();
      const game = st.game;
      const sel = st.selected;
      return sel ? game.tiles[sel.y * game.size + sel.x]?.structure?.kind ?? null : null;
    });
  }
}
await page.screenshot({ path: 'screenshots/07-claim-build.png' });

// End turn through the UI and capture the summary.
await page.getByRole('button', { name: /End turn/i }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: 'screenshots/08-summary.png' });
await page.getByRole('button', { name: /Next turn/i }).click();
await page.waitForTimeout(400);

// Let the same AI that runs rivals play this seat for 14 turns, then take back over:
// this produces a realistically developed empire for the presentation screenshots.
await page.evaluate(() => {
  const gp = window.__gp;
  const game = gp.useGame.getState().game;
  game.players[0].isAI = true;
  game.players[0].persona = 'titan';
  for (let i = 0; i < 14; i++) {
    gp.useGame.getState().finishTurn();
    gp.useGame.getState().setModal(null);
  }
  game.players[0].isAI = false;
  game.players[0].persona = null;
});
await page.waitForTimeout(1800);
await page.evaluate(() => {
  const gp = window.__gp;
  const st = gp.useGame.getState();
  const game = st.game;
  const renderer = gp.renderer();
  const owned = game.tiles.filter((t) => t.owner === 0);
  if (owned.length && renderer) {
    const x = owned.reduce((s, t) => s + t.x, 0) / owned.length;
    const y = owned.reduce((s, t) => s + t.y, 0) / owned.length;
    renderer.focusTile(x, y, true);
  }
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'screenshots/09-midgame.png' });

// Late-game modals with real data.
await page.keyboard.press('t');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/10-tech-late.png' });
await page.keyboard.press('Escape');
await page.keyboard.press('m');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/11-market-late.png' });
await page.keyboard.press('Escape');
await page.keyboard.press('e');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/12-empire-late.png' });
await page.keyboard.press('Escape');
await page.keyboard.press('r');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/13-rivals-late.png' });
await page.keyboard.press('Escape');
await page.keyboard.press('1');
await page.waitForTimeout(600);
await page.screenshot({ path: 'screenshots/14-power-overlay.png' });
await page.keyboard.press('1');

// Run to the end for a victory screen.
await page.evaluate(() => {
  const gp = window.__gp;
  for (let i = 0; i < 30; i++) {
    const game = gp.useGame.getState().game;
    if (game.victory.over) break;
    gp.useGame.getState().finishTurn();
    gp.useGame.getState().setModal(null);
  }
  gp.useGame.getState().setModal('victory');
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'screenshots/15-defeat.png' });

// A second campaign where the same seat is played by the Titan persona from the
// start, ending in a player victory (real simulation, seed 2035).
const winPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
winPage.on('pageerror', (err) => errors.push(String(err)));
await winPage.goto(base, { waitUntil: 'networkidle' });
await winPage.locator('input[inputmode="numeric"]').fill('2035');
await winPage.getByRole('button', { name: /Enter the grid/i }).click();
await winPage.waitForTimeout(1200);
await winPage.evaluate(() => {
  const gp = window.__gp;
  const game = gp.useGame.getState().game;
  game.players[0].isAI = true;
  game.players[0].persona = 'titan';
  for (let i = 0; i < 44; i++) {
    if (gp.useGame.getState().game.victory.over) break;
    gp.useGame.getState().finishTurn();
    gp.useGame.getState().setModal(null);
  }
  gp.useGame.getState().setModal('victory');
});
await winPage.waitForTimeout(900);
await winPage.screenshot({ path: 'screenshots/17-victory.png' });

console.log(JSON.stringify({ target, claimed, built: builtAfter ?? built, errors }, null, 2));
await browser.close();
server.stop();
