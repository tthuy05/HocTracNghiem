import { expect, test } from "@playwright/test";

test("creates a study set, reviews a wrong answer, and completes the session", async ({ page }) => {
  const title = `Bộ đề E2E ${Date.now()}`;

  await page.goto("/study-sets/new");
  await expect(page).toHaveURL(/\/admin-login/);
  await page.getByLabel("Tài khoản").fill("tthuy005");
  await page.getByLabel("Mật khẩu").fill("1162005thuy");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/study-sets\/new$/);

  await page.getByLabel("Tên bộ đề").fill(title);
  await page.getByLabel("Dán nội dung đề").fill(`
Cau 1: Thu do Viet Nam la gi?
A. Da Nang
B. Ha Noi
C. Hue
D. Can Tho
Answer: B
`);

  await page.getByRole("button", { name: "Phân Tích Đề" }).click();
  await expect(page.getByRole("heading", { name: "Câu hỏi đã phân tích" })).toBeVisible();
  await expect(page.getByText("Hợp lệ").last()).toBeVisible();
  await page.getByRole("button", { name: "Lưu Bộ Đề" }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Bắt Đầu Học" }).click();

  await expect(page.getByText("Thu do Viet Nam la gi?")).toBeVisible();
  await page.getByRole("button", { name: /A\.\s*Da Nang/ }).click();
  await expect(page.getByText(/Chưa đúng\. Đáp án đúng là B\./)).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục" }).click();

  await expect(page.getByText("Bạn đã hoàn thành vòng 1")).toBeVisible();
  await expect(page.getByText("Số câu sai", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bắt Đầu Vòng Tiếp Theo" }).click();

  await page.getByRole("button", { name: /B\.\s*Ha Noi/ }).click();
  await expect(page.getByText("Chính xác. Làm tốt lắm.")).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục" }).click();

  await expect(page.getByRole("heading", { name: "Hoàn thành phiên học" })).toBeVisible();
  await expect(page.getByText("Lượt trả lời sai")).toBeVisible();
});
