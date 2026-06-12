"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Home,
  Loader2,
  RotateCcw,
  Trophy,
  XCircle,
} from "lucide-react";
import { resetStudySessionAction, submitAnswerAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AnswerKey } from "@/lib/parser";
import type { StudySessionView, SubmitAnswerResult } from "@/server/study-service";

const answerKeys: AnswerKey[] = ["A", "B", "C", "D"];

export function StudySessionClient({ initialSession }: { initialSession: StudySessionView }) {
  const [session, setSession] = useState(initialSession);
  const [answerResult, setAnswerResult] = useState<SubmitAnswerResult | null>(null);
  const [roundTransition, setRoundTransition] = useState<{ completedRound: number; wrongCount: number } | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<AnswerKey | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progressValue = useMemo(() => {
    if (session.status === "COMPLETED") {
      return 100;
    }

    return session.currentQueue.length
      ? Math.min(100, ((session.currentIndex + 1) / session.currentQueue.length) * 100)
      : 0;
  }, [session]);

  async function handleAnswer(selectedAnswer: AnswerKey) {
    if (!session.currentQuestion || answerResult || pendingAnswer) {
      return;
    }

    setPendingAnswer(selectedAnswer);
    setError(null);
    const result = await submitAnswerAction(session.id, session.currentQuestion.id, selectedAnswer);
    setPendingAnswer(null);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to submit answer.");
      return;
    }

    setAnswerResult(result.data);
  }

  function handleContinue() {
    if (!answerResult) {
      return;
    }

    setSession(answerResult.session);
    if (answerResult.transition.type === "round") {
      setRoundTransition({
        completedRound: answerResult.transition.completedRound,
        wrongCount: answerResult.transition.wrongCount,
      });
    } else {
      setRoundTransition(null);
    }
    setAnswerResult(null);
  }

  async function handleReset() {
    setIsResetting(true);
    setError(null);
    const result = await resetStudySessionAction(session.id);
    setIsResetting(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to reset session.");
      return;
    }

    setSession(result.data);
    setAnswerResult(null);
    setRoundTransition(null);
  }

  if (roundTransition) {
    return (
      <StudyShell title={session.studySetTitle}>
        <Card className="mx-auto max-w-2xl">
          <CardHeader className="text-center">
            <Badge variant="warning" className="mx-auto">Round transition</Badge>
            <CardTitle className="text-2xl">You have completed round {roundTransition.completedRound}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-amber-950">
              <p className="text-sm font-medium">Wrong answers</p>
              <p className="mt-1 text-4xl font-bold">{roundTransition.wrongCount}</p>
              <p className="mt-2 text-sm">Continue reviewing the wrong answers.</p>
            </div>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={() => setRoundTransition(null)}>
                Start Next Round
              </Button>
              <Button size="lg" variant="outline" onClick={handleReset} disabled={isResetting}>
                {isResetting ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
                Study Again From Start
              </Button>
            </div>
          </CardContent>
        </Card>
      </StudyShell>
    );
  }

  if (session.status === "COMPLETED") {
    return (
      <StudyShell title={session.studySetTitle}>
        <Card className="mx-auto max-w-2xl border-emerald-200">
          <CardHeader className="items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
              <Trophy className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl">Session complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Total questions" value={session.totalQuestions} />
              <Stat label="Rounds completed" value={session.currentRound} />
              <Stat label="Wrong attempts" value={session.totalWrongAttempts} />
            </div>
            <div className="flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Button size="lg" onClick={handleReset} disabled={isResetting}>
                {isResetting ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
                Study Again From Start
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={`/study-sets/${session.studySetId}`}>
                  <ArrowLeft className="h-5 w-5" />
                  Back to Study Set
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/">
                  <Home className="h-5 w-5" />
                  Go to Home
                </Link>
              </Button>
            </div>
            {error ? <ErrorMessage message={error} /> : null}
          </CardContent>
        </Card>
      </StudyShell>
    );
  }

  const question = session.currentQuestion;

  return (
    <StudyShell title={session.studySetTitle}>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-lg border bg-card/85 p-5 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Badge variant="secondary">Round {session.currentRound}</Badge>
              <h1 className="break-words text-xl font-bold sm:text-2xl">{session.studySetTitle}</h1>
              <p className="text-sm text-muted-foreground">
                Question {Math.min(session.currentIndex + 1, session.currentQueue.length)} / {session.currentQueue.length} in this round
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isResetting}>
                {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Study Again From Start
              </Button>
              <Button asChild variant="outline">
                <Link href={`/study-sets/${session.studySetId}`}>
                  <ArrowLeft className="h-4 w-4" />
                  Exit
                </Link>
              </Button>
            </div>
          </div>
          <Progress value={progressValue} className="mt-5" />
        </div>

        {question ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg leading-7">{question.content}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                {answerKeys.map((key) => {
                  const isCorrectAnswer = answerResult?.answer.correctAnswer === key;
                  const isSelectedWrong =
                    answerResult?.answer.selectedAnswer === key && !answerResult.answer.isCorrect;

                  return (
                    <Button
                      key={key}
                      type="button"
                      variant="outline"
                      size="lg"
                      disabled={Boolean(answerResult) || Boolean(pendingAnswer)}
                      onClick={() => handleAnswer(key)}
                      className={cn(
                        "h-auto min-h-14 justify-start whitespace-normal px-4 py-4 text-left text-base leading-6",
                        isCorrectAnswer && "border-emerald-300 bg-emerald-100 text-emerald-950 hover:bg-emerald-100",
                        isSelectedWrong && "border-red-300 bg-red-100 text-red-950 hover:bg-red-100",
                      )}
                    >
                      {pendingAnswer === key ? (
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                      ) : isCorrectAnswer ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                      ) : isSelectedWrong ? (
                        <XCircle className="h-5 w-5 shrink-0" />
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary font-bold">
                          {key}
                        </span>
                      )}
                      <span>
                        <span className="font-bold">{key}.</span> {question.options[key]}
                      </span>
                    </Button>
                  );
                })}
              </div>

              {answerResult ? (
                <div
                  className={cn(
                    "flex flex-col gap-3 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                    answerResult.answer.isCorrect
                      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                      : "border-red-200 bg-red-50 text-red-950",
                  )}
                >
                  <p className="text-sm font-medium">
                    {answerResult.answer.isCorrect
                      ? "Correct. Nice work."
                      : `Wrong. The correct answer is ${answerResult.answer.correctAnswer}.`}
                  </p>
                  <Button onClick={handleContinue}>Continue</Button>
                </div>
              ) : null}

              {error ? <ErrorMessage message={error} /> : null}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-200">
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No active question is available for this session.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </StudyShell>
  );
}

function StudyShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <div className="container py-8 sm:py-10">
        <div className="mb-6 flex items-center gap-3 text-sm font-semibold text-primary">
          <CheckCircle2 className="h-5 w-5" />
          {title}
        </div>
        {children}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-4 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
