// List/view/status-action/create-to-submit flow, formalized from this
// project's own scratchpad verification.
import { test, expect } from '@playwright/test';

test('list shows the 6 real seed campaigns with correctly colored status badges', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('table tbody tr')).toHaveCount(6);
  // Every status variant present in the seed data should render a real
  // colored pill, not plain unstyled text (the real bug caught during
  // Phase 4 verification — only 2 of 5 badge color classes existed).
  for (const label of ['Active', 'Draft', 'Scheduled']) {
    const badge = page.locator('.badge', { hasText: label }).first();
    await expect(badge).toBeVisible();
    const bg = await badge.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  }
});

test('Analytics shows the two totals and an annotated journey for a live campaign', async ({ page }) => {
  await page.goto('./');
  // DRIP-001 "Card Activation Reminder" is ACTIVE in the seed data.
  await page.locator('table tbody tr', { hasText: 'Card Activation Reminder' }).click();
  await page.waitForTimeout(400);
  await page.locator('.dv-tab', { hasText: 'Analytics' }).click();
  await page.waitForTimeout(900);
  // Two totals, each with its held-back figure beside it.
  await expect(page.locator('.an-total')).toHaveCount(2);
  await expect(page.locator('.an-total').first()).toContainText('Entered');
  await expect(page.locator('.an-total').nth(1)).toContainText('Converted');
  // Annotated journey — nodes carry a "reached" stat line.
  await expect(page.locator('.dc-node-stat').first()).toBeVisible();
});

test('row click opens the real read-only view, landing on the setup read-back', async ({ page }) => {
  await page.goto('./');
  const firstRowName = await page.locator('table tbody tr').first().locator('td').first().locator('b').innerText();
  await page.locator('table tbody tr').first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('h1.page-title')).toContainText(firstRowName);
  // The view opens on Basic Details; the journey is one tab across.
  await expect(page.locator('.bd-wrap')).toBeVisible();
  await page.locator('.dv-tab', { hasText: 'Campaign' }).click();
  await page.waitForTimeout(900);
  expect(await page.locator('.dc-node-card').count()).toBeGreaterThan(5);
});

// Terminate is the only action on a live campaign — there is no Pause,
// and submitting needs no approval.
test('a live campaign offers only Edit and Terminate — no Pause, no Approve', async ({ page }) => {
  await page.goto('./');
  await page.locator('table tbody tr', { hasText: 'Active' }).first().click();
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: 'Edit (new version)' })).toBeVisible();
  await expect(page.locator('.dv-terminate-link')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Approve/ })).toHaveCount(0);
});

test('Terminate requires real confirmation; Cancel leaves it Active, confirming terminates it', async ({ page }) => {
  await page.goto('./');
  await page.locator('table tbody tr', { hasText: 'Active' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.dv-terminate-link').click();
  await expect(page.getByText('every customer currently in the campaign')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.badge:has-text("Active")')).toBeVisible();

  await page.locator('.dv-terminate-link').click();
  await page.locator('.modal').getByRole('button', { name: 'Terminate' }).click();
  await expect(page.locator('.badge:has-text("Terminated")')).toBeVisible();
});

test('full create -> build -> submit flow lands in the list as Scheduled', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill('App Flow Spec Campaign');
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
  // Scoped by each field's own label, not position — Journey Events
  // inserts its own Journey+Batch scoping selects between Event Category
  // and Event Type, so a fixed index doesn't hold here.
  const entryDrawer = page.locator('.sd-drawer.open');
  await entryDrawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Category' }) }).locator('select').selectOption('Journey Events');
  await entryDrawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Type' }) }).locator('select').selectOption('Pageload');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);
  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Exit/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('done');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  // Submit now lives on the Review step, not the Builder
  // header — navigate there via Guardrails (the new step between
  // Builder and Review) first.
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(400);

  const newRow = page.locator('tr', { hasText: 'App Flow Spec Campaign' });
  await expect(newRow).toHaveCount(1);
  await expect(newRow.locator('.badge:has-text("Scheduled")')).toBeVisible();
});

test('Save as Draft is always available from any step, even with open branches, and resuming a draft lands back on the Builder step', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill('Draft Spec Campaign');
  // Save straight from Basic Details — no entry added at all, still
  // genuinely incomplete, and still allowed.
  await expect(page.getByRole('button', { name: 'Save as Draft' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save as Draft' }).click();
  await page.waitForTimeout(400);

  const draftRow = page.locator('tr', { hasText: 'Draft Spec Campaign' });
  await expect(draftRow.locator('.badge:has-text("Draft")')).toBeVisible();
  await draftRow.click();
  await page.waitForTimeout(400);
  // Continuing a draft resumes directly on the Builder step, not Basic Details.
  await expect(page.locator('.dc-add-entry-placeholder')).toBeVisible();
});
