import { expect, test } from "@playwright/test";
import { ROLE_HOME } from "../../lib/auth/roles";
import { ACCOUNTS, E2E_PASSWORD, serviceClient, storageStateFor, type AccountKey } from "./helpers/accounts";
import { expectBrandPage } from "./helpers/brand";
import { loginAs } from "./helpers/login";

test.describe("signing in", () => {
  const cases: [AccountKey, string][] = [
    ["superadmin_login", ROLE_HOME.superadmin],
    ["admin_login", ROLE_HOME.admin],
    ["team_lead", ROLE_HOME.team_lead],
    ["agent", ROLE_HOME.agent],
    ["analyst", ROLE_HOME.analyst],
  ];

  for (const [key, home] of cases) {
    test(`${ACCOUNTS[key].role} lands on ${home}`, async ({ page }) => {
      await loginAs(page, key);
      await expect(page).toHaveURL(new RegExp(`${home}$`));
      await expectBrandPage(page);
      await expect(page.getByRole("link", { name: "My profile" })).toContainText(ACCOUNTS[key].name);
    });
  }

  test("the login screen has the logo on purple and no sign-up", async ({ page }) => {
    await page.goto("/login");
    await expectBrandPage(page);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText(/sign up|create account|register/i)).toHaveCount(0);
  });

  test("a wrong password says what to do", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ACCOUNTS.agent.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Scoped to the form: Next.js also renders a hidden route announcer with role="alert".
    await expect(page.locator("form").getByRole("alert")).toContainText("That email and password do not match.");
  });

  test("a disabled user cannot sign in", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ACCOUNTS.disabled.email);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Account disabled, contact your Admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("an admin is asked for a 6-digit code after the password", async ({ page }) => {
    // Uses the "admin" account: completing the code step signs out that account's other password-only
    // sessions (a Supabase safeguard), so this must not share an account with a test that finishes the step.
    await page.goto("/login");
    await page.getByLabel("Email").fill(ACCOUNTS.admin.email);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login\/mfa/);
    await expect(page.getByLabel("6-digit code")).toBeVisible();

    // Without the code, the app stays closed.
    await page.goto(ROLE_HOME.admin);
    await expect(page).toHaveURL(/\/login\/mfa/);
  });

  test("signed-out visitors are sent to the login screen", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL(/\/login\?next=%2Fusers/);
  });
});

test.describe("as an agent", () => {
  test.use({ storageState: storageStateFor("agent") });

  test("opening /users shows No access", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users and teams" })).toHaveCount(0);
  });
});

test("calling the create-user action directly as an agent is refused", async ({ browser }) => {
  const stamp = Date.now();
  const realEmail = `e2e-real-${stamp}@tradinglabs.test`;
  const forgedEmail = `e2e-forged-${stamp}@tradinglabs.test`;

  // 1. As the Superadmin, submit the form once and capture the action request.
  const superCtx = await browser.newContext({ storageState: storageStateFor("superadmin") });
  const superPage = await superCtx.newPage();
  await superPage.goto("/users");
  await superPage.getByRole("button", { name: "Add person" }).click();
  const drawer = superPage.getByRole("dialog", { name: "Add a person" });
  await drawer.getByLabel("Full name").fill("Real Person");
  await drawer.getByLabel("Email").fill(realEmail);
  await drawer.getByLabel("Role").selectOption("analyst");
  const [request] = await Promise.all([
    superPage.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
    drawer.getByRole("button", { name: "Add person" }).click(),
  ]);
  await expect(superPage.getByText("Real Person added.")).toBeVisible();
  const actionId = request.headers()["next-action"];
  const contentType = request.headers()["content-type"];
  const body = (request.postData() ?? "").replace(realEmail, forgedEmail);
  await superCtx.close();

  // 2. Replay the same action as the agent, with a different email.
  const agentCtx = await browser.newContext({ storageState: storageStateFor("agent") });
  const res = await agentCtx.request.post("/users", {
    headers: { "next-action": actionId, "content-type": contentType, accept: "text/x-component" },
    data: body,
  });
  const text = await res.text();
  expect(text).toContain("You do not have permission to do that.");
  await agentCtx.close();

  // 3. Nothing was created.
  const { data } = await serviceClient().from("profiles").select("id").eq("email", forgedEmail);
  expect(data).toEqual([]);
});

test.describe("signing out", () => {
  test("returns to the login screen", async ({ page }) => {
    await loginAs(page, "analyst");
    await page.getByRole("link", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?reason=signed-out/);
    await page.goto(ROLE_HOME.analyst);
    await expect(page).toHaveURL(/\/login/);
  });
});
