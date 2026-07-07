import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogIn } from "lucide-react";
import { loginAdminAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getIsAdmin, getSafeRedirectPath } from "@/lib/admin-auth";

type AdminLoginPageProps = {
  searchParams: Promise<{
    error?: string;
    from?: string;
  }>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const { error, from } = await searchParams;
  const redirectTo = getSafeRedirectPath(from);

  if (await getIsAdmin()) {
    redirect(redirectTo);
  }

  return (
    <main className="min-h-screen">
      <div className="container max-w-xl space-y-7 py-8 sm:py-10">
        <Button asChild variant="ghost">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Đăng nhập quản trị</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={loginAdminAction} className="space-y-5">
              <input type="hidden" name="redirectTo" value={redirectTo} />

              <div className="space-y-2">
                <Label htmlFor="username">Tài khoản</Label>
                <Input id="username" name="username" autoComplete="username" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
              </div>

              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                  Sai tài khoản hoặc mật khẩu.
                </div>
              ) : null}

              <Button type="submit" size="lg" className="w-full">
                <LogIn className="h-5 w-5" />
                Đăng nhập
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
