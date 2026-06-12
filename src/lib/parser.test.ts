import { describe, expect, it } from "vitest";
import { parseQuestionsFromText } from "@/lib/parser";

describe("parseQuestionsFromText", () => {
  it("detects Vietnamese question and A/B/C/D options", () => {
    const result = parseQuestionsFromText(`
Câu 1: Thủ đô Việt Nam là gì?
A. Đà Nẵng
B. Hà Nội
C. Huế
D. Cần Thơ
Đáp án: B
`);

    expect(result.totalDetected).toBe(1);
    expect(result.validCount).toBe(1);
    expect(result.questions[0].content).toBe("Thủ đô Việt Nam là gì?");
    expect(result.questions[0].options.B).toBe("Hà Nội");
    expect(result.questions[0].correctAnswer).toBe("B");
  });

  it("detects English question and answer formats", () => {
    const result = parseQuestionsFromText(`
Question 1: Which letter comes first?
A) B
B) A
C) C
D) D
Correct answer: B
`);

    expect(result.questions[0].correctAnswer).toBe("B");
    expect(result.questions[0].errors).toHaveLength(0);
  });

  it("detects numbered questions and dash options", () => {
    const result = parseQuestionsFromText(`
1. Choose the valid option
A - One
B - Two
C - Three
D - Four
Answer: A
`);

    expect(result.questions[0].options.A).toBe("One");
    expect(result.questions[0].correctAnswer).toBe("A");
  });

  it("removes inline Vietnamese answer labels from option text", () => {
    const result = parseQuestionsFromText(`
Câu 1: File system nào hỗ trợ ACL?
A. FAT
B. FAT32
C. HPFS
D. NTFS Đáp án đúng: D
`);

    expect(result.questions[0].options.D).toBe("NTFS");
    expect(result.questions[0].correctAnswer).toBe("D");
    expect(result.questions[0].errors).toHaveLength(0);
  });

  it("marks a question invalid when the correct answer is missing", () => {
    const result = parseQuestionsFromText(`
Cau 1. Missing answer example
A. Alpha
B. Beta
C. Gamma
D. Delta
`);

    expect(result.validCount).toBe(0);
    expect(result.missingAnswerCount).toBe(1);
    expect(result.questions[0].errors).toContain("Thiếu đáp án đúng.");
  });

  it("uses emphasized options as a best-effort correct answer signal", () => {
    const result = parseQuestionsFromText(`
Câu 1: Correct option is bold
A. Wrong
**B. Correct**
C. Wrong
D. Wrong
`);

    expect(result.questions[0].correctAnswer).toBe("B");
    expect(result.questions[0].errors).toHaveLength(0);
  });
});
