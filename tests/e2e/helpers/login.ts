import { expect, type Page } from "@playwright/test";
import { needsMfa } from "../../../lib/auth/roles";
import { ACCOUNTS, E2E_PASSWORD, totpSecretFor, type AccountKey } from "./accounts";
import { freshTotp } from "./totp";

/** Signs in through the real login screen, including the 6-digit step for Admin roles. */
export async function loginAs(page: Page, key: AccountKey) {
  const account = ACCOUNTS[key];
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  if (needsMfa(account.role)) {
    await expect(page).toHaveURL(/\/login\/mfa/);
    const code = await freshTotp(totpSecretFor(key), account.email);
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Verify code" }).click();
  }
  await expect(page).not.toHaveURL(/\/login/);
}
