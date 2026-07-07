import Link from "next/link";
import { BookOpenCheck, CalendarDays, Eye, FilePlus2, LogIn, LogOut, Play, Plus, Trash2 } from "lucide-react";
import { deleteStudySetAction, logoutAdminAction, startStudySessionAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getStudySets } from "@/server/study-service";
import { getIsAdmin } from "@/lib/admin-auth";
import { formatDate } from "@/lib/utils";

export default async function HomePage() {
  const studySets = await getStudySets();
  const isAdmin = await getIsAdmin();

  return (
    <main className="min-h-screen">
      <div className="container space-y-8 py-8 sm:py-10">
        <header className="flex flex-col gap-5 rounded-lg border bg-card/85 p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-secondary text-primary">
                <BookOpenCheck className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-normal text-foreground sm:text-3xl">Học Trắc Nghiệm</h1>
            </div>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">
              Nhập đề trắc nghiệm, luyện từng câu và ôn lại các câu sai cho đến khi nắm chắc.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {isAdmin ? (
              <>
                <Button asChild size="lg">
                  <Link href="/study-sets/new">
                    <Plus className="h-5 w-5" />
                    Tạo Bộ Đề Mới
                  </Link>
                </Button>
                <form action={logoutAdminAction}>
                  <Button type="submit" size="lg" variant="outline" className="w-full sm:w-auto">
                    <LogOut className="h-5 w-5" />
                    Đăng xuất
                  </Button>
                </form>
              </>
            ) : (
              <Button asChild size="lg" variant="outline">
                <Link href="/admin-login">
                  <LogIn className="h-5 w-5" />
                  Đăng nhập quản trị
                </Link>
              </Button>
            )}
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Bộ đề đã lưu</h2>
              <p className="text-sm text-muted-foreground">Các bộ đề của bạn được lưu trong cơ sở dữ liệu.</p>
            </div>
            <Badge variant="secondary">{studySets.length} bộ đề</Badge>
          </div>

          {studySets.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <FilePlus2 className="h-7 w-7" />
                </div>
                <div className="max-w-md space-y-2">
                  <h3 className="text-lg font-semibold">Chưa có bộ đề nào</h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {isAdmin
                      ? "Tạo bộ đề đầu tiên bằng cách dán nội dung hoặc tải lên tệp .docx."
                      : "Hiện chưa có bộ đề nào để xem và luyện tập."}
                  </p>
                </div>
                {isAdmin ? (
                  <Button asChild>
                    <Link href="/study-sets/new">
                      <Plus className="h-4 w-4" />
                      Tạo Bộ Đề Mới
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {studySets.map((studySet) => (
                <Card key={studySet.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="min-w-0 break-words">{studySet.title}</CardTitle>
                      <Badge>{studySet.questionCount} câu</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                      Tạo ngày {formatDate(studySet.createdAt)}
                    </p>
                    {studySet.sourceFileName ? (
                      <p className="truncate text-sm text-muted-foreground">Nguồn: {studySet.sourceFileName}</p>
                    ) : null}
                  </CardContent>
                  <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap">
                    <form action={startStudySessionAction.bind(null, studySet.id)}>
                      <Button type="submit" className="w-full sm:w-auto">
                        <Play className="h-4 w-4" />
                        Bắt Đầu Học
                      </Button>
                    </form>
                    <Button asChild variant="outline" className="w-full sm:w-auto">
                      <Link href={`/study-sets/${studySet.id}`}>
                        <Eye className="h-4 w-4" />
                        Xem Chi Tiết
                      </Link>
                    </Button>
                    {isAdmin ? (
                      <form action={deleteStudySetAction.bind(null, studySet.id, false)}>
                        <Button type="submit" variant="destructive" className="w-full sm:w-auto">
                          <Trash2 className="h-4 w-4" />
                          Xóa
                        </Button>
                      </form>
                    ) : null}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
