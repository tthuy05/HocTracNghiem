import { expect, test } from "@playwright/test";

test("creates a study set, reviews a wrong answer, and completes the session", async ({ page }) => {
  const title = `E2E Study Set ${Date.now()}`;

  await page.goto("/study-sets/new");
  await page.getByLabel("Study set title").fill(title);
  await page.getByLabel("Paste outline text").fill(`
Cau 1: Thu do Viet Nam la gi?
A. Da Nang
B. Ha Noi
C. Hue
D. Can Tho
Answer: B
`);

  await page.getByRole("button", { name: "Analyze Outline" }).click();
  await expect(page.getByRole("heading", { name: "Parsed questions" })).toBeVisible();
  await expect(page.getByText("Valid").last()).toBeVisible();
  await page.getByRole("button", { name: "Save Study Set" }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Start Studying" }).click();

  await expect(page.getByText("Thu do Viet Nam la gi?")).toBeVisible();
  await page.getByRole("button", { name: /A\.\s*Da Nang/ }).click();
  await expect(page.getByText(/Wrong\. The correct answer is B\./)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("You have completed round 1")).toBeVisible();
  await expect(page.getByText("Wrong answers", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start Next Round" }).click();

  await page.getByRole("button", { name: /B\.\s*Ha Noi/ }).click();
  await expect(page.getByText("Correct. Nice work.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await expect(page.getByText("Wrong attempts")).toBeVisible();
});
