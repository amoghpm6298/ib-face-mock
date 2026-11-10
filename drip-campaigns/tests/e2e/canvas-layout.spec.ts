// The two bugs that motivated this migration, as explicit, named
// regression tests — not just incidentally covered by other tests, so
// they can never silently come back without a test failing. Both are now
// impossible by construction (React Flow owns layout/label positioning),
// but a future dagre/React Flow upgrade or layout tweak could
// reintroduce either class of bug, so this is guarded permanently.
import { test, expect } from '@playwright/test';

const SEED_CAMPAIGN_COUNT = 6;

test.describe('Branch-label chip overlap (the original bug)', () => {
  for (let rowIndex = 0; rowIndex < SEED_CAMPAIGN_COUNT; rowIndex++) {
    test(`seed campaign row ${rowIndex}: no two branch-label chips overlap`, async ({ page }) => {
      await page.goto('/');
      const row = page.locator('table tbody tr').nth(rowIndex);
      const name = await row.locator('td').first().innerText();
      await row.click();
      await page.waitForTimeout(500);
      // The view opens on Basic Details now, so the journey is one tab
      // across. Without this the chip count is zero and the test passes
      // vacuously. A DRAFT row opens straight into the builder instead,
      // where the journey is already on screen and there are no tabs.
      const campaignTab = page.locator('.dv-tab', { hasText: 'Campaign' });
      if (await campaignTab.count()) {
        await campaignTab.click();
        await page.waitForTimeout(900);
      }

      const boxes = await page.locator('.dc-branch-label').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );
      for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
          const boxA = boxes[a];
          const boxB = boxes[b];
          const overlaps = boxA.x < boxB.x + boxB.width && boxB.x < boxA.x + boxA.width && boxA.y < boxB.y + boxB.height && boxB.y < boxA.y + boxA.height;
          expect(overlaps, `"${name}": chips at index ${a} and ${b} overlap`).toBe(false);
        }
      }
    });
  }
});

test.describe('Bare connector pill (the original "what is this?" bug)', () => {
  test('a bare (unlabeled) connector chip is invisible at rest and only reveals on hover', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
    await page.getByRole('button', { name: /Create from scratch/ }).click();
    await page.locator('input[type=text]').first().fill('Bare Chip Regression');
    await page.locator('select').first().selectOption('IndusInd Bank (IBL)');
    await page.getByText('Continue to Goal →').click();
    await page.getByText('Continue to Builder →').click();
    await page.locator('.dc-add-entry-placeholder').click();
    await page.locator('.dc-type-opt:has-text("Entry · Event")').click();
    // Scoped by each field's own label, not position — Journey Events
    // inserts its own Journey+Batch scoping selects between Event
    // Category and Event Type, so a fixed index doesn't hold here.
    const entryDrawer = page.locator('.sd-drawer.open');
    await entryDrawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Category' }) }).locator('select').selectOption('Journey Events');
    await entryDrawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Type' }) }).locator('select').selectOption('Pageload');
    await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
    await page.waitForTimeout(300);

    // Add a Send so a real bare (unlabeled) connector exists (Send -> its
    // own auto goal-check Split).
    await page.locator('.dc-add-btn').click();
    await page.locator('.dc-type-opt', { hasText: /^Send/ }).click();
    await page.locator('.sd-drawer.open input[type=text]').first().fill('Regression Send');
    const sendSelects = page.locator('.sd-drawer.open select');
    await sendSelects.nth(0).selectOption('WHATSAPP');
    await page.waitForTimeout(150);
    const accountSelect = page.locator('.sd-drawer.open select', { hasText: 'Select account' });
    await accountSelect.selectOption('IBL-Karix-Onb');
    await page.waitForTimeout(150);
    const templateSelect = page.locator('.sd-drawer.open select', { hasText: 'Select template' });
    await templateSelect.selectOption({ index: 1 });
    await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
    await page.waitForTimeout(400);

    const bareChip = page.locator('.dc-branch-label-bare').first();
    await expect(bareChip).toBeAttached();
    const restOpacity = await bareChip.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(restOpacity)).toBeLessThan(0.1);

    await bareChip.hover();
    await page.waitForTimeout(200);
    const hoverOpacity = await bareChip.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(hoverOpacity)).toBeGreaterThan(0.9);
  });
});

// Adding a step used to lay the whole graph out on DC_CARD_H_FALLBACK,
// because the node objects are replaced with fresh unmeasured ones and the
// layout effect latched before the real heights arrived. Every rank then got
// the same pitch — 74 + 10 pad + 56 ranksep = 140px — regardless of how tall
// its cards were, so a tall Send ran into the step below it and stayed that
// way: nothing re-ran the layout once the measurements landed.
//
// It needs a card TALLER than that fallback pitch to show up at all, which
// is why this imports a Send carrying an account, a template, an absolute
// time AND a fallback — roughly 142px against the 140px every rank was
// given. A journey of short cards will not catch it.
const TALL_SEND_CAMPAIGN = JSON.stringify({
  campaign: {
    name: 'Overlap regression',
    issuer: 'IndusInd Bank (IBL)',
    goal: { eventCategory: 'Card Events', eventType: 'Virtual card activated', conditions: [] },
    root: {
      rootId: 'n1',
      nodes: {
        n1: { id: 'n1', type: 'ENTRY_SEGMENT', label: 'All eligible customers', meta: '', _config: { cohortDesc: 'All eligible customers', filters: [] }, autoGenerated: false },
        n2: { id: 'n2', type: 'SEND', label: 'Send Message', meta: '', autoGenerated: false,
          _config: { name: 'Send Message', channel: 'WHATSAPP', account: 'IBL-Karix-Txns', templateId: 'CT-3310',
            timing: 'Absolute', absTime: '11:00', fallbackChannel: 'SMS', fallbackAccount: 'IBL-Karix-Txns', fallbackTemplateId: 'CT-3301' } },
        n3: { id: 'n3', type: 'GOAL_CHECK', label: 'Virtual card activated?', meta: '', _config: null, autoGenerated: true },
        n4: { id: 'n4', type: 'GOAL_EXIT', label: 'Virtual card activated', meta: '', _config: null, autoGenerated: true },
      },
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', branchLabel: '', autoGenerated: false },
        { id: 'e2', from: 'n2', to: 'n3', branchLabel: '', autoGenerated: true },
        { id: 'e3', from: 'n3', to: 'n4', branchLabel: 'Yes', autoGenerated: true },
        { id: 'e4', from: 'n3', to: null, branchLabel: 'No', autoGenerated: false },
      ],
    },
  },
});

test('adding a step never leaves two cards overlapping', async ({ page }) => {
  const overlaps = async () =>
    page.evaluate(() => {
      const cards = [...document.querySelectorAll('.dc-node-card')].map((el) => {
        const r = el.getBoundingClientRect();
        return { label: (el as HTMLElement).innerText.split('\n')[1] || '', x: r.x, y: r.y, right: r.right, bottom: r.bottom, h: r.height };
      });
      const hits: string[] = [];
      for (let a = 0; a < cards.length; a++) {
        for (let b = a + 1; b < cards.length; b++) {
          const A = cards[a];
          const B = cards[b];
          const ox = Math.min(A.right, B.right) - Math.max(A.x, B.x);
          const oy = Math.min(A.bottom, B.bottom) - Math.max(A.y, B.y);
          if (ox > 1 && oy > 1) hits.push(`${A.label} / ${B.label}`);
        }
      }
      const hs = cards.map((c) => c.h);
      return { count: cards.length, hits, ratio: Math.max(...hs) / Math.min(...hs) };
    });

  await page.goto('/');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Import/ }).click();
  await page.locator('textarea').fill(TALL_SEND_CAMPAIGN);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(1800);

  const before = await overlaps();
  expect(before.count).toBe(4);
  expect(before.hits, 'overlapping before any edit').toEqual([]);

  // Add a step into the Goal Check's open "No" arm.
  await page.locator('.dc-add-btn').first().click({ force: true });
  await page.waitForTimeout(600);
  await page.locator('.sd-drawer.open .dc-type-opt', { hasText: 'Wait' }).first().click();
  await page.waitForTimeout(400);
  const add = page.locator('.sd-drawer.open button', { hasText: 'Add Step' });
  await expect(add.first()).toBeEnabled();
  await add.first().click();
  await page.waitForTimeout(2200);

  const after = await overlaps();
  expect(after.count).toBeGreaterThan(before.count);
  // The Send must still tower over its neighbours, or this test would pass
  // for the wrong reason — a journey of same-height cards cannot show the
  // bug. A ratio, not a pixel count, because the canvas is zoomed to fit.
  expect(after.ratio, 'no card is tall enough to exercise this').toBeGreaterThan(1.5);
  expect(after.hits, 'cards overlap after adding a step').toEqual([]);
});
