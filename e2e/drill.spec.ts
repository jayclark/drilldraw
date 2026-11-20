import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const canvas = (page: Page) => page.locator("svg.drill-canvas");
const elements = (page: Page) => page.locator("svg.drill-canvas [data-el-id]");

/** Points are fractions of the canvas box, so tests work at any viewport size. */
/** Pick a tool, then measure the canvas (picking a tool can scroll the page). */
async function canvasBox(page: Page, tool: string) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  await canvas(page).scrollIntoViewIfNeeded();
  return (await canvas(page).boundingBox())!;
}

async function draw(page: Page, tool: string, points: [number, number][]) {
  const box = await canvasBox(page, tool);
  const at = ([fx, fy]: [number, number]) =>
    [box.x + fx * box.width, box.y + fy * box.height] as const;
  await page.mouse.move(...at(points[0]!));
  await page.mouse.down();
  for (const p of points.slice(1))
    await page.mouse.move(...at(p), { steps: 8 });
  await page.mouse.up();
}

async function place(page: Page, tool: string, at: [number, number]) {
  const box = await canvasBox(page, tool);
  await page.mouse.click(box.x + at[0] * box.width, box.y + at[1] * box.height);
}

async function createDrill(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create drill" }).first().click();
  await expect(page).toHaveURL(/\/hockey\/d\/[A-Za-z0-9_-]{12}$/);
  await expect(page.getByText("Saved & live")).toBeVisible();
  return page.url();
}

test("landing page lists sports and creates a drill", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Draw drills/i }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ice Hockey" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coming soon" })).toHaveCount(
    2,
  );
  await createDrill(page);
  await expect(
    page.getByRole("heading", { name: "Ice Hockey Drill" }),
  ).toBeVisible();
});

test("every drawing tool adds an element", async ({ page }, info) => {
  await createDrill(page);
  await draw(page, "Skate", [
    [0.55, 0.2],
    [0.65, 0.3],
    [0.75, 0.45],
  ]);
  await draw(page, "Skate with puck", [
    [0.45, 0.75],
    [0.55, 0.65],
    [0.7, 0.6],
  ]);
  await draw(page, "Skate backward", [
    [0.8, 0.85],
    [0.7, 0.8],
    [0.6, 0.78],
  ]);
  await draw(page, "Pass", [
    [0.7, 0.6],
    [0.78, 0.45],
  ]);
  await draw(page, "Shot", [
    [0.8, 0.45],
    [0.93, 0.5],
  ]);
  await draw(page, "Freehand", [
    [0.1, 0.2],
    [0.15, 0.3],
    [0.22, 0.25],
  ]);
  await draw(page, "Area", [
    [0.08, 0.6],
    [0.2, 0.85],
  ]);
  await place(page, "Forward (F1, F2…)", [0.55, 0.18]);
  await place(page, "Forward (F1, F2…)", [0.45, 0.78]);
  await place(page, "Defense (D1, D2…)", [0.82, 0.88]);
  await place(page, "Forward", [0.3, 0.5]);
  await place(page, "Coach", [0.4, 0.5]);
  await place(page, "Puck", [0.47, 0.8]);
  await place(page, "Number", [0.6, 0.18]);
  await place(page, "Cone", [0.65, 0.5]);
  await place(page, "Net", [0.94, 0.5]);
  await expect(elements(page)).toHaveCount(16);
  await expect(canvas(page).getByText("F2")).toBeVisible();
  await expect(canvas(page).getByText("D1")).toBeVisible();

  // Text: placed, then labelled through the selection bar.
  await place(page, "Text", [0.3, 0.3]);
  const label = page.getByLabel("Label");
  await expect(label).toBeFocused();
  await label.fill("Regroup");
  await expect(canvas(page).getByText("Regroup")).toBeVisible();
  await expect(elements(page)).toHaveCount(17);

  await page.keyboard.press("Escape");
  await canvas(page).screenshot({ path: info.outputPath("all-tools.png") });

  // Undo steps back one edit at a time: first the label typing, then the text marker.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  const undo = page.getByRole("button", { name: "Undo" });
  await undo.click();
  await expect(canvas(page).getByText("Text", { exact: true })).toBeVisible();
  await expect(elements(page)).toHaveCount(17);
  await undo.click();
  await expect(elements(page)).toHaveCount(16);
  // Rapid placements are still separate steps.
  await undo.click();
  await expect(elements(page)).toHaveCount(15);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(elements(page)).toHaveCount(16);
});

test("select, move and delete an element", async ({ page }) => {
  await createDrill(page);
  await place(page, "Cone", [0.5, 0.3]);
  const box = await canvasBox(page, "Select / move");
  const cone = elements(page).first();
  const before = (await cone.boundingBox())!;
  await page.mouse.move(box.x + 0.5 * box.width, box.y + 0.3 * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + 0.6 * box.width, box.y + 0.5 * box.height, {
    steps: 6,
  });
  await page.mouse.up();
  const after = (await cone.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(0.05 * box.width);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(elements(page)).toHaveCount(0);
});

test("two people edit the same drill live; undo is per person", async ({
  browser,
}) => {
  const a = await (await browser.newContext()).newPage();
  const url = await createDrill(a);
  const b = await (await browser.newContext()).newPage();
  await b.goto(url);
  await expect(b.getByText("Saved & live")).toBeVisible();

  await a.getByLabel("Drill name").fill("2-on-1 rush");
  await expect(b.getByLabel("Drill name")).toHaveValue("2-on-1 rush");

  await draw(a, "Skate", [
    [0.3, 0.3],
    [0.5, 0.5],
  ]);
  await expect(elements(b)).toHaveCount(1);

  await place(b, "Cone", [0.7, 0.7]);
  await expect(elements(a)).toHaveCount(2);

  // B's undo only removes B's own cone.
  await b.getByRole("button", { name: "Undo" }).click();
  await expect(elements(a)).toHaveCount(1);
  await expect(elements(b)).toHaveCount(1);
  await expect(b.getByRole("button", { name: "Undo" })).toBeDisabled();

  // Rink view is shared.
  await a.getByRole("radio", { name: "Half rink" }).click();
  await expect(b.getByRole("radio", { name: "Half rink" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Presence: each sees two people.
  await expect(a.locator(".people .avatar")).toHaveCount(2);
});

test("drills persist across reloads", async ({ page }) => {
  await createDrill(page);
  await page.getByLabel("Drill name").fill("Persisted drill");
  await place(page, "Puck", [0.5, 0.5]);
  await page.getByLabel("Coaching points").fill("Head up\nStick on the ice");
  // Allow the debounced save to run.
  await page.waitForTimeout(2600);
  await page.reload();
  await expect(page.getByLabel("Drill name")).toHaveValue("Persisted drill");
  await expect(page.getByLabel("Coaching points")).toHaveValue(
    "Head up\nStick on the ice",
  );
  await expect(elements(page)).toHaveCount(1);
});

test("New drill opens a fresh, empty drill", async ({ page }) => {
  await createDrill(page);
  const firstUrl = page.url();
  await page.getByLabel("Drill name").fill("First drill");
  await place(page, "Puck", [0.5, 0.5]);
  await expect(elements(page)).toHaveCount(1);

  await page.getByRole("button", { name: "New drill" }).click();
  await expect(page).not.toHaveURL(firstUrl);
  await expect(page).toHaveURL(/\/hockey\/d\/[A-Za-z0-9_-]{12}$/);
  await expect(page.getByLabel("Drill name")).toHaveValue("");
  await expect(elements(page)).toHaveCount(0);

  // The original drill is untouched.
  await page.goBack();
  await expect(page.getByLabel("Drill name")).toHaveValue("First drill");
  await expect(elements(page)).toHaveCount(1);
});

test("History lists drills opened in this browser", async ({ page }) => {
  const drawer = page.getByRole("complementary", { name: "Your drills" });
  await page.goto("/");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(drawer).toContainText("Drills you open or create");
  await page.getByRole("button", { name: "Close" }).click();

  const first = await createDrill(page);
  await page.getByLabel("Drill name").fill("Breakout");
  await page.getByRole("button", { name: "New drill" }).click();
  await expect(page).not.toHaveURL(first);
  await page.getByLabel("Drill name").fill("Power play");

  await page.getByRole("button", { name: "History", exact: true }).click();
  const items = drawer.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Power play");
  await expect(items.nth(0)).toContainText("Open");
  await expect(items.nth(1)).toContainText("Breakout");

  await drawer.getByRole("link", { name: /Breakout/ }).click();
  await expect(page).toHaveURL(first);
  await expect(page.getByLabel("Drill name")).toHaveValue("Breakout");

  // Removing an entry only forgets it locally.
  await page.getByRole("button", { name: "History", exact: true }).click();
  await drawer
    .getByRole("button", { name: "Remove Power play from history" })
    .click();
  await expect(items).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).toContainText("Breakout");
});

test("Drill Versions lists saved versions", async ({ page }) => {
  await createDrill(page);
  await page.getByRole("button", { name: "Drill Versions" }).click();
  await expect(
    page.getByRole("complementary", { name: "Drill versions" }),
  ).toBeVisible();
});

test("exports PNG and PDF", async ({ page }) => {
  await createDrill(page);
  await page.getByLabel("Drill name").fill("Export test");
  await draw(page, "Pass", [
    [0.3, 0.3],
    [0.6, 0.6],
  ]);
  for (const [button, ext, magic] of [
    ["Download PNG", "png", "\x89PNG"],
    ["Download PDF", "pdf", "%PDF"],
  ] as const) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: button }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`export-test.${ext}`);
    const file = await download.path();
    const head = fs.readFileSync(file).subarray(0, 4).toString("latin1");
    expect(head).toBe(magic);
    expect(fs.statSync(file).size).toBeGreaterThan(5000);
  }
});

test("drawing lands under the pointer in the rotated half-rink view", async ({
  page,
}) => {
  await createDrill(page);
  await page.getByRole("radio", { name: "Half rink" }).click();
  const box = await canvasBox(page, "Puck");
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.4;
  await page.mouse.click(x, y);
  const puck = (await elements(page)
    .first()
    .locator("circle")
    .first()
    .boundingBox())!;
  expect(Math.abs(puck.x + puck.width / 2 - x)).toBeLessThan(3);
  expect(Math.abs(puck.y + puck.height / 2 - y)).toBeLessThan(3);
});

test("unknown drills show a not-found page", async ({ page }) => {
  await page.goto("/hockey/d/AAAAAAAAAAAA");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await page.goto("/nope");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});
