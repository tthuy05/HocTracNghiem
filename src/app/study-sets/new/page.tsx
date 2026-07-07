import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CreateStudySetClient } from "@/components/study-set/create-study-set-client";
import { Button } from "@/components/ui/button";
import { getIsAdmin } from "@/lib/admin-auth";

export default async function NewStudySetPage() {
  if (!(await getIsAdmin())) {
    redirect(`/admin-login?from=${encodeURIComponent("/study-sets/new")}`);
  }

  return (
    <main className="min-h-screen">
      <div className="container space-y-7 py-8 sm:py-10">
        <Button asChild variant="ghost">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>

        <header className="rounded-lg border bg-card/85 p-5 shadow-soft">
          <div className="max-w-3xl space-y-2">
            <h1 className="text-2xl font-bold sm:text-3xl">Tạo Bộ Đề Mới</h1>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">
              Dán nội dung đề hoặc tải lên tệp .docx, kiểm tra các câu đã nhận diện rồi lưu bộ đề.
            </p>
          </div>
        </header>

        <CreateStudySetClient />
      </div>
    </main>
  );
}
