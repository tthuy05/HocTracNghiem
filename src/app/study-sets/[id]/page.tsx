import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Play, Trash2 } from "lucide-react";
import { deleteStudySetAction, startStudySessionAction } from "@/app/actions";
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
            Back
          </Link>
        </Button>

        <header className="space-y-5 rounded-lg border bg-card/85 p-5 shadow-soft">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Badge variant="secondary">{studySet.questionCount} questions</Badge>
              <h1 className="break-words text-2xl font-bold sm:text-3xl">{studySet.title}</h1>
              <p className="text-sm text-muted-foreground">Created {formatDate(studySet.createdAt)}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <form action={startStudySessionAction.bind(null, studySet.id)}>
                <Button type="submit">
                  <Play className="h-4 w-4" />
                  Start Studying
                </Button>
              </form>
              <RenameStudySetForm studySetId={studySet.id} currentTitle={studySet.title} />
              <form action={deleteStudySetAction.bind(null, studySet.id, true)}>
                <Button type="submit" variant="destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete Study Set
                </Button>
              </form>
            </div>
          </div>
        </header>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Question list</h2>
            <p className="text-sm text-muted-foreground">Each card shows the four options and the saved answer key.</p>
          </div>
          <div className="grid gap-4">
            {studySet.questions.map((question) => (
              <Card key={question.id}>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <CardTitle className="text-base">
                      Question {question.orderIndex + 1}
                    </CardTitle>
                    <Badge variant="success">
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Correct: {question.correctAnswer}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-base font-medium leading-7">{question.content}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(["A", "B", "C", "D"] as const).map((key) => (
                      <div
                        key={key}
                        className="rounded-md border bg-background px-3 py-2 text-sm leading-6"
                      >
                        <span className="font-semibold">{key}.</span> {question.options[key]}
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
