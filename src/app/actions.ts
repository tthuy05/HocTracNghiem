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
import {
  clearAdminSession,
  createAdminSession,
  getSafeRedirectPath,
  isAdminCredential,
  requireAdmin,
} from "@/lib/admin-auth";

type ActionResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

const answerKeySchema = z.enum(ANSWER_KEYS);

const questionInputSchema = z.object({
  content: z.string().trim().min(1, "Nội dung câu hỏi là bắt buộc."),
  options: z.object({
    A: z.string().trim().min(1, "Đáp án A là bắt buộc."),
    B: z.string().trim().min(1, "Đáp án B là bắt buộc."),
    C: z.string().trim().min(1, "Đáp án C là bắt buộc."),
    D: z.string().trim().min(1, "Đáp án D là bắt buộc."),
  }),
  correctAnswer: answerKeySchema,
  explanation: z.string().optional(),
});

const createStudySetSchema = z.object({
  title: z.string().trim().min(1, "Tên bộ đề là bắt buộc.").max(120),
  sourceFileName: z.string().optional(),
  questions: z.array(questionInputSchema).min(1, "Cần ít nhất một câu hỏi hợp lệ."),
});

export async function parseImportedContentAction(formData: FormData): Promise<ActionResult<ParseResult & { sourceFileName?: string }>> {
  await requireAdmin();

  try {
    const manualText = String(formData.get("text") ?? "");
    const maybeFile = formData.get("file");
    let importedText = manualText;
    let sourceFileName: string | undefined;
    let emphasizedAnswersByOrder: Record<number, AnswerKey> | undefined;

    if (maybeFile instanceof File && maybeFile.size > 0) {
      if (!maybeFile.name.toLowerCase().endsWith(".docx")) {
        return { ok: false, error: "Chỉ hỗ trợ tệp .docx." };
      }

      const extracted = await extractDocxForParsing(await maybeFile.arrayBuffer());
      importedText = [manualText, extracted.text].filter(Boolean).join("\n\n");
      emphasizedAnswersByOrder = extracted.emphasizedAnswersByOrder;
      sourceFileName = maybeFile.name;
    }

    if (!importedText.trim()) {
      return { ok: false, error: "Hãy dán nội dung hoặc tải tệp .docx trước khi phân tích." };
    }

    const result = parseQuestionsFromText(importedText, { emphasizedAnswersByOrder });
    if (!result.totalDetected) {
      return { ok: false, error: "Không phát hiện câu hỏi nào. Hãy kiểm tra định dạng đánh số câu." };
    }

    return {
      ok: true,
      data: {
        ...result,
        sourceFileName,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể phân tích nội dung đã nhập." };
  }
}

export async function createStudySetAction(input: CreateStudySetInput): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();

  const parsed = createStudySetSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu bộ đề không hợp lệ." };
  }

  const invalidQuestion = parsed.data.questions.find((question) => validateParsedQuestion(question).length > 0);
  if (invalidQuestion) {
    return { ok: false, error: "Hãy sửa tất cả câu hỏi chưa hợp lệ trước khi lưu." };
  }

  try {
    const studySet = await createStudySet(parsed.data);
    revalidatePath("/");
    return { ok: true, data: { id: studySet.id } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể lưu bộ đề." };
  }
}

export async function deleteStudySetAction(studySetId: string, shouldRedirect: boolean) {
  await requireAdmin();

  await deleteStudySet(studySetId);
  revalidatePath("/");
  if (shouldRedirect) {
    redirect("/");
  }
}

export async function updateStudySetTitleAction(studySetId: string, formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return;
  }

  await updateStudySetTitle(studySetId, title);
  revalidatePath(`/study-sets/${studySetId}`);
  revalidatePath("/");
}

export async function loginAdminAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = getSafeRedirectPath(formData.get("redirectTo"));

  if (!isAdminCredential(username, password)) {
    redirect(`/admin-login?error=1&from=${encodeURIComponent(redirectTo)}`);
  }

  await createAdminSession();
  revalidatePath("/");
  revalidatePath(redirectTo);
  redirect(redirectTo);
}

export async function logoutAdminAction() {
  await clearAdminSession();
  revalidatePath("/");
  redirect("/");
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
    return { ok: false, error: "Đáp án chọn phải là A, B, C hoặc D." };
  }

  try {
    return { ok: true, data: await submitAnswer(sessionId, questionId, selectedAnswer) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể gửi đáp án." };
  }
}

export async function resetStudySessionAction(sessionId: string): Promise<ActionResult<StudySessionView>> {
  try {
    return { ok: true, data: await resetStudySession(sessionId) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể đặt lại phiên học." };
  }
}
