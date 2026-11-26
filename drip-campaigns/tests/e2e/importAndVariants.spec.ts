// Real-click coverage for three things that had unit tests but no UI
// coverage: the seeded labels as the canvas actually renders them, the
// default name a new arm gets, and what the Import screen says about a file
// it will not take.
import { test, expect } from '@playwright/test';

// A live campaign opens the read-only view, where the journey is behind the
// Campaign tab. A DRAFT opens the builder instead, whose canvas is already
// on screen — same canvas component either way.
async function openJourney(page: import('@playwright/test').Page, name: string, isDraft = false) {
  await page.goto('/');
  await page.locator('table tbody tr', { hasText: name }).click();
  await page.waitForTimeout(400);
  if (!isDraft) {
    await page.locator('.dv-tab', { hasText: 'Campaign' }).click();
  }
  await page.waitForTimeout(800);
}

test('a seeded milestone check reads the offer its config names, not the spend ladder that was deleted', async ({ page }) => {
  // Spend Milestone Rewards is a DRAFT, so it opens in the builder.
  await openJourney(page, 'Spend Milestone Rewards', true);
  const cards = (await page.locator('.dc-node-card').allTextContents()).join(' | ');
  // The four checks used to read "Spend ₹25,000 in first 30 days —
  // Completed?" while their configs pointed at real offers: a question the
  // canvas asked that nothing behind it could answer.
  expect(cards).not.toMatch(/Spend ₹/);
  expect(cards).toMatch(/Monthly Spend Milestone is at least 100%\?/);
  expect(cards).toMatch(/Anniversary Spend Milestone is at least 100%\?/);
});

test('a seeded previous-message check reads the outcome its config names', async ({ page }) => {
  await openJourney(page, 'Auth Txn to EMI — Consent & Resolution');
  const cards = (await page.locator('.dc-node-card').allTextContents()).join(' | ');
  // Read "Previous step: Clicked?" over an outcome of READ — and the send
  // before it is WhatsApp, which has no CLICKED status at all.
  expect(cards).not.toMatch(/Clicked/);
  expect(cards).toMatch(/Previous message outcome is any of READ\?/);
});

test('a new Experiment variant is never named the same as one already there', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill('Variant naming');
  await page.locator('select').first().selectOption('IndusInd Bank (IBL)');
  // Say who it is for: an issuer with no programs and the toggle off reaches
  // nobody, and the submit gate refuses that now.
  await page.locator('.toggle-row .toggle').first().click();
  await page.getByText('Continue to Goal →').click();
  await page.waitForTimeout(200);
  await page.getByText('Continue to Builder →').click();
  await page.waitForTimeout(300);

  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Event")').click();
  const entry = page.locator('.sd-drawer.open');
  await entry.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Category' }) }).locator('select').selectOption('Journey Events');
  await entry.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Type' }) }).locator('select').selectOption('Pageload');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(300);

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt:has-text("Experiment")').click();
  await page.waitForTimeout(200);
  const drawer = page.locator('.sd-drawer.open');
  const labels = () => drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Branches' }) }).locator('input[type=text]');

  // Starts at A and B.
  await expect(labels()).toHaveCount(2);
  expect(await labels().nth(0).inputValue()).toBe('A');
  expect(await labels().nth(1).inputValue()).toBe('B');

  // Add a third, then remove the MIDDLE one and add again — the case that
  // used to produce two arms both called C, because the name came from the
  // arm count rather than from which names were free.
  await drawer.locator('.add-link', { hasText: '+ Add branch' }).click();
  await page.waitForTimeout(150);
  expect(await labels().nth(2).inputValue()).toBe('C');

  await drawer.locator('.cond-remove').nth(1).click();
  await page.waitForTimeout(150);
  await expect(labels()).toHaveCount(2);
  await drawer.locator('.add-link', { hasText: '+ Add branch' }).click();
  await page.waitForTimeout(150);

  const values = await labels().evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(values).toHaveLength(3);
  expect(new Set(values).size).toBe(3);
  expect(values).toContain('B');
});

test('the Import screen says what is wrong with a file it will not take', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.locator('.create-choose-card', { hasText: 'Import' }).click();
  await page.waitForTimeout(200);

  // An edge pointing at a step that is not in the file. This used to import
  // cleanly and open as a journey with an arrow into nothing.
  const broken = JSON.stringify({
    campaign: {
      name: 'Broken',
      root: {
        rootId: 'n1',
        nodes: { n1: { id: 'n1', type: 'SEND', label: 'Welcome', meta: '', autoGenerated: false, _config: { name: 'Welcome' } } },
        edges: [{ id: 'e1', from: 'n1', to: 'n404', branchLabel: '', autoGenerated: false }],
      },
    },
  });
  await page.locator('textarea').fill(broken);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(300);

  await expect(page.locator('.dcb-mid')).toContainText('goes to a step that is not in the file');
  await expect(page.locator('.dcb-mid')).toContainText('n404');
  // Still on the import screen — nothing was created.
  await expect(page.locator('textarea')).toBeVisible();
});
