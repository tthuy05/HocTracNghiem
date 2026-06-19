import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Play, Trash2 } from "lucide-react";
import { deleteStudySetAction, startStudySessionAction } from "@/app/actions";
import { QuestionContent } from "@/components/study/question-content";
import { RenameStudySetForm } from "@/components/study-set/rename-study-set-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStudySetDetail } from "@/server/study-service";
import { formatDate } from "@/lib/utils";

export default async function StudySetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const studySet = await getStudySetDetail(id);

  if (!studySet) {
    notFound();
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

        <header className="space-y-5 rounded-lg border bg-card/85 p-5 shadow-soft">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Badge variant="secondary">{studySet.questionCount} câu</Badge>
              <h1 className="break-words text-2xl font-bold sm:text-3xl">{studySet.title}</h1>
              <p className="text-sm text-muted-foreground">Tạo ngày {formatDate(studySet.createdAt)}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <form action={startStudySessionAction.bind(null, studySet.id)}>
                <Button type="submit">
                  <Play className="h-4 w-4" />
                  Bắt Đầu Học
                </Button>
              </form>
              <RenameStudySetForm studySetId={studySet.id} currentTitle={studySet.title} />
              <form action={deleteStudySetAction.bind(null, studySet.id, true)}>
                <Button type="submit" variant="destructive">
                  <Trash2 className="h-4 w-4" />
                  Xóa Bộ Đề
                </Button>
              </form>
            </div>
          </div>
        </header>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Danh sách câu hỏi</h2>
            <p className="text-sm text-muted-foreground">Mỗi thẻ hiển thị bốn lựa chọn và đáp án đúng đã lưu.</p>
          </div>
          <div className="grid gap-4">
            {studySet.questions.map((question) => (
              <Card key={question.id} className="min-w-0">
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <CardTitle className="text-base">
                      Câu {question.orderIndex + 1}
                    </CardTitle>
                    <Badge variant="success">
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Đáp án đúng: {question.correctAnswer}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <QuestionContent
                    content={question.content}
                    table={question.table}
                    questionText={question.questionText}
                    statements={question.statements}
                  />
                  <div className="question-options question-options-compact">
                    {question.options.map((option) => (
                      <div
                        key={option.label}
                        className="rounded-md border bg-background px-3 py-2 text-sm leading-6"
                      >
                        <span className="font-semibold">{option.label}.</span> {option.text}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
