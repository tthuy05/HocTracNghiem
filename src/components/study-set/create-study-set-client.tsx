"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileSearch, Loader2, Save, Upload, XCircle } from "lucide-react";
import { createStudySetAction, parseImportedContentAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type AnswerKey = "A" | "B" | "C" | "D";
type EditableQuestion = {
  id: string;
  orderIndex: number;
  content: string;
  options: Record<AnswerKey, string>;
  correctAnswer?: AnswerKey;
  errors: string[];
  raw: string;
};

const answerKeys: AnswerKey[] = ["A", "B", "C", "D"];

export function CreateStudySetClient() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [sourceFileName, setSourceFileName] = useState<string | undefined>();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questionErrors = useMemo(() => questions.map(validateQuestion), [questions]);
  const validCount = questionErrors.filter((errors) => errors.length === 0).length;
  const missingAnswerCount = questions.filter((question) => !question.correctAnswer).length;
  const hasInvalidQuestions = questions.length > 0 && validCount !== questions.length;

  async function handleAnalyze(formData: FormData) {
    setIsAnalyzing(true);
    setError(null);

    const result = await parseImportedContentAction(formData);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to analyze the outline.");
      setQuestions([]);
      setIsAnalyzing(false);
      return;
    }

    setQuestions(result.data.questions);
    setSourceFileName(result.data.sourceFileName);
    setIsAnalyzing(false);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);

    if (!title.trim()) {
      setError("Study set title is required.");
      setIsSaving(false);
      return;
    }

    if (!questions.length || hasInvalidQuestions) {
      setError("Fix every invalid question before saving.");
      setIsSaving(false);
      return;
    }

    const result = await createStudySetAction({
      title,
      sourceFileName,
      questions: questions.map((question) => ({
        content: question.content,
        options: question.options,
        correctAnswer: question.correctAnswer as AnswerKey,
      })),
    });

    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to save the study set.");
      setIsSaving(false);
      return;
    }

    router.push(`/study-sets/${result.data.id}`);
  }

  function updateQuestion(index: number, update: Partial<EditableQuestion>) {
    setQuestions((current) =>
      current.map((question, questionIndex) => (questionIndex === index ? { ...question, ...update } : question)),
    );
  }

  function updateOption(index: number, key: AnswerKey, value: string) {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index
          ? {
              ...question,
              options: {
                ...question.options,
                [key]: value,
              },
            }
          : question,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import outline</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={handleAnalyze} className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
              <div className="space-y-2">
                <Label htmlFor="title">Study set title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Example: Network Administration Final Review"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">Upload .docx file</Label>
                <Input id="file" name="file" type="file" accept=".docx" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="text">Paste outline text</Label>
              <Textarea
                id="text"
                name="text"
                placeholder={`Câu 1: Example question?\nA. First option\nB. Second option\nC. Third option\nD. Fourth option\nĐáp án: B`}
              />
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <Button type="submit" size="lg" disabled={isAnalyzing}>
              {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSearch className="h-5 w-5" />}
              {isAnalyzing ? "Analyzing..." : "Analyze Outline"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {questions.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card/75 p-8 text-center">
          <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">Preview will appear here</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Analyze your outline to edit questions before saving.
          </p>
        </div>
      ) : (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryPill label="Detected" value={questions.length} />
            <SummaryPill label="Valid" value={validCount} tone="success" />
            <SummaryPill label="Missing answers" value={missingAnswerCount} tone="warning" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Parsed questions</h2>
              <p className="text-sm text-muted-foreground">Edit any field the parser did not read correctly.</p>
            </div>
            <Button size="lg" onClick={handleSave} disabled={isSaving || hasInvalidQuestions}>
              {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {isSaving ? "Saving..." : "Save Study Set"}
            </Button>
          </div>

          {hasInvalidQuestions ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Questions marked in yellow need a question, all four answers, and one correct answer.</span>
            </div>
          ) : null}

          <div className="space-y-4">
            {questions.map((question, index) => {
              const errors = questionErrors[index];
              return (
                <Card key={question.id} className={errors.length ? "border-amber-300 bg-amber-50/60" : ""}>
                  <CardHeader>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <CardTitle className="text-base">Question {index + 1}</CardTitle>
                      {errors.length ? (
                        <Badge variant="warning">
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          Needs review
                        </Badge>
                      ) : (
                        <Badge variant="success">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Valid
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`question-${question.id}`}>Question content</Label>
                      <Textarea
                        id={`question-${question.id}`}
                        value={question.content}
                        onChange={(event) => updateQuestion(index, { content: event.target.value })}
                        className="min-h-[96px]"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {answerKeys.map((key) => (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={`${question.id}-${key}`}>Option {key}</Label>
                          <Input
                            id={`${question.id}-${key}`}
                            value={question.options[key]}
                            onChange={(event) => updateOption(index, key, event.target.value)}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2 sm:max-w-xs">
                      <Label htmlFor={`${question.id}-correct`}>Correct answer</Label>
                      <select
                        id={`${question.id}-correct`}
                        value={question.correctAnswer ?? ""}
                        onChange={(event) =>
                          updateQuestion(index, {
                            correctAnswer: event.target.value ? (event.target.value as AnswerKey) : undefined,
                          })
                        }
                        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Select answer</option>
                        {answerKeys.map((key) => (
                          <option key={key} value={key}>
                            {key}
                          </option>
                        ))}
                      </select>
                    </div>

                    {errors.length ? (
                      <ul className="space-y-1 text-sm text-amber-950">
                        {errors.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass = {
    default: "border-sky-200 bg-sky-50 text-sky-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
  }[tone];

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function validateQuestion(question: EditableQuestion) {
  const errors: string[] = [];

  if (!question.content.trim()) {
    errors.push("Question content is missing.");
  }

  for (const key of answerKeys) {
    if (!question.options[key].trim()) {
      errors.push(`Option ${key} is missing.`);
    }
  }

  if (!question.correctAnswer) {
    errors.push("Correct answer is missing.");
  }

  return errors;
}
