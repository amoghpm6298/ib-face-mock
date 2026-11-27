// Real-click coverage of the create/edit builder — ported from this
// project's own scratchpad verification scripts, formalized as a
// permanent, committed regression suite. Drives the actual DOM (clicks,
// selects, fills), never calls reducer/handler functions directly — this
// project's own established discipline, since direct-function-call tests
// have repeatedly missed real bugs (a missing <option value=...>
// attribute, a native multi-select interaction, React Flow's
// pointer-events:none on non-selectable nodes) that only driving the
// real DOM catches.
import { test, expect } from '@playwright/test';
import { MILESTONE_OFFERS } from '../../src/data/sharedConstants';

async function startNewCampaign(page: import('@playwright/test').Page, name: string) {
  await page.goto('./');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill(name);
  await page.locator('select').first().selectOption('IndusInd Bank (IBL)');
  // Say who it is for: an issuer with no programs and the toggle off reaches
  // nobody, and the submit gate refuses that now.
  await page.locator('.toggle-row .toggle').first().click();
  // "Skip to Builder" was removed — Continue to Goal is always enabled
  // now, so the same destination is two clicks through the real flow.
  await page.getByText('Continue to Goal →').click();
  await page.waitForTimeout(200);
  await page.getByText('Continue to Builder →').click();
  await page.waitForTimeout(300);
}

// The auto goal-check Split after Send/Pause is only
// inserted when a real campaign Goal is defined — this goes through the
// Goal Definition step instead of skipping it, for the handful of tests
// that specifically exercise that auto-insert behavior.
async function startNewCampaignWithGoal(page: import('@playwright/test').Page, name: string, eventCategory: string, eventType: string) {
  await page.goto('./');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill(name);
  await page.locator('select').first().selectOption('IndusInd Bank (IBL)');
  // Say who it is for: an issuer with no programs and the toggle off reaches
  // nobody, and the submit gate refuses that now.
  await page.locator('.toggle-row .toggle').first().click();
  await page.getByText('Continue to Goal →').click();
  await page.waitForTimeout(200);
  const goalSelects = page.locator('select');
  await goalSelects.nth(0).selectOption(eventCategory);
  await goalSelects.nth(1).selectOption(eventType);
  await page.getByText('Continue to Builder →').click();
  await page.waitForTimeout(300);
}

async function addEntryEvent(page: import('@playwright/test').Page, category: string, type: string) {
  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Event")').click();
  // Scoped by each field's own label, not position — Journey/Offer
  // Events now insert their own scoping selects (Journey+Batch or Offer
  // Type) between Event Category and Event Type, so a fixed index no
  // longer holds for every category.
  const drawer = page.locator('.sd-drawer.open');
  await drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Category' }) }).locator('select').selectOption(category);
  await drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Type' }) }).locator('select').selectOption(type);
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(300);
}

// The one filter row: what / comparison / value. `what` is the option value
// the grouped picker uses, "<group>::<field>".
async function setFilterRow(
  page: import('@playwright/test').Page,
  index: number,
  what: string,
  comparison?: string,
) {
  const row = page.locator('.sd-drawer.open .cond-row').nth(index);
  await row.locator('select').first().selectOption(what);
  await page.waitForTimeout(150);
  if (comparison) {
    await row.locator('select').nth(1).selectOption(comparison);
    await page.waitForTimeout(150);
  }
  return row;
}

// The milestone offer is a search, so it is picked by typing rather than
// selected from the what menu.
async function pickOffer(page: import('@playwright/test').Page, name: string) {
  const drawer = page.locator('.sd-drawer.open');
  const trigger = drawer.locator('.msel-trigger', { hasText: /Select…|Milestone/ }).first();
  await trigger.click();
  await page.waitForTimeout(150);
  await drawer.locator('.msel-panel input').first().fill(name.split(' ')[0]);
  await page.waitForTimeout(200);
  await drawer.locator('.msel-option', { hasText: name }).first().click();
  await page.waitForTimeout(200);
}

async function addFilter(page: import('@playwright/test').Page) {
  await page.locator('.sd-drawer.open .add-link', { hasText: '+ Add filter' }).click();
  await page.waitForTimeout(150);
}

// A Send grows one open slot and nothing else. It used to auto-insert a Wait
// listening for the goal — the best a positional model could do — but
// conversion is a campaign setting now, checked wherever the customer is, so
// the step is redundant and the canvas stays the author's.
test('Send grows one open slot, no goal steps; a fallback channel shows the FALLBACK tag on canvas', async ({ page }) => {
  await startNewCampaignWithGoal(page, 'Builder Spec: Send Chain', 'Card Events', 'Virtual card activated');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Send/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('Msg1');
  const sendSelects = page.locator('.sd-drawer.open select');
  await sendSelects.nth(0).selectOption('WHATSAPP');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select account' }).selectOption('IBL-Karix-Onb');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select template' }).selectOption({ index: 1 });
  await expect(page.locator('.sd-drawer.open .sd-foot button.btn.primary')).toBeEnabled();
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  // A goal is defined, and still nothing is drawn for it.
  await expect(page.locator('.dc-node-card:has-text("Wait for Event")')).toHaveCount(0);
  await expect(page.locator('.dc-node-card:has-text("Goal Check")')).toHaveCount(0);
  await expect(page.locator('.dc-node-card:has-text("Goal Reached")')).toHaveCount(0);
  await expect(page.locator('.dc-node-card')).toHaveCount(2); // entry + send
  await expect(page.locator('.dc-add-btn')).toHaveCount(1);
  await expect(page.locator('.dc-node-fallback-row')).toHaveCount(0);

  await page.locator('.dc-add-btn').click(); // the Send's own open slot
  await page.locator('.dc-type-opt', { hasText: /^Send/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('Msg2');
  const send2Selects = page.locator('.sd-drawer.open select');
  await send2Selects.nth(0).selectOption('WHATSAPP');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select account' }).selectOption({ index: 1 });
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select template' }).selectOption({ index: 1 });
  await page.waitForTimeout(150);
  // optional fallback channel section — a second account/template pair
  // appears once a fallback channel is chosen, so these are now the
  // SECOND match of each (nth(0) is the already-filled primary pair).
  await page.locator('.sd-drawer.open select', { hasText: 'No fallback' }).selectOption('SMS');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select account' }).nth(1).selectOption({ index: 1 });
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select template' }).nth(1).selectOption({ index: 1 });
  await expect(page.locator('.sd-drawer.open .sd-foot button.btn.primary')).toBeEnabled();
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await expect(page.locator('.dc-node-fallback-row')).toHaveCount(1);
  await expect(page.locator('.dc-node-card')).toHaveCount(3); // entry + two sends
  await expect(page.locator('.dc-node-card:has-text("Goal Check")')).toHaveCount(0);
});

test('Send does NOT get an auto goal-check when no campaign Goal is defined', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: No Goal Send');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Send/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('Msg1');
  const sendSelects = page.locator('.sd-drawer.open select');
  await sendSelects.nth(0).selectOption('WHATSAPP');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select account' }).selectOption('IBL-Karix-Onb');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select template' }).selectOption({ index: 1 });
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await expect(page.locator('.dc-node-card:has-text("Goal Check")')).toHaveCount(0);
  await expect(page.locator('.dc-add-btn')).toHaveCount(1);
});

// Goal Check is still a step you can add, but only while exit on conversion
// is off: with it on, an account that converts has already left the journey,
// so the check could only ever answer No. The switch itself lands with the
// Goal step's own settings, so for now every campaign has it on and the tile
// is offered-but-disabled, with the reason said out loud. The node's own
// behaviour (both arms open, removable) is covered in the reducer tests.
test('Goal Check is offered but disabled while customers exit on conversion', async ({ page }) => {
  await startNewCampaignWithGoal(page, 'Builder Spec: Goal Check Gate', 'Card Events', 'Virtual card activated');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  const tile = page.locator('.dc-type-opt', { hasText: 'Goal Check' });
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveClass(/disabled/);
  await expect(tile).toHaveAttribute('title', /leave the journey as soon as they convert/);
  // And Goal Reached is not a step at all any more.
  await expect(page.locator('.dc-type-opt', { hasText: 'Goal Reached' })).toHaveCount(0);
});

test('A Send card shows a visible, hover-revealed remove button, not just the hidden edge "x"', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Card Remove');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Send/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('RemovableSend');
  const sendSelects = page.locator('.sd-drawer.open select');
  await sendSelects.nth(0).selectOption('WHATSAPP');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select account' }).selectOption('IBL-Karix-Onb');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select template' }).selectOption({ index: 1 });
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  const card = page.locator('.dc-node-card', { hasText: 'RemovableSend' });
  await expect(card.locator('.dc-node-remove')).toBeHidden();
  await card.hover();
  await expect(card.locator('.dc-node-remove')).toBeVisible();
  await card.locator('.dc-node-remove').click();
  await page.waitForTimeout(400);

  await expect(page.locator('.dc-node-card', { hasText: 'RemovableSend' })).toHaveCount(0);
  await expect(page.locator('.dc-add-btn')).toHaveCount(1);
});

test('Mid-chain insert explains why its type list is narrower, instead of looking broken', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: MidEdge Hint');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Send/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('ChainSend');
  const sendSelects = page.locator('.sd-drawer.open select');
  await sendSelects.nth(0).selectOption('WHATSAPP');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select account' }).selectOption('IBL-Karix-Onb');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select template' }).selectOption({ index: 1 });
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  // No goal is defined, so this Send's own open slot is a plain linear
  // edge — hover it to reveal the mid-insert "+".
  const edge = page.locator('.dc-branch-label').first();
  await edge.hover();
  await page.waitForTimeout(150);
  await page.locator('.dc-edge-insert').first().click();
  await page.waitForTimeout(200);

  await expect(page.locator('.sd-drawer.open')).toContainText('Inserting mid-chain only supports single-continuation steps');
  // Every tile is still shown (Phase 1: disabled-with-a-reason beats silent
  // omission). Send is a single-continuation step and stays clickable.
  // Condition and Branch are both disabled: each leaves more than one arm
  // open, and the reducer only reattaches the downstream chain when exactly
  // one open slot remains, so splicing either one in would silently orphan
  // everything below it. Condition used to be offered here and was the
  // orphaning case.
  const sendTile = page.locator('.dc-type-opt', { hasText: /^Send/ });
  const conditionTile = page.locator('.dc-type-opt', { hasText: 'Condition' });
  const branchTile = page.locator('.dc-type-opt', { hasText: /^Branch/ });
  await expect(sendTile).toHaveCount(1);
  await expect(conditionTile).toHaveCount(1);
  await expect(branchTile).toHaveCount(1);
  await expect(sendTile).not.toHaveClass(/disabled/);
  await expect(conditionTile).toHaveClass(/disabled/);
  await expect(branchTile).toHaveClass(/disabled/);
  await expect(conditionTile).toHaveAttribute('title', /can't be inserted mid-chain/);
  await expect(branchTile).toHaveAttribute('title', /can't be inserted mid-chain/);
});

test('Pause grows a plain open slot; the one step still auto-inserted carries the replace badge', async ({ page }) => {
  await startNewCampaignWithGoal(page, 'Builder Spec: Pause', 'Card Events', 'Virtual card activated');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt:has-text("Wait for a fixed duration")').click();
  await page.locator('.sd-drawer.open input[type=number]').first().fill('3');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  // No goal step of any kind, and one slot to carry on from.
  await expect(page.locator('.dc-node-card:has-text("Goal Check")')).toHaveCount(0);
  await expect(page.locator('.dc-node-card')).toHaveCount(2);
  await expect(page.locator('.dc-add-btn')).toHaveCount(1);

  // A Wait for Event on a multi-outcome event still inserts its outcome
  // Condition — that was never about the goal: EMI_STATUS_CHANGED fires the
  // same event for Successful, Failed and Expired, so "it happened" is not
  // an answer. That node is auto-generated, and carries the replace badge.
  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt:has-text("Wait for Event")').click();
  const drawer = page.locator('.sd-drawer.open');
  await drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Category' }) }).locator('select').selectOption('EMI Events');
  await drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Type' }) }).locator('select').selectOption('EMI_STATUS_CHANGED');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await expect(page.locator('.dc-node-card:has-text("New Status?")')).toHaveCount(1);
  await page.locator('.dc-replace-badge').first().click();
  await page.waitForTimeout(300);
  await expect(page.locator('.sd-title')).toHaveText('Add Next Step');
  await page.locator('.sd-drawer.open .sd-foot button.btn.secondary').click();
});

test('Editing a node preserves its existing subtree; Cancel discards changes', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Edit');
  await addEntryEvent(page, 'Journey Events', 'Pageload');
  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Send/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('Original Name');
  await page.locator('.sd-drawer.open select').first().selectOption('WHATSAPP');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select account' }).selectOption('IBL-Karix-Onb');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select template' }).selectOption({ index: 1 });
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  const beforeCount = await page.locator('.dc-node-card').count();

  // Cancel: edit then discard.
  await page.locator('.dc-node-card:has-text("Original Name")').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.sd-title')).toHaveText('Edit Step');
  await page.locator('.sd-drawer.open input[type=text]').first().fill('SHOULD NOT STICK');
  await page.locator('.sd-drawer.open .sd-foot button.btn.secondary').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.dc-node-card:has-text("Original Name")')).toHaveCount(1);

  // Real edit: rename, subtree survives.
  await page.locator('.dc-node-card:has-text("Original Name")').click();
  await page.waitForTimeout(300);
  await page.locator('.sd-drawer.open input[type=text]').first().fill('Renamed');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);
  const afterCount = await page.locator('.dc-node-card').count();
  expect(afterCount).toBe(beforeCount);
  await expect(page.locator('.dc-node-card:has-text("Renamed")')).toHaveCount(1);
});


test('Decision Split: one shared what, per-arm comparisons, catch-all, mid-list insert preserves subtrees', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Decision Split');
  await addEntryEvent(page, 'Transaction Events', 'Transaction');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Branch/ }).click();
  await page.waitForTimeout(150);
  // One "What" for the whole Branch — no Source control, no separate
  // Attribute control.
  const drawer = page.locator('.sd-drawer.open');
  await drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'What' }) }).locator('select').selectOption('Account::Current OS amount');
  await page.waitForTimeout(200);

  const branchOpSelects = drawer.locator('select');
  const opCount = await branchOpSelects.count();
  for (let i = 0; i < opCount; i++) {
    const options = await branchOpSelects.nth(i).locator('option').allTextContents();
    if (options.includes('is between')) await branchOpSelects.nth(i).selectOption('is between');
  }
  const numberInputs = drawer.locator('input[type=number]');
  await numberInputs.nth(0).fill('5');
  await numberInputs.nth(1).fill('20');
  await numberInputs.nth(2).fill('21');
  await numberInputs.nth(3).fill('50');
  await expect(drawer.locator('.sd-foot button.btn.primary')).toBeEnabled();
  await drawer.locator('.sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await expect(page.locator('.dc-node-card:has-text("Current OS amount")')).toHaveCount(1);
  await expect(page.locator('.dc-branch-label:has-text("Anything else")')).toHaveCount(1);

  await page.locator('.dc-node-card:has-text("Current OS amount")').click();
  await page.waitForTimeout(300);
  const insertRows = page.locator('.dcb-insert-row');
  await expect(insertRows.nth(1)).toBeAttached();
  await insertRows.nth(1).hover();
  await insertRows.nth(1).click();
  await page.waitForTimeout(200);
  const labelInputs = page.locator('.sd-drawer.open input[type=text]');
  expect(await labelInputs.count()).toBeGreaterThanOrEqual(3);
});

test('Random Split requires branches to sum to 100%', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Random Split');
  await addEntryEvent(page, 'Journey Events', 'Pageload');
  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt:has-text("Experiment")').click();
  await page.waitForTimeout(150);
  const pctInputs = page.locator('.sd-drawer.open input[type=number]');
  await pctInputs.nth(0).fill('30');
  await pctInputs.nth(1).fill('30');
  await expect(page.locator('.sd-drawer.open .sd-foot button.btn.primary')).toBeDisabled();
  await pctInputs.nth(1).fill('70');
  await expect(page.locator('.sd-drawer.open .sd-foot button.btn.primary')).toBeEnabled();
});

test('Submit shows an on-demand validation banner with open branches, clears once every branch resolves', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Submit Gating');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  // Submit lives on the Review step now — get there via
  // Builder's topbar (-> Guardrails) then Guardrails' own footer (-> Review).
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);

  // The button itself is never disabled (on-demand validation, not a
  // permanent rail warning) — clicking it while incomplete surfaces a
  // banner instead of silently doing nothing.
  await expect(page.locator('button:has-text("Submit")')).toBeEnabled();
  await page.locator('button:has-text("Submit")').click();
  await page.waitForTimeout(200);
  await expect(page.locator('.dcb-validation-banner')).toBeVisible();
  // The gate names the step that is unfinished rather than saying "a branch
  // is open" — same issue, but it tells you where to go.
  await expect(page.locator('.dcb-validation-banner')).toContainText('has no next step');
  await expect(page.locator('.dcb-validation-banner')).toContainText('Pageload');

  // Back to the Builder step (via the rail) to close the open branch.
  await page.locator('.dcb-vstep', { hasText: 'Builder' }).click();
  await page.waitForTimeout(300);
  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Exit/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('done');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  // Completed now — back to Review, clicking Submit actually navigates
  // away (back to the list), rather than showing the banner again.
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Submit")').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.dcb-validation-banner')).toHaveCount(0);
  await expect(page.locator('table tbody tr', { hasText: 'Builder Spec: Submit Gating' })).toBeVisible();
});

test('Mid-chain insert splices a new node into an existing connection, preserving the downstream subtree; Undo/Redo round-trip correctly', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Mid Insert');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Send/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('First Send');
  const sendSelects = page.locator('.sd-drawer.open select');
  await sendSelects.nth(0).selectOption('WHATSAPP');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select account' }).selectOption({ index: 1 });
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open select', { hasText: 'Select template' }).selectOption({ index: 1 });
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  const countBefore = await page.locator('.dc-node-card').count();

  // Every tile shows up, but only single-continuation types are
  // clickable — branching/terminal ones render disabled instead of
  // being omitted (Phase 1 §10).
  await page.locator('.dc-edge-insert').first().click();
  await page.waitForTimeout(300);
  await expect(page.locator('.dc-type-opt', { hasText: 'Wait for a fixed duration' })).not.toHaveClass(/disabled/);
  await expect(page.locator('.dc-type-opt', { hasText: 'Experiment' })).toHaveClass(/disabled/);
  await expect(page.locator('.dc-type-opt', { hasText: /^Branch/ })).toHaveClass(/disabled/);

  await page.locator('.dc-type-opt', { hasText: 'Wait for a fixed duration' }).click();
  await page.locator('.sd-drawer.open input[type=number]').first().fill('2');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await expect(page.locator('.dc-node-card:has-text("Wait 2 days")')).toHaveCount(1);
  const countAfterInsert = await page.locator('.dc-node-card').count();
  expect(countAfterInsert).toBeGreaterThan(countBefore);

  // Undo removes exactly the inserted node (+ its own auto goal-check).
  await page.locator('button', { hasText: 'Undo' }).click();
  await page.waitForTimeout(400);
  await expect(page.locator('.dc-node-card:has-text("Wait 2 days")')).toHaveCount(0);
  expect(await page.locator('.dc-node-card').count()).toBe(countBefore);

  // Redo restores it.
  await page.locator('button', { hasText: 'Redo' }).click();
  await page.waitForTimeout(400);
  await expect(page.locator('.dc-node-card:has-text("Wait 2 days")')).toHaveCount(1);
  expect(await page.locator('.dc-node-card').count()).toBe(countAfterInsert);
});

test('Root remove button only appears on the root node and works via real hover + click', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Root Remove');
  await addEntryEvent(page, 'Journey Events', 'Pageload');
  await page.locator('.dc-node-card').first().hover();
  await expect(page.locator('.dc-node-remove')).toBeVisible();
  await page.locator('.dc-node-remove').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.dc-add-entry-placeholder')).toBeVisible();
});


test('Condition: a Transactions filter carries its own fields, lookback and direction, and forks Yes/No', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Txn History Condition');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt:has-text("Condition")').first().click();
  await page.waitForTimeout(200);
  await addFilter(page);
  const row = await setFilterRow(page, 0, 'Transactions::', 'no matching transaction exists');

  // The transaction fields themselves still use the same ConditionRows
  // every other filter uses, nested under the row they belong to.
  await expect(page.locator('.sd-drawer.open .add-link', { hasText: 'Add condition' })).toBeVisible();

  await row.locator('input[type=number]').first().fill('60');
  await page.waitForTimeout(200);

  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await expect(page.locator('.dc-node-card', { hasText: 'No transaction in the last 60 days?' })).toHaveCount(1);
  await expect(page.locator('.dc-branch-label', { hasText: 'Yes' })).toBeVisible();
  await expect(page.locator('.dc-branch-label', { hasText: 'No' })).toBeVisible();
});



test('Condition: a Milestone filter is an offer plus a typed threshold, percent by default', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Milestone Condition');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt:has-text("Condition")').first().click();
  await page.waitForTimeout(200);
  await addFilter(page);

  // One Milestone choice in the menu — the fifty offers are behind a search,
  // not listed here — and no option names an amount or a day count.
  const whatOptions = await page.locator('.sd-drawer.open .cond-row').first().locator('select').first().locator('option').allTextContents();
  expect(whatOptions.filter((o) => o === 'Milestone')).toHaveLength(1);
  for (const o of whatOptions) expect(o).not.toMatch(/Spend ₹/);

  const offer = MILESTONE_OFFERS[0];
  const row = await setFilterRow(page, 0, 'Milestone::', 'is at least');
  await pickOffer(page, offer.name);
  await row.locator('input[type=number]').first().fill('80');
  await page.waitForTimeout(200);

  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.dc-node-card', { hasText: `${offer.name} is at least 80%?` })).toHaveCount(1);
  await expect(page.locator('.dc-branch-label', { hasText: 'Yes' })).toBeVisible();
  await expect(page.locator('.dc-branch-label', { hasText: 'No' })).toBeVisible();

  // The same row can switch the typed value to a rupee amount.
  await page.locator('.dc-node-card', { hasText: offer.name }).click();
  await page.waitForTimeout(300);
  const reopened = page.locator('.sd-drawer.open .cond-row').nth(0);
  await reopened.locator('select').last().selectOption('rupees');
  await page.waitForTimeout(150);
  await reopened.locator('input[type=number]').first().fill('20000');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.dc-node-card', { hasText: `${offer.name} is at least ₹20,000?` })).toHaveCount(1);
});


test('Entry · Audience never blocks on a half-typed filter, and a complete Milestone row saves and reads back', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Milestone Entry');
  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Audience")').click();
  await page.waitForTimeout(200);

  // An audience with no filters targets everyone, so Add Step is enabled
  // from the start — and stays enabled while a row is half-typed, because
  // an incomplete row is ignored rather than treated as an error.
  await expect(page.locator('.sd-drawer.open .sd-foot button.btn.primary')).toBeEnabled();
  await addFilter(page);
  await expect(page.locator('.sd-drawer.open .sd-foot button.btn.primary')).toBeEnabled();

  const offer = MILESTONE_OFFERS[1];
  const row = await setFilterRow(page, 0, 'Milestone::', 'is at least');
  await pickOffer(page, offer.name);
  await row.locator('input[type=number]').first().fill('80');
  await page.waitForTimeout(150);

  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.dc-node-card', { hasText: 'All eligible customers' })).toHaveCount(1);

  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await expect(page.getByText(`${offer.name} is at least 80%`)).toBeVisible();
  await page.getByText('Save as Draft').click();
  await page.waitForTimeout(400);

  // Reopen and read the same sentence back. A draft reopens in the builder,
  // so Review is two steps forward from there.
  await page.locator('tr', { hasText: 'Builder Spec: Milestone Entry' }).click();
  await page.waitForTimeout(400);
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await expect(page.getByText(`${offer.name} is at least 80%`)).toBeVisible();
});


test('Branch: one Milestone offer shared across arms, each arm its own threshold, plus a catch-all', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Milestone Branch');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Branch/ }).click();
  await page.waitForTimeout(150);
  const drawer = page.locator('.sd-drawer.open');
  const offer = MILESTONE_OFFERS[2];
  await drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'What' }) }).locator('select').selectOption('Milestone::');
  await page.waitForTimeout(200);
  // One offer search, shared by every arm.
  await pickOffer(page, offer.name);

  // Arm 1: at least 80%. Arm 2: less than 40%. Same offer, own thresholds.
  const sel = () => drawer.locator('select');
  await sel().nth(1).selectOption('is at least');
  await page.waitForTimeout(150);
  await drawer.locator('input[type=number]').nth(0).fill('80');
  await sel().nth(3).selectOption('is less than');
  await page.waitForTimeout(150);
  await drawer.locator('input[type=number]').nth(1).fill('40');
  await page.waitForTimeout(150);

  await expect(drawer.locator('.sd-foot button.btn.primary')).toBeEnabled();
  await drawer.locator('.sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await expect(page.locator('.dc-node-card', { hasText: offer.name })).toHaveCount(1);
  await expect(page.locator('.dc-branch-label', { hasText: '≥ 80%' })).toBeVisible();
  await expect(page.locator('.dc-branch-label', { hasText: '< 40%' })).toBeVisible();
  await expect(page.locator('.dc-branch-label', { hasText: 'Anything else' })).toBeVisible();
});

test('Entry · Audience: a Transactions filter carries lookback and direction, and survives save/reopen', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Txn Entity Entry');
  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Audience")').click();
  await page.waitForTimeout(200);

  // Nothing until a row exists: an audience with no filters targets everyone.
  await expect(page.locator('.sd-drawer.open .cond-row')).toHaveCount(0);
  await addFilter(page);
  const row = await setFilterRow(page, 0, 'Transactions::', 'no matching transaction exists');
  await row.locator('input[type=number]').first().fill('90');
  await page.waitForTimeout(150);

  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  // Review reads the filter back as a sentence.
  await expect(page.getByText('No transaction in the last 90 days')).toBeVisible();
  await page.getByText('Save as Draft').click();
  await page.waitForTimeout(400);

  await page.locator('tr', { hasText: 'Builder Spec: Txn Entity Entry' }).click();
  await page.waitForTimeout(400);
  await page.locator('.dc-node-card').first().click();
  await page.waitForTimeout(300);
  const reopened = page.locator('.sd-drawer.open .cond-row').nth(0);
  await expect(reopened.locator('select').first()).toHaveValue('Transactions::');
  await expect(reopened.locator('select').nth(1)).toHaveValue('no matching transaction exists');
  await expect(reopened.locator('input[type=number]').first()).toHaveValue('90');
});

test('Goal Definition: Journey Events shows its own scoping fields + a locked-attribute condition row, and both survive save/reopen', async ({ page }) => {
  // The Goal step is a plain full-width page (dcb-mid-inner), not a side
  // drawer — unlike every node's own config form.
  await page.goto('./');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill('Builder Spec: Journey Events Goal');
  await page.locator('select').first().selectOption('IndusInd Bank (IBL)');
  // Say who it is for: an issuer with no programs and the toggle off reaches
  // nobody, and the submit gate refuses that now.
  await page.locator('.toggle-row .toggle').first().click();
  await page.getByText('Continue to Goal →').click();
  await page.waitForTimeout(200);

  const goalSelects = page.locator('select');
  await goalSelects.nth(0).selectOption('Journey Events');
  await page.waitForTimeout(200);

  // Journey/Batch scoping selects appear immediately, before an Event
  // Type is even picked — same layout order as the original event-based-
  // nudges wizard this was ported from.
  await expect(page.locator('label.f-label', { hasText: 'Journey' })).toBeVisible();
  await expect(page.locator('label.f-label', { hasText: 'Batch' })).toBeVisible();
  await goalSelects.filter({ hasText: 'Select' }).first().selectOption('Onboarding');

  // No Goal Conditions block yet — no Event Type picked, so no locked
  // attribute resolves (same "nothing to render" rule as Card Events).
  await expect(page.getByText('Goal Conditions')).toHaveCount(0);

  await goalSelects.nth(1).selectOption('Pageload');
  await page.waitForTimeout(200);

  // Now it appears, with the real "+ Add condition" link every other
  // Condition source uses.
  await expect(page.getByText('Goal Conditions')).toBeVisible();
  await page.getByText('+ Add condition').click();
  await page.waitForTimeout(200);

  // Attribute is locked (disabled, pre-filled), not a picker — "Page
  // Name" per EVENT_ATTR_BY_TYPE['Pageload'], the one real narrowing
  // attribute Pageload has.
  const condRow = page.locator('.cond-row').first();
  await expect(condRow.locator('input:disabled')).toHaveValue('Page Name');
  // And its VALUE is a closed list, not free text — pageNameOptions in the
  // real screen. This test used to type "EMI Offer Page", which was never a
  // real page name; being able to save it was the bug.
  await expect(condRow.locator('input[placeholder="Value"]')).toHaveCount(0);
  const valueSelect = condRow.locator('select').last();
  await expect(valueSelect.locator('option')).toHaveText([/Value|Select/, 'landing', 'success', 'error']);
  await valueSelect.selectOption('landing');

  await page.getByText('Continue to Builder →').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await page.getByText('Save as Draft').click();
  await page.waitForTimeout(400);

  // Reopen and confirm the scoping pick and the locked-attribute
  // condition both survived the round trip.
  await page.locator('tr', { hasText: 'Builder Spec: Journey Events Goal' }).click();
  await page.waitForTimeout(400);
  await page.getByText('Goal', { exact: true }).click();
  await page.waitForTimeout(300);
  await expect(page.locator('select').filter({ hasText: 'Onboarding' })).toHaveCount(1);
  const reopenedCondRow = page.locator('.cond-row').first();
  await expect(reopenedCondRow.locator('input:disabled')).toHaveValue('Page Name');
  await expect(reopenedCondRow.locator('select').last()).toHaveValue('landing');
});


test('Condition and Branch do not ask about the entry event again', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: No Entry Event Group');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt:has-text("Condition")').first().click();
  await page.waitForTimeout(200);
  await addFilter(page);
  // The journey already started from that event; a later filter does not
  // offer it as something to narrow on.
  const groups = await page.locator('.sd-drawer.open .cond-row').first().locator('select').first().locator('optgroup').evaluateAll((els) => els.map((e) => (e as HTMLOptGroupElement).label));
  expect(groups).not.toContain('Entry event');
  expect(groups).toContain('Account');
  expect(groups).toContain('Previous message');
  await page.locator('.sd-drawer.open .sd-foot button.btn.secondary').click();
  await page.waitForTimeout(200);
});

test('Entry · Audience: two filters from different groups are AND\'d, and survive save/reopen', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Multi Entity Entry');
  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Audience")').click();
  await page.waitForTimeout(200);

  await addFilter(page);
  const first = await setFilterRow(page, 0, 'Account::Status', 'is');
  await first.locator('select').last().selectOption('Dormant');
  await page.waitForTimeout(150);

  await addFilter(page);
  const second = await setFilterRow(page, 1, 'Card::Status', 'is');
  await second.locator('select').last().selectOption('Active');
  await page.waitForTimeout(150);

  // Both rows AND together, stated once rather than per row.
  await expect(page.locator('.sd-drawer.open').getByText('A customer must match all of them.')).toBeVisible();

  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await expect(page.getByText('Status is Dormant')).toBeVisible();
  await expect(page.getByText('Status is Active')).toBeVisible();
  await page.getByText('Save as Draft').click();
  await page.waitForTimeout(400);

  await page.locator('tr', { hasText: 'Builder Spec: Multi Entity Entry' }).click();
  await page.waitForTimeout(400);
  await page.locator('.dc-node-card').first().click();
  await page.waitForTimeout(300);
  await expect(page.locator('.sd-drawer.open .cond-row').nth(0).locator('select').first()).toHaveValue('Account::Status');
  await expect(page.locator('.sd-drawer.open .cond-row').nth(1).locator('select').first()).toHaveValue('Card::Status');
});

test('Parallel paths: a second path can be added from the same step, and each path can be named', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Parallel Paths');
  await addEntryEvent(page, 'Card Events', 'Virtual card activated');

  const entry = page.locator('.dc-node-card', { hasText: 'Virtual card activated' });
  const drawer = page.locator('.sd-drawer.open');

  // With no children yet, the ordinary "+" slot is the only way to add —
  // offering a second control for the same action would just be noise.
  await expect(entry.locator('.dc-parallel-badge')).toHaveCount(0);

  await page.locator('.dc-add-btn').first().click();
  await page.locator('.dc-type-opt:has-text("Wait for a fixed duration")').click();
  await page.waitForTimeout(150);
  await drawer.locator('input[type=number]').fill('30');
  await drawer.locator('.sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  // Now that it has one child, the parallel-path control appears.
  await expect(entry.locator('.dc-parallel-badge')).toHaveCount(1);
  await entry.hover();
  await entry.locator('.dc-parallel-badge').click();
  await page.waitForTimeout(250);
  await page.locator('.dc-type-opt:has-text("Wait for a fixed duration")').click();
  await page.waitForTimeout(150);
  await drawer.locator('input[type=number]').fill('90');
  await drawer.locator('.sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  // Two genuinely independent paths off the same entry — not a chain.
  await expect(page.locator('.dc-node-card', { hasText: 'Wait 30 days' })).toHaveCount(1);
  await expect(page.locator('.dc-node-card', { hasText: 'Wait 90 days' })).toHaveCount(1);

  // Each now offers a name, since there's more than one to tell apart.
  const prompts = page.locator('.dc-branch-label-text.placeholder');
  await expect(prompts).toHaveCount(2);
  await prompts.first().click();
  await page.waitForTimeout(150);
  const input = page.locator('.dc-branch-label-input');
  await input.fill('Month 1');
  await input.press('Enter');
  await page.waitForTimeout(300);

  await expect(page.locator('.dc-branch-label-text', { hasText: 'Month 1' })).toHaveCount(1);
  await expect(page.locator('.dc-branch-label-text.placeholder')).toHaveCount(1);
});

test('A single linear connector is never offered a name — only genuinely parallel paths are', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: No Name On Linear');
  await addEntryEvent(page, 'Journey Events', 'Pageload');
  const drawer = page.locator('.sd-drawer.open');

  await page.locator('.dc-add-btn').first().click();
  await page.locator('.dc-type-opt:has-text("Wait for a fixed duration")').click();
  await page.waitForTimeout(150);
  await drawer.locator('input[type=number]').fill('7');
  await drawer.locator('.sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  // One child only — the connector is unambiguous, so no naming prompt
  // clutters it.
  await expect(page.locator('.dc-branch-label-text')).toHaveCount(0);
});


test('Condition picks its question from the one what list, with no Goal entry', async ({ page }) => {
  await startNewCampaignWithGoal(page, 'Builder Spec: Condition Source', 'Journey Events', 'Pageload');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').first().click();
  await page.locator('.dc-type-opt:has-text("Condition")').first().click();
  await page.waitForTimeout(200);
  const drawer = page.locator('.sd-drawer.open');
  await expect(drawer.locator('label.f-label', { hasText: 'Source' })).toHaveCount(0);
  await addFilter(page);
  const whatOptions = await drawer.locator('.cond-row').first().locator('select').first().locator('option').allTextContents();
  expect(whatOptions).not.toContain('Goal');
  expect(whatOptions).toContain('Previous message outcome');
  await drawer.locator('.sd-foot button.btn.secondary').click();
  await page.waitForTimeout(250);
});


test('Goal Check is offered but disabled when no campaign Goal is defined', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Goal Check No Goal');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').first().click();
  await page.waitForTimeout(150);
  // Shown, not hidden — a missing tile reads as "this product can't do
  // that", a disabled one with a reason reads as "not yet, here's why".
  const tile = page.locator('.dc-type-opt', { hasText: 'Goal Check' });
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveClass(/disabled/);
});

test('The spec walkthrough: two Account money filters on entry, the same one on a Condition, and the group list per step', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Outstanding Filters');

  // --- Entry · Audience: Current OS amount is at least ₹20,000 AND
  //     Utilization is at least 70% ---
  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Audience")').click();
  await page.waitForTimeout(200);

  await addFilter(page);
  const os = await setFilterRow(page, 0, 'Account::Current OS amount', 'is at least');
  await os.locator('input[type=number]').first().fill('20000');
  await page.waitForTimeout(150);

  await addFilter(page);
  const util = await setFilterRow(page, 1, 'Account::Utilization', 'is at least');
  await util.locator('input[type=number]').first().fill('70');
  await page.waitForTimeout(150);

  // Entry has no message before it, so Previous message is not offered here.
  const entryWhat = await page.locator('.sd-drawer.open .cond-row').first().locator('select').first().locator('option').allTextContents();
  expect(entryWhat).not.toContain('Previous message outcome');

  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  // --- the same outstanding filter on a Condition later in the journey ---
  await page.locator('.dc-add-btn').first().click();
  await page.locator('.dc-type-opt:has-text("Condition")').first().click();
  await page.waitForTimeout(200);
  await addFilter(page);

  const condWhat = await page.locator('.sd-drawer.open .cond-row').first().locator('select').first().locator('option').allTextContents();
  // Card and Customer filters are available here, and so is Previous message.
  expect(condWhat).toContain('Current OS amount');
  expect(condWhat).toContain('Card Expiry');
  expect(condWhat).toContain('Date of Birth');
  expect(condWhat).toContain('Previous message outcome');

  const condRow = await setFilterRow(page, 0, 'Account::Current OS amount', 'is at least');
  await condRow.locator('input[type=number]').first().fill('20000');
  await page.waitForTimeout(150);
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.dc-node-card', { hasText: 'Current OS amount is at least ₹20,000?' })).toHaveCount(1);

  // --- save, reopen, read both sentences on Review ---
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await expect(page.getByText('Current OS amount is at least ₹20,000').first()).toBeVisible();
  await expect(page.getByText('Utilization is at least 70%')).toBeVisible();
  await page.getByText('Save as Draft').click();
  await page.waitForTimeout(400);

  await page.locator('tr', { hasText: 'Builder Spec: Outstanding Filters' }).click();
  await page.waitForTimeout(400);
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await expect(page.getByText('Current OS amount is at least ₹20,000').first()).toBeVisible();
  await expect(page.getByText('Utilization is at least 70%')).toBeVisible();
});

test('App activity: search the event list, details follow the event, and the sentence survives save and reopen', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: App Activity');
  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Audience")').click();
  await page.waitForTimeout(200);
  await addFilter(page);
  await setFilterRow(page, 0, 'App activity::');

  const drawer = page.locator('.sd-drawer.open');
  // The event control is a search, because the list is long.
  await drawer.locator('.msel-trigger').first().click();
  await page.waitForTimeout(150);
  expect(await drawer.locator('.msel-option').count()).toBeGreaterThanOrEqual(40);
  await drawer.locator('.msel-panel input').first().fill('otp');
  await page.waitForTimeout(200);
  const otp = await drawer.locator('.msel-option').allTextContents();
  expect(otp.length).toBeGreaterThan(0);
  expect(otp.length).toBeLessThan(10);
  for (const t of otp) expect(t).toMatch(/OTP/i);
  // The raw event name is searchable even though it is never displayed.
  await drawer.locator('.msel-panel input').first().fill('Authentication Transaction Success');
  await page.waitForTimeout(200);
  expect((await drawer.locator('.msel-option').allTextContents()).join()).toContain('Continue after OTP');

  // Verify OTP has no details, so no extra field appears.
  await drawer.locator('.msel-panel input').first().fill('Verify OTP');
  await page.waitForTimeout(200);
  await drawer.locator('.msel-option').first().click();
  await page.waitForTimeout(200);
  await expect(drawer.locator('label.f-label', { hasText: 'Offer' })).toHaveCount(0);

  // Offer clicked does, so the offer search appears.
  await drawer.locator('.msel-trigger').first().click();
  await page.waitForTimeout(150);
  await drawer.locator('.msel-panel input').first().fill('Offer clicked');
  await page.waitForTimeout(200);
  await drawer.locator('.msel-option').first().click();
  await page.waitForTimeout(200);
  await expect(drawer.locator('label.f-label', { hasText: 'Offer' })).toHaveCount(1);

  await drawer.locator('.msel-trigger').nth(1).click();
  await page.waitForTimeout(150);
  await drawer.locator('.msel-option', { hasText: 'Welcome Offer' }).first().click();
  await page.waitForTimeout(200);
  await page.locator('.sd-drawer.open .cond-row').nth(0).locator('input[type=number]').first().fill('7');
  await page.waitForTimeout(200);

  await drawer.locator('.sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await expect(page.getByText('Offer clicked, Welcome Offer, happened in the last 7 days')).toBeVisible();
  await page.getByText('Save as Draft').click();
  await page.waitForTimeout(400);

  await page.locator('tr', { hasText: 'Builder Spec: App Activity' }).click();
  await page.waitForTimeout(400);
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await expect(page.getByText('Offer clicked, Welcome Offer, happened in the last 7 days')).toBeVisible();
});

test('App activity on a Branch: one event, two arms naming two different offers', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: App Activity Branch');
  await addEntryEvent(page, 'Journey Events', 'Pageload');

  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Branch/ }).click();
  await page.waitForTimeout(150);
  const drawer = page.locator('.sd-drawer.open');
  await drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'What' }) }).locator('select').selectOption('App activity::');
  await page.waitForTimeout(200);

  // The event is chosen once, for the whole Branch.
  await drawer.locator('.msel-trigger').first().click();
  await page.waitForTimeout(150);
  await drawer.locator('.msel-panel input').first().fill('Offer clicked');
  await page.waitForTimeout(200);
  await drawer.locator('.msel-option').first().click();
  await page.waitForTimeout(250);

  // Each arm then sets its own direction, window and offer. Arms start
  // blank, the same as every other group's arms.
  const armOffer = async (armIndex: number, offer: string, days: string) => {
    await drawer.locator('select').nth(armIndex + 1).selectOption('happened');
    await page.waitForTimeout(150);
    await drawer.locator('input[type=number]').nth(armIndex).fill(days);
    await page.waitForTimeout(150);
    await drawer.locator('.msel-trigger').nth(armIndex + 1).click();
    await page.waitForTimeout(150);
    await drawer.locator('.msel-option', { hasText: offer }).first().click();
    await page.waitForTimeout(200);
  };
  await armOffer(0, 'Welcome Offer', '7');
  await armOffer(1, 'Dining Cashback', '14');

  await expect(drawer.locator('.sd-foot button.btn.primary')).toBeEnabled();
  await drawer.locator('.sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await expect(page.locator('.dc-node-card', { hasText: 'Offer clicked' })).toHaveCount(1);
  await expect(page.locator('.dc-branch-label', { hasText: 'Welcome Offer, happened in 7 days' })).toBeVisible();
  await expect(page.locator('.dc-branch-label', { hasText: 'Dining Cashback, happened in 14 days' })).toBeVisible();
  await expect(page.locator('.dc-branch-label', { hasText: 'Anything else' })).toBeVisible();
});

test('Card controls: a channel row and a limit row on entry, both read back on Review', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Card Controls');
  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Audience")').click();
  await page.waitForTimeout(200);

  await addFilter(page);
  const onOff = await setFilterRow(page, 0, 'Card controls::Domestic online');
  await onOff.locator('select').last().selectOption('turned on');
  await page.waitForTimeout(150);

  await addFilter(page);
  const limit = await setFilterRow(page, 1, 'Card controls::Domestic online daily limit', 'is');
  await limit.locator('input[type=number]').first().fill('10000');
  await page.waitForTimeout(150);

  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  // The channel's own on/off and its limit are separate rows, and read as
  // separate sentences.
  await expect(page.getByText('Domestic online is turned on')).toBeVisible();
  await expect(page.getByText('Domestic online daily limit is ₹10,000')).toBeVisible();
});

test('Card events: the replaced list, Card control updated details, and the round trip', async ({ page }) => {
  await startNewCampaign(page, 'Builder Spec: Card Event Detail');
  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Event")').click();
  await page.waitForTimeout(200);

  const drawer = page.locator('.sd-drawer.open');
  const byLabel = (label: string) => drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: label }) }).locator('select');
  await byLabel('Event Category').selectOption('Card Events');
  await page.waitForTimeout(250);

  const options = await byLabel('Event Type').locator('option').allTextContents();
  for (const gone of ['Card Issued', 'Card Activated', 'Card Loaded', 'Card Inactive']) expect(options).not.toContain(gone);
  expect(options).toContain('Virtual card issued');
  expect(options).toContain('Card control updated');

  // A card event with no details shows no detail block at all.
  await byLabel('Event Type').selectOption('PIN set');
  await page.waitForTimeout(250);
  await expect(drawer.locator('label.f-label', { hasText: 'Event detail' })).toHaveCount(0);

  await byLabel('Event Type').selectOption('Card control updated');
  await page.waitForTimeout(250);
  const details = drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event detail' }) }).locator('select');
  await details.nth(0).selectOption('Domestic online');
  await page.waitForTimeout(150);
  await details.nth(1).selectOption('turned on');
  await page.waitForTimeout(250);

  await drawer.locator('.sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.dc-node-card', { hasText: 'Card control updated, Domestic online, turned on' })).toHaveCount(1);

  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await page.getByText('Save as Draft').click();
  await page.waitForTimeout(400);

  await page.locator('tr', { hasText: 'Builder Spec: Card Event Detail' }).click();
  await page.waitForTimeout(500);
  await expect(page.locator('.dc-node-card', { hasText: 'Card control updated, Domestic online, turned on' })).toHaveCount(1);
});

test('A sample activation campaign opens on Virtual card issued with the goal Virtual card activated', async ({ page }) => {
  await page.goto('./');
  await page.locator('tr', { hasText: 'Card Activation Reminder' }).first().click();
  await page.waitForTimeout(600);
  await expect(page.locator('.page-sub', { hasText: 'Goal: Virtual card activated' })).toBeVisible();
  await page.locator('.dv-tab', { hasText: 'Campaign' }).click();
  await page.waitForTimeout(900);
  await expect(page.locator('.dc-node-card', { hasText: 'Virtual card issued' })).toHaveCount(1);
});

test('Campaign view: three tabs, and Basic Details reads back the setup', async ({ page }) => {
  await page.goto('./');
  await page.locator('tr', { hasText: 'Card Activation Reminder' }).first().click();
  await page.waitForTimeout(600);

  await expect(page.locator('.dv-tab')).toHaveText(['Basic Details', 'Campaign', 'Analytics']);
  // Basic Details is the tab you land on, and it is a read-back.
  await expect(page.locator('.bd-row', { hasText: 'Goal' }).first()).toContainText('Virtual card activated');
  await expect(page.locator('.bd-row', { hasText: 'Control group' })).toContainText('10% held back');
  // Neither exclusion list is on for this campaign, so it says so.
  await expect(page.locator('.bd-row', { hasText: 'Exclusion lists' })).toContainText('No exclusion lists are applied');
});

test('Campaign view: clicking a step opens it read-only, without starting an edit', async ({ page }) => {
  await page.goto('./');
  await page.locator('tr', { hasText: 'Card Activation Reminder' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.dv-tab', { hasText: 'Campaign' }).click();
  await page.waitForTimeout(1200);

  await page.locator('.dc-node-card', { hasText: 'Reminder 2' }).first().click();
  await page.waitForTimeout(400);
  const panel = page.locator('.sp-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.sp-row', { hasText: 'Channel' })).toContainText('SMS');
  await expect(panel.locator('.sp-row', { hasText: 'Account' })).toContainText('IBL-Karix-Txns');
  await expect(panel.locator('.sp-row', { hasText: 'Template' })).toContainText('EMI Conversion SMS');
  await expect(panel.locator('.sp-row', { hasText: 'Sends' })).toBeVisible();
  // Still the view, not the builder: no wizard rail, no Add Step.
  await expect(page.locator('.dcb-rail')).toHaveCount(0);
  await expect(page.locator('.dc-add-btn')).toHaveCount(0);

  await panel.locator('.sp-close').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.sp-panel')).toHaveCount(0);
});

test('Campaign view: Analytics totals, arrow splits, and following one path', async ({ page }) => {
  await page.goto('./');
  // Card Activation Reminder is a straight line now that conversion is not
  // drawn on the canvas, so it has no fork to measure. OS to EMI still
  // splits — a real Experiment, which is what this is about.
  await page.locator('tr', { hasText: 'OS to EMI' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.dv-tab', { hasText: 'Analytics' }).click();
  await page.waitForTimeout(1400);

  // Two totals, each with its held-back figure beside it. No conversion
  // rate and no single still-in-sequence total.
  await expect(page.locator('.an-total')).toHaveCount(2);
  await expect(page.locator('.an-total').first()).toContainText('Held back');
  await expect(page.locator('.an-total').nth(1)).toContainText('Held back, converted anyway');
  // Both groups, one window, and the difference said with its sign.
  await expect(page.locator('.an-note')).toContainText('for both groups');
  await expect(page.getByText('Conversion Rate')).toHaveCount(0);
  await expect(page.getByText('Still In Sequence')).toHaveCount(0);

  // A split writes counts on its arrows. The experiment's own allocation is
  // part of each arm's NAME, so the "no %" rule is checked on the count that
  // follows it rather than on the whole chip.
  const labels = await page.locator('.dc-branch-label').allTextContents();
  expect(labels.some((l) => /WhatsApp\(50%\)[\d,]/.test(l.replace(/\s/g, '')))).toBe(true);
  expect(labels.some((l) => /SMS\(50%\)[\d,]/.test(l.replace(/\s/g, '')))).toBe(true);
  for (const l of labels) expect(l.replace(/\(\d+%\)/, '')).not.toContain('%');

  // Following one arm of the experiment fades everything off that path.
  await page.locator('.dc-branch-label', { hasText: 'SMS' }).first().click();
  await page.waitForTimeout(600);
  await expect(page.locator('.an-path')).toBeVisible();
  const items = await page.locator('.an-path-list li').allTextContents();
  expect(items.join(' ')).toMatch(/OS to EMI Offer/);
  expect(items.join(' ')).toMatch(/Wait/);
  const faded = await page.locator('.dc-node-card').evaluateAll((els) => els.filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.5).length);
  expect(faded).toBeGreaterThan(0);

  // And the whole journey comes back.
  await page.locator('.an-path-clear').click();
  await page.waitForTimeout(500);
  const fadedAfter = await page.locator('.dc-node-card').evaluateAll((els) => els.filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.5).length);
  expect(fadedAfter).toBe(0);
});

test('Campaign view: a campaign that never ran says so on Analytics', async ({ page }) => {
  await page.goto('./');
  await page.locator('tr', { hasText: 'Card Issuance to Activation' }).first().click();
  await page.waitForTimeout(600);
  // The tab is there either way — a missing tab reads as a missing feature.
  await expect(page.locator('.dv-tab')).toHaveCount(3);
  await page.locator('.dv-tab', { hasText: 'Analytics' }).click();
  await page.waitForTimeout(500);
  await expect(page.locator('.an-empty')).toContainText("hasn't run yet");
  await expect(page.locator('.an-total')).toHaveCount(0);
});

// The H3 suite lived here: a Wait for Event used to shortcut to Goal Reached
// when its predicate met the goal, and get a Goal Check when it was broader.
// A wait wires neither now — conversion is a campaign setting — so there is
// no behaviour left for this to drive. The predicate comparison it was built
// around survives, and is still tested: an Entry · Event that already
// satisfies the goal is refused at submit (goalPredicate.test.ts).


// M7 — an issuer with no programs and the all-programs toggle off reaches
// nobody. The campaign was otherwise complete and submitted happily.
test('Submit refuses a campaign addressed to no programs, and accepts it once that is answered', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill('Builder Spec: No Programs');
  await page.locator('select').first().selectOption('IndusInd Bank (IBL)');
  // Deliberately NOT answering who it is for.
  await page.getByText('Continue to Goal →').click();
  await page.waitForTimeout(200);
  await page.getByText('Continue to Builder →').click();
  await page.waitForTimeout(300);
  await addEntryEvent(page, 'Journey Events', 'Pageload');
  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Exit/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('done');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Submit")').click();
  await page.waitForTimeout(200);
  await expect(page.locator('.dcb-validation-banner')).toContainText('reach nobody');

  // Answer it on Basic Details — a real program, not the toggle, to prove
  // either answer satisfies the gate.
  await page.locator('.dcb-vstep', { hasText: 'Basic Details' }).click();
  await page.waitForTimeout(300);
  // The program chips are plain divs, not a labelled control — picked by
  // the program's own name, which is what a person reads too.
  await page.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Program' }) }).getByText('Platinum Aura', { exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByText('Continue to Goal →').click();
  await page.waitForTimeout(200);
  await page.getByText('Continue to Builder →').click();
  await page.waitForTimeout(200);
  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Submit")').click();
  await page.waitForTimeout(400);
  await expect(page.locator('table tbody tr', { hasText: 'Builder Spec: No Programs' })).toBeVisible();
});

// M8 — entering on the goal event means everyone converts on arrival: the
// funnel reads 100% and no message in the campaign caused any of it.
test('Submit refuses a campaign whose entry event is the goal event itself', async ({ page }) => {
  await startNewCampaignWithGoal(page, 'Builder Spec: Entry Is Goal', 'Card Events', 'Virtual card activated');
  await addEntryEvent(page, 'Card Events', 'Virtual card activated');
  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Exit/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('done');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Submit")').click();
  await page.waitForTimeout(200);
  await expect(page.locator('.dcb-validation-banner')).toContainText('already achieved the goal');
});
