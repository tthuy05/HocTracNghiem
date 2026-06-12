"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ANSWER_KEYS,
  extractDocxForParsing,
  parseQuestionsFromText,
  validateParsedQuestion,
  type AnswerKey,
  type ParseResult,
} from "@/lib/parser";
import {
  createStudySet,
  deleteStudySet,
  resetStudySession,
  startStudySession,
  submitAnswer,
  updateStudySetTitle,
  type CreateStudySetInput,
  type StudySessionView,
  type SubmitAnswerResult,
} from "@/server/study-service";

type ActionResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

const answerKeySchema = z.enum(ANSWER_KEYS);

const questionInputSchema = z.object({
  content: z.string().trim().min(1, "Question content is required."),
  options: z.object({
    A: z.string().trim().min(1, "Option A is required."),
    B: z.string().trim().min(1, "Option B is required."),
    C: z.string().trim().min(1, "Option C is required."),
    D: z.string().trim().min(1, "Option D is required."),
  }),
  correctAnswer: answerKeySchema,
  explanation: z.string().optional(),
});

const createStudySetSchema = z.object({
  title: z.string().trim().min(1, "Study set title is required.").max(120),
  sourceFileName: z.string().optional(),
  questions: z.array(questionInputSchema).min(1, "At least one valid question is required."),
});

export async function parseImportedContentAction(formData: FormData): Promise<ActionResult<ParseResult & { sourceFileName?: string }>> {
  try {
    const manualText = String(formData.get("text") ?? "");
    const maybeFile = formData.get("file");
    let importedText = manualText;
    let sourceFileName: string | undefined;
    let emphasizedAnswersByOrder: Record<number, AnswerKey> | undefined;

    if (maybeFile instanceof File && maybeFile.size > 0) {
      if (!maybeFile.name.toLowerCase().endsWith(".docx")) {
        return { ok: false, error: "Only .docx files are supported." };
      }

      const extracted = await extractDocxForParsing(await maybeFile.arrayBuffer());
      importedText = [manualText, extracted.text].filter(Boolean).join("\n\n");
      emphasizedAnswersByOrder = extracted.emphasizedAnswersByOrder;
      sourceFileName = maybeFile.name;
    }

    if (!importedText.trim()) {
      return { ok: false, error: "Paste text or upload a .docx file before analyzing." };
    }

    const result = parseQuestionsFromText(importedText, { emphasizedAnswersByOrder });
    if (!result.totalDetected) {
      return { ok: false, error: "No questions were detected. Check the question numbering format." };
    }

    return {
      ok: true,
      data: {
        ...result,
        sourceFileName,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to parse the imported content." };
  }
}

export async function createStudySetAction(input: CreateStudySetInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createStudySetSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid study set data." };
  }

  const invalidQuestion = parsed.data.questions.find((question) => validateParsedQuestion(question).length > 0);
  if (invalidQuestion) {
    return { ok: false, error: "Fix all invalid questions before saving." };
  }

  try {
    const studySet = await createStudySet(parsed.data);
    revalidatePath("/");
    return { ok: true, data: { id: studySet.id } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to save the study set." };
  }
}

export async function deleteStudySetAction(studySetId: string, shouldRedirect: boolean) {
  await deleteStudySet(studySetId);
  revalidatePath("/");
  if (shouldRedirect) {
    redirect("/");
  }
}

export async function updateStudySetTitleAction(studySetId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return;
  }

  await updateStudySetTitle(studySetId, title);
  revalidatePath(`/study-sets/${studySetId}`);
  revalidatePath("/");
}

export async function startStudySessionAction(studySetId: string) {
  const session = await startStudySession(studySetId);
  redirect(`/study-sets/${studySetId}/study?session=${session.id}`);
}

export async function submitAnswerAction(
  sessionId: string,
  questionId: string,
  selectedAnswer: AnswerKey,
): Promise<ActionResult<SubmitAnswerResult>> {
  if (!ANSWER_KEYS.includes(selectedAnswer)) {
    return { ok: false, error: "Selected answer must be A, B, C, or D." };
  }

  try {
    return { ok: true, data: await submitAnswer(sessionId, questionId, selectedAnswer) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to submit the answer." };
  }
}

export async function resetStudySessionAction(sessionId: string): Promise<ActionResult<StudySessionView>> {
  try {
    return { ok: true, data: await resetStudySession(sessionId) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to reset the study session." };
  }
}
