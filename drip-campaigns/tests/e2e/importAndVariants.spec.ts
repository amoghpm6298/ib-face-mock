// Real-click coverage for three things that had unit tests but no UI
// coverage: the seeded labels as the canvas actually renders them, the
// default name a new arm gets, and what the Import screen says about a file
// it will not take.
import { test, expect } from '@playwright/test';

// A live campaign opens the read-only view, where the journey is behind the
// Campaign tab. A DRAFT opens the builder instead, whose canvas is already
// on screen — same canvas component either way.
async function openJourney(page: import('@playwright/test').Page, name: string, isDraft = false) {
  await page.goto('./');
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
  await page.goto('./');
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
  await page.goto('./');
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

// M3 — a Send offers a time of day or "as soon as they reach this step", and
// nowhere to hide a delay. A gap is a Wait step, which the canvas shows and
// which stops the moment the goal is reached.
test('a Send has no delay field, and says where a gap belongs instead', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill('Send timing');
  await page.locator('select').first().selectOption('IndusInd Bank (IBL)');
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
  await page.locator('.dc-type-opt', { hasText: /^Send/ }).click();
  const drawer = page.locator('.sd-drawer.open');
  const timing = drawer.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Timing' }) }).locator('select');
  await expect(timing.locator('option')).toHaveText(['At a set time of day', 'As soon as they reach this step']);

  // Absolute says what "11:00" actually means for someone arriving later.
  await expect(drawer).toContainText('If that time has already passed, it sends the next day');

  // The other option offers no delay inputs — it points at a Wait step.
  await timing.selectOption('Immediate');
  await page.waitForTimeout(200);
  await expect(drawer).toContainText('add a Wait step before it');
  await expect(drawer.locator('input[type=number]')).toHaveCount(0);

  await drawer.locator('input[type=text]').first().fill('Nudge');
  await drawer.locator('select', { hasText: 'Select account' }).selectOption('IBL-Karix-Onb');
  await page.waitForTimeout(150);
  await drawer.locator('select', { hasText: 'Select template' }).selectOption({ index: 1 });
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await expect(page.locator('.dc-node-card', { hasText: 'Nudge' })).toContainText('As soon as they reach this step');
});

// H7 — quiet hours, on by default, and said back in plain words.
test('quiet hours are on by default, editable, and read back on the campaign', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill('Quiet hours');
  await page.locator('select').first().selectOption('IndusInd Bank (IBL)');
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
  await page.locator('.dc-type-opt', { hasText: /^Exit/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('done');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.dcb-mid-inner')).toContainText('TRAI allows promotional messages between 9am and 9pm');
  // On by default, with the TRAI window already filled in.
  const from = page.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Quiet from' }) }).locator('input');
  await expect(from).toHaveValue('21:00');
  // Switch the behaviour to dropping the message.
  await page.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'comes due during quiet hours' }) }).locator('select').selectOption('skip');
  await page.waitForTimeout(150);

  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.dcb-mid-inner')).toContainText('No messages between 9:00 PM and 9:00 AM');
  await expect(page.locator('.dcb-mid-inner')).toContainText('is not sent at all');

  await page.locator('button:has-text("Submit")').click();
  await page.waitForTimeout(400);
  await page.locator('table tbody tr', { hasText: 'Quiet hours' }).click();
  await page.waitForTimeout(500);
  const details = page.locator('.dv-body, .bd-wrap, main').first();
  await expect(details).toContainText('No messages between 9:00 PM and 9:00 AM');
  // And what one run counts as, which is the thing re-entry depends on.
  await expect(details).toContainText('A customer with two cards on one account goes through this campaign once');
});

// Commit 2 — the Goal step says what counts as a conversion, suggests a
// window from the journey, and reads both back on Review and the campaign.
test('the goal carries a conversion window and an exit rule, read back everywhere', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill('Conversion settings');
  await page.locator('select').first().selectOption('IndusInd Bank (IBL)');
  await page.locator('.toggle-row .toggle').first().click();
  await page.getByText('Continue to Goal →').click();
  await page.waitForTimeout(200);

  // No goal yet, so nothing about conversions is on screen.
  await expect(page.locator('.dcb-mid-inner')).not.toContainText('What counts as a conversion');

  const goalSelects = page.locator('select');
  await goalSelects.nth(0).selectOption('Card Events');
  await goalSelects.nth(1).selectOption('Virtual card activated');
  await page.waitForTimeout(300);

  // A window is suggested the moment the goal is set — the journey is empty
  // here, so it is the buffer on its own — and the rule is said in words.
  const windowField = page.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Count it if it happens within' }) }).locator('input[type=number]');
  await expect(windowField).toHaveValue('3');
  // The window has its own field here, so the sentence above it does not
  // repeat the number — Review and the campaign view say the long form.
  await expect(page.locator('.dcb-mid-inner')).toContainText('A conversion is someone doing Virtual card activated after they enter this campaign.');
  await expect(page.locator('.dcb-mid-inner')).toContainText('This affects reporting only. It does not change who gets messaged.');

  await windowField.fill('21');
  await page.waitForTimeout(200);
  await expect(windowField).toHaveValue('21');

  await page.getByText('Continue to Builder →').click();
  await page.waitForTimeout(300);
  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Event")').click();
  const entry = page.locator('.sd-drawer.open');
  await entry.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Category' }) }).locator('select').selectOption('Card Events');
  await entry.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Type' }) }).locator('select').selectOption('Virtual card issued');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(300);
  await page.locator('.dc-add-btn').click();
  await page.locator('.dc-type-opt', { hasText: /^Exit/ }).click();
  await page.locator('.sd-drawer.open input[type=text]').first().fill('done');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);

  await page.getByText('Continue to Guardrails').click();
  await page.waitForTimeout(300);
  await page.getByText('Continue to Review').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.dcb-mid-inner')).toContainText('within 21 days');
  await expect(page.locator('.dcb-mid-inner')).toContainText('Customers stop receiving messages once they convert');

  await page.locator('button:has-text("Submit")').click();
  await page.waitForTimeout(400);
  await page.locator('table tbody tr', { hasText: 'Conversion settings' }).click();
  await page.waitForTimeout(500);
  const details = page.locator('.dv-body, .bd-wrap, main').first();
  await expect(details).toContainText('within 21 days');
  await expect(details).toContainText('Customers stop receiving messages, wherever they are in the journey.');
});

// Commit 3 — a Goal Check and exit-on-conversion contradict each other, and
// the Goal step offers to resolve it where the switch is rather than leaving
// the submit gate to refuse two steps later.
test('turning exit on offers to clear the Goal Checks it would make dead', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '+ Create Drip Campaign' }).click();
  await page.getByRole('button', { name: /Create from scratch/ }).click();
  await page.locator('input[type=text]').first().fill('Goal check clash');
  await page.locator('select').first().selectOption('IndusInd Bank (IBL)');
  await page.locator('.toggle-row .toggle').first().click();
  await page.getByText('Continue to Goal →').click();
  await page.waitForTimeout(200);

  // Set a goal, then turn exit OFF so a Goal Check can be added at all.
  const goalSelects = page.locator('select');
  await goalSelects.nth(0).selectOption('Card Events');
  await goalSelects.nth(1).selectOption('Virtual card activated');
  await page.waitForTimeout(300);
  const exitToggle = page.locator('.toggle-row', { hasText: 'Stop messaging once they convert' }).locator('.toggle');
  await exitToggle.click();
  await page.waitForTimeout(200);
  await expect(page.locator('.dcb-mid-inner')).toContainText('They carry on through the journey after converting');

  await page.getByText('Continue to Builder →').click();
  await page.waitForTimeout(300);
  await page.locator('.dc-add-entry-placeholder').click();
  await page.locator('.dc-type-opt:has-text("Entry · Event")').click();
  const entry = page.locator('.sd-drawer.open');
  await entry.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Category' }) }).locator('select').selectOption('Card Events');
  await entry.locator('.f-group', { has: page.locator('label.f-label', { hasText: 'Event Type' }) }).locator('select').selectOption('Virtual card issued');
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(300);

  // Now Goal Check is offered, because exit is off.
  await page.locator('.dc-add-btn').click();
  const tile = page.locator('.dc-type-opt', { hasText: 'Goal Check' });
  await expect(tile).not.toHaveClass(/disabled/);
  await tile.click();
  await page.waitForTimeout(200);
  await page.locator('.sd-drawer.open .sd-foot button.btn.primary').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.dc-node-card:has-text("Goal Check")')).toHaveCount(1);

  // Turn exit back on: the Goal step says the check cannot fire, and offers
  // to remove it right there.
  await page.locator('.dcb-vstep', { hasText: 'Goal' }).click();
  await page.waitForTimeout(300);
  await exitToggle.click();
  await page.waitForTimeout(300);
  const banner = page.locator('.dcb-validation-banner');
  await expect(banner).toContainText('1 Goal Check step');
  await expect(banner).toContainText('cannot fire while customers stop on conversion');
  await banner.getByRole('button', { name: /Remove it/ }).click();
  await page.waitForTimeout(400);
  await expect(banner).toHaveCount(0);

  await page.locator('.dcb-vstep', { hasText: 'Builder' }).click();
  await page.waitForTimeout(500);
  await expect(page.locator('.dc-node-card:has-text("Goal Check")')).toHaveCount(0);
});
