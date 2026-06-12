import type { AnswerKey } from "@/lib/parser";

export type SessionStatus = "IN_PROGRESS" | "COMPLETED";

export type StudySessionState = {
  currentQueue: string[];
  wrongQueue: string[];
  currentRound: number;
  currentIndex: number;
  totalWrongAttempts: number;
  status: SessionStatus;
};

export type AnswerTransition =
  | { type: "question" }
  | { type: "round"; completedRound: number; wrongCount: number }
  | { type: "complete" };

export type AnswerAttemptDraft = {
  questionId: string;
  selectedAnswer: AnswerKey;
  correctAnswer: AnswerKey;
  isCorrect: boolean;
  round: number;
};

export function createInitialSessionState(questionIds: string[]): StudySessionState {
  return {
    currentQueue: [...questionIds],
    wrongQueue: [],
    currentRound: 1,
    currentIndex: 0,
    totalWrongAttempts: 0,
    status: questionIds.length ? "IN_PROGRESS" : "COMPLETED",
  };
}

export function resetSessionState(questionIds: string[]): StudySessionState {
  return createInitialSessionState(questionIds);
}

export function submitAnswerToSessionState(
  state: StudySessionState,
  input: {
    questionId: string;
    selectedAnswer: AnswerKey;
    correctAnswer: AnswerKey;
  },
): { nextState: StudySessionState; attempt: AnswerAttemptDraft; transition: AnswerTransition } {
  if (state.status === "COMPLETED") {
    throw new Error("This study session is already completed.");
  }

  const expectedQuestionId = state.currentQueue[state.currentIndex];
  if (!expectedQuestionId) {
    throw new Error("There is no active question in this study session.");
  }

  if (expectedQuestionId !== input.questionId) {
    throw new Error("The submitted question is not the current question.");
  }

  const isCorrect = input.selectedAnswer === input.correctAnswer;
  const updatedWrongQueue = isCorrect ? [...state.wrongQueue] : [...state.wrongQueue, input.questionId];
  const totalWrongAttempts = state.totalWrongAttempts + (isCorrect ? 0 : 1);
  const attempt: AnswerAttemptDraft = {
    questionId: input.questionId,
    selectedAnswer: input.selectedAnswer,
    correctAnswer: input.correctAnswer,
    isCorrect,
    round: state.currentRound,
  };

  const nextIndex = state.currentIndex + 1;
  if (nextIndex < state.currentQueue.length) {
    return {
      attempt,
      transition: { type: "question" },
      nextState: {
        ...state,
        wrongQueue: updatedWrongQueue,
        currentIndex: nextIndex,
        totalWrongAttempts,
      },
    };
  }

  if (updatedWrongQueue.length > 0) {
    return {
      attempt,
      transition: {
        type: "round",
        completedRound: state.currentRound,
        wrongCount: updatedWrongQueue.length,
      },
      nextState: {
        currentQueue: updatedWrongQueue,
        wrongQueue: [],
        currentRound: state.currentRound + 1,
        currentIndex: 0,
        totalWrongAttempts,
        status: "IN_PROGRESS",
      },
    };
  }

  return {
    attempt,
    transition: { type: "complete" },
    nextState: {
      ...state,
      wrongQueue: [],
      currentIndex: state.currentQueue.length,
      totalWrongAttempts,
      status: "COMPLETED",
    },
  };
}
