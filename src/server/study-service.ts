import { prisma } from "@/lib/prisma";
import { ANSWER_KEYS, type AnswerKey } from "@/lib/parser";
import {
  createInitialSessionState,
  resetSessionState,
  submitAnswerToSessionState,
  type AnswerTransition,
  type StudySessionState,
} from "@/lib/study-engine";

export type StudySetSummary = {
  id: string;
  title: string;
  sourceFileName: string | null;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type QuestionView = {
  id: string;
  orderIndex: number;
  content: string;
  options: Record<AnswerKey, string>;
  correctAnswer: AnswerKey;
  explanation: string | null;
};

export type StudySetDetail = StudySetSummary & {
  questions: QuestionView[];
};

export type StudySessionView = {
  id: string;
  studySetId: string;
  studySetTitle: string;
  status: "IN_PROGRESS" | "COMPLETED";
  currentRound: number;
  currentIndex: number;
  currentQueue: string[];
  wrongQueue: string[];
  totalWrongAttempts: number;
  totalQuestions: number;
  currentQuestion: QuestionView | null;
};

export type SubmitAnswerResult = {
  session: StudySessionView;
  transition: AnswerTransition;
  answer: {
    questionId: string;
    selectedAnswer: AnswerKey;
    correctAnswer: AnswerKey;
    isCorrect: boolean;
  };
};

export type CreateStudySetInput = {
  title: string;
  sourceFileName?: string;
  questions: Array<{
    content: string;
    options: Record<AnswerKey, string>;
    correctAnswer: AnswerKey;
    explanation?: string;
  }>;
};

export async function getStudySets(): Promise<StudySetSummary[]> {
  const studySets = await prisma.studySet.findMany({
    orderBy: { createdAt: "desc" },
  });

  return studySets.map(mapStudySetSummary);
}

export async function getStudySetDetail(id: string): Promise<StudySetDetail | null> {
  const studySet = await prisma.studySet.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!studySet) {
    return null;
  }

  return {
    ...mapStudySetSummary(studySet),
    questions: studySet.questions.map(mapQuestionView),
  };
}

export async function createStudySet(input: CreateStudySetInput) {
  const questions = input.questions.map((question, index) => ({
    orderIndex: index,
    content: question.content.trim(),
    optionA: question.options.A.trim(),
    optionB: question.options.B.trim(),
    optionC: question.options.C.trim(),
    optionD: question.options.D.trim(),
    correctAnswer: question.correctAnswer,
    explanation: question.explanation?.trim() || null,
  }));

  return prisma.studySet.create({
    data: {
      title: input.title.trim(),
      sourceFileName: input.sourceFileName?.trim() || null,
      questionCount: questions.length,
      questions: {
        create: questions,
      },
    },
    select: {
      id: true,
    },
  });
}

export async function deleteStudySet(id: string) {
  await prisma.studySet.delete({
    where: { id },
  });
}

export async function updateStudySetTitle(id: string, title: string) {
  await prisma.studySet.update({
    where: { id },
    data: { title: title.trim() },
  });
}

export async function startStudySession(studySetId: string): Promise<StudySessionView> {
  const studySet = await prisma.studySet.findUnique({
    where: { id: studySetId },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!studySet) {
    throw new Error("Không tìm thấy bộ đề.");
  }

  if (!studySet.questions.length) {
    throw new Error("Bộ đề này chưa có câu hỏi.");
  }

  const initialState = createInitialSessionState(studySet.questions.map((question) => question.id));
  const session = await prisma.studySession.create({
    data: {
      studySetId,
      ...stateToPersistence(initialState),
    },
  });

  return buildStudySessionView(session, studySet);
}

export async function getStudySession(sessionId: string): Promise<StudySessionView | null> {
  const session = await prisma.studySession.findUnique({
    where: { id: sessionId },
    include: {
      studySet: {
        include: {
          questions: {
            orderBy: { orderIndex: "asc" },
          },
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  return buildStudySessionView(session, session.studySet);
}

export async function submitAnswer(
  sessionId: string,
  questionId: string,
  selectedAnswer: AnswerKey,
): Promise<SubmitAnswerResult> {
  const session = await prisma.studySession.findUnique({
    where: { id: sessionId },
    include: {
      studySet: {
        include: {
          questions: {
            orderBy: { orderIndex: "asc" },
          },
        },
      },
    },
  });

  if (!session) {
    throw new Error("Không tìm thấy phiên học.");
  }

  const question = session.studySet.questions.find((item) => item.id === questionId);
  if (!question) {
    throw new Error("Không tìm thấy câu hỏi trong bộ đề này.");
  }

  const correctAnswer = parseAnswerKey(question.correctAnswer);
  const result = submitAnswerToSessionState(parseSessionState(session), {
    questionId,
    selectedAnswer,
    correctAnswer,
  });

  const updatedSession = await prisma.$transaction(async (tx) => {
    await tx.answerAttempt.create({
      data: {
        sessionId,
        questionId,
        selectedAnswer: result.attempt.selectedAnswer,
        correctAnswer: result.attempt.correctAnswer,
        isCorrect: result.attempt.isCorrect,
        round: result.attempt.round,
      },
    });

    return tx.studySession.update({
      where: { id: sessionId },
      data: stateToPersistence(result.nextState),
    });
  });

  return {
    session: buildStudySessionView(updatedSession, session.studySet),
    transition: result.transition,
    answer: {
      questionId,
      selectedAnswer,
      correctAnswer,
      isCorrect: result.attempt.isCorrect,
    },
  };
}

export async function resetStudySession(sessionId: string): Promise<StudySessionView> {
  const session = await prisma.studySession.findUnique({
    where: { id: sessionId },
    include: {
      studySet: {
        include: {
          questions: {
            orderBy: { orderIndex: "asc" },
          },
        },
      },
    },
  });

  if (!session) {
    throw new Error("Không tìm thấy phiên học.");
  }

  const resetState = resetSessionState(session.studySet.questions.map((question) => question.id));
  const updatedSession = await prisma.studySession.update({
    where: { id: sessionId },
    data: stateToPersistence(resetState),
  });

  return buildStudySessionView(updatedSession, session.studySet);
}

function mapStudySetSummary(studySet: {
  id: string;
  title: string;
  sourceFileName: string | null;
  questionCount: number;
  createdAt: Date;
  updatedAt: Date;
}): StudySetSummary {
  return {
    id: studySet.id,
    title: studySet.title,
    sourceFileName: studySet.sourceFileName,
    questionCount: studySet.questionCount,
    createdAt: studySet.createdAt.toISOString(),
    updatedAt: studySet.updatedAt.toISOString(),
  };
}

function mapQuestionView(question: {
  id: string;
  orderIndex: number;
  content: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  explanation: string | null;
}): QuestionView {
  return {
    id: question.id,
    orderIndex: question.orderIndex,
    content: question.content,
    options: {
      A: question.optionA,
      B: question.optionB,
      C: question.optionC,
      D: question.optionD,
    },
    correctAnswer: parseAnswerKey(question.correctAnswer),
    explanation: question.explanation,
  };
}

function buildStudySessionView(
  session: {
    id: string;
    studySetId: string;
    status: string;
    currentRound: number;
    currentIndex: number;
    currentQueueJson: string;
    wrongQueueJson: string;
    totalWrongAttempts: number;
  },
  studySet: {
    title: string;
    questions: Array<Parameters<typeof mapQuestionView>[0]>;
  },
): StudySessionView {
  const state = parseSessionState(session);
  const questions = studySet.questions.map(mapQuestionView);
  const currentQuestionId = state.currentQueue[state.currentIndex];
  const currentQuestion = currentQuestionId
    ? questions.find((question) => question.id === currentQuestionId) ?? null
    : null;

  return {
    id: session.id,
    studySetId: session.studySetId,
    studySetTitle: studySet.title,
    status: state.status,
    currentRound: state.currentRound,
    currentIndex: state.currentIndex,
    currentQueue: state.currentQueue,
    wrongQueue: state.wrongQueue,
    totalWrongAttempts: state.totalWrongAttempts,
    totalQuestions: questions.length,
    currentQuestion,
  };
}

function parseSessionState(session: {
  status: string;
  currentRound: number;
  currentIndex: number;
  currentQueueJson: string;
  wrongQueueJson: string;
  totalWrongAttempts: number;
}): StudySessionState {
  return {
    currentQueue: parseStringArray(session.currentQueueJson),
    wrongQueue: parseStringArray(session.wrongQueueJson),
    currentRound: session.currentRound,
    currentIndex: session.currentIndex,
    totalWrongAttempts: session.totalWrongAttempts,
    status: session.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
  };
}

function stateToPersistence(state: StudySessionState) {
  return {
    status: state.status,
    currentRound: state.currentRound,
    currentIndex: state.currentIndex,
    currentQueueJson: JSON.stringify(state.currentQueue),
    wrongQueueJson: JSON.stringify(state.wrongQueue),
    totalWrongAttempts: state.totalWrongAttempts,
  };
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseAnswerKey(value: string): AnswerKey {
  const upper = value.toUpperCase();
  if (!ANSWER_KEYS.includes(upper as AnswerKey)) {
    throw new Error("Đáp án lưu trong cơ sở dữ liệu không hợp lệ.");
  }

  return upper as AnswerKey;
}
