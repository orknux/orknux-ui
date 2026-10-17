/**
 * Saving a user keeps the page open.
 *
 * Save Changes used to send the administrator back to the list, so a second
 * change - a role after a name - meant finding the row again. The page stays,
 * says Saved, and the next change is saved from where the last one was. Driven
 * on an internal user who is not an administrator; nothing about them is
 * changed, since the roles sent back are the roles they have.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });

const { users, roles } = await graphql('query { users { id username type editable roles { id } } roles { id scopes } }');
const admin = new Set(roles.filter((one) => one.scopes.includes('ADMIN')).map((one) => one.id));
const subject = users.find((one) => one.editable && one.type === 'INTERNAL' && !one.roles.some((role) => admin.has(role.id)));
if (subject === undefined) {
  record(false, 'an internal user who is not an administrator, to save (make one on Admin > Users)');
} else {
  await page.goto(`${BASE}/admin/users/${subject.id}`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'Roles');
  // Save is off while nothing has changed: the display name is changed, and put back after.
  const name = page.locator('#user-display-name');
  const was = await name.inputValue();
  await name.fill(`${was} (saved)`);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 });
  record(new URL(page.url()).pathname === `/admin/users/${subject.id}`, `after Save Changes the page is still the user's (${new URL(page.url()).pathname})`);
  const beside = await page.evaluate(() => {
    const note = [...document.querySelectorAll('span')].find((one) => one.textContent?.trim() === 'Saved.');
    // The first of the strip's buttons: Discard, then Save beside it.
    const button = document.querySelector('[data-testid="save-bar"] button');
    if (!note || !button) return null;
    return Math.round(button.getBoundingClientRect().left - note.getBoundingClientRect().right);
  });
  record(beside !== null && beside >= 0 && beside <= 32, `and it says Saved. beside Discard and Save (${beside}px before them)`);
  // Edited again, the note goes, so it never claims a change that has not been saved.
  await name.fill((await name.inputValue()) + ' ');
  await page.waitForTimeout(200);
  record((await page.getByText('Saved.', { exact: true }).count()) === 0, 'typing again takes the note away');
  // And the name as it was.
  await name.fill(was);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.waitForTimeout(1500);
}

await finish(browser);
