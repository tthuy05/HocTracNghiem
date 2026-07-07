import { cookies } from "next/headers";

const ADMIN_USERNAME = "tthuy005";
const ADMIN_PASSWORD = "1162005thuy";
const ADMIN_SESSION_COOKIE = "hoc-trac-nghiem-admin";
const ADMIN_SESSION_VALUE = "tthuy005-admin";

export function isAdminCredential(username: string, password: string) {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export function getSafeRedirectPath(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") {
    return "/";
  }

  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }

  return path;
}

export async function getIsAdmin() {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_SESSION_COOKIE)?.value === ADMIN_SESSION_VALUE;
}

export async function requireAdmin() {
  if (!(await getIsAdmin())) {
    throw new Error("Bạn cần đăng nhập tài khoản quản trị để thêm, sửa hoặc xóa bộ đề.");
  }
}

export async function createAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, ADMIN_SESSION_VALUE, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}
