import { describe, expect, it } from "vitest";
import {
  createInitialSessionState,
  resetSessionState,
  submitAnswerToSessionState,
} from "@/lib/study-engine";

describe("study session engine", () => {
  it("creates the initial queue in order", () => {
    const state = createInitialSessionState(["q1", "q2"]);

    expect(state.currentQueue).toEqual(["q1", "q2"]);
    expect(state.wrongQueue).toEqual([]);
    expect(state.currentRound).toBe(1);
    expect(state.currentIndex).toBe(0);
  });

  it("adds wrong answers to the wrong queue and advances", () => {
    const state = createInitialSessionState(["q1", "q2"]);
    const result = submitAnswerToSessionState(state, {
      questionId: "q1",
      selectedAnswer: "A",
      correctAnswer: "B",
    });

    expect(result.attempt.isCorrect).toBe(false);
    expect(result.nextState.wrongQueue).toEqual(["q1"]);
    expect(result.nextState.currentIndex).toBe(1);
    expect(result.nextState.totalWrongAttempts).toBe(1);
  });

  it("starts a new round with only wrong answers", () => {
    const first = submitAnswerToSessionState(createInitialSessionState(["q1", "q2"]), {
      questionId: "q1",
      selectedAnswer: "A",
      correctAnswer: "B",
    });
    const second = submitAnswerToSessionState(first.nextState, {
      questionId: "q2",
      selectedAnswer: "C",
      correctAnswer: "C",
    });

    expect(second.transition).toEqual({ type: "round", completedRound: 1, wrongCount: 1 });
    expect(second.nextState.currentQueue).toEqual(["q1"]);
    expect(second.nextState.currentRound).toBe(2);
    expect(second.nextState.currentIndex).toBe(0);
  });

  it("completes when the final round has no wrong answers", () => {
    const state = createInitialSessionState(["q1"]);
    const result = submitAnswerToSessionState(state, {
      questionId: "q1",
      selectedAnswer: "D",
      correctAnswer: "D",
    });

    expect(result.transition).toEqual({ type: "complete" });
    expect(result.nextState.status).toBe("COMPLETED");
  });

  it("resets a session from the full question list", () => {
    const reset = resetSessionState(["q1", "q2", "q3"]);

    expect(reset.currentQueue).toEqual(["q1", "q2", "q3"]);
    expect(reset.currentRound).toBe(1);
    expect(reset.totalWrongAttempts).toBe(0);
    expect(reset.status).toBe("IN_PROGRESS");
  });
});
