import mammoth from "mammoth";

export const ANSWER_KEYS = ["A", "B", "C", "D"] as const;
export type AnswerKey = (typeof ANSWER_KEYS)[number];

export type ParsedQuestion = {
  id: string;
  orderIndex: number;
  content: string;
  options: Record<AnswerKey, string>;
  correctAnswer?: AnswerKey;
  errors: string[];
  raw: string;
};

export type ParseResult = {
  totalDetected: number;
  validCount: number;
  missingAnswerCount: number;
  questions: ParsedQuestion[];
};

type ParseOptions = {
  emphasizedAnswersByOrder?: Record<number, AnswerKey>;
};

type DocxExtraction = {
  text: string;
  emphasizedAnswersByOrder: Record<number, AnswerKey>;
};

const questionStartPattern = /^(?:(?:câu|cau|question)\s*\d+\s*[:.]|\d+\s*[.)])\s*(.*)$/iu;
const answerPattern = /^(?:đáp\s*án|dap\s*an|answer|correct(?:\s+answer)?)\s*[:\-]\s*([A-D])\b/iu;
const optionPattern = /^([A-D])\s*(?:[.)-])\s*(.+)$/iu;
const qualifiedAnswerPattern = /^(?:đáp\s*án\s*đúng|dap\s*an\s*dung)\s*[:\-]\s*([A-D])\b/iu;
const inlineAnswerPattern =
  /(?:^|\s)(?:đáp\s*án(?:\s*đúng)?|dap\s*an(?:\s*dung)?|answer|correct(?:\s+answer)?)\s*[:\-]\s*([A-D])\b.*$/iu;

export function parseQuestionsFromText(input: string, options: ParseOptions = {}): ParseResult {
  const normalized = normalizeText(input);
  const blocks = splitQuestionBlocks(normalized);
  const questions = blocks.map((block, index) =>
    parseQuestionBlock(block, index, options.emphasizedAnswersByOrder?.[index]),
  );

  return {
    totalDetected: questions.length,
    validCount: questions.filter((question) => question.errors.length === 0).length,
    missingAnswerCount: questions.filter((question) => !question.correctAnswer).length,
    questions,
  };
}

export async function extractDocxForParsing(arrayBuffer: ArrayBuffer): Promise<DocxExtraction> {
  const buffer = Buffer.from(arrayBuffer);
  const [rawText, html] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer }),
  ]);

  return {
    text: rawText.value,
    emphasizedAnswersByOrder: detectEmphasizedAnswersFromHtml(html.value),
  };
}

function parseQuestionBlock(lines: string[], index: number, emphasizedAnswer?: AnswerKey): ParsedQuestion {
  const contentLines: string[] = [];
  const options: Record<AnswerKey, string[]> = {
    A: [],
    B: [],
    C: [],
    D: [],
  };
  let currentOption: AnswerKey | null = null;
  let explicitAnswer: AnswerKey | undefined;
  let emphasizedOptionAnswer: AnswerKey | undefined = emphasizedAnswer;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const cleanLine = stripInlineMarkup(trimmed);
    const answerMatch = cleanLine.match(qualifiedAnswerPattern) ?? cleanLine.match(answerPattern);
    if (answerMatch) {
      explicitAnswer = answerMatch[1].toUpperCase() as AnswerKey;
      currentOption = null;
      continue;
    }

    const optionMatch = parseOptionLine(trimmed);
    if (optionMatch) {
      currentOption = optionMatch.key;
      if (optionMatch.value) {
        options[currentOption].push(optionMatch.value);
      }
      if (optionMatch.inlineAnswer) {
        explicitAnswer = optionMatch.inlineAnswer;
      }
      if (!emphasizedOptionAnswer && isEmphasizedLine(trimmed)) {
        emphasizedOptionAnswer = currentOption;
      }
      continue;
    }

    if (currentOption) {
      const continuation = splitInlineAnswer(trimmed);
      if (continuation.text) {
        options[currentOption].push(continuation.text);
      }
      if (continuation.answer) {
        explicitAnswer = continuation.answer;
      }
    } else {
      contentLines.push(cleanLine);
    }
  }

  const normalizedOptions = ANSWER_KEYS.reduce(
    (accumulator, key) => ({
      ...accumulator,
      [key]: normalizeWhitespace(options[key].join(" ")),
    }),
    {} as Record<AnswerKey, string>,
  );

  const correctAnswer = explicitAnswer ?? emphasizedOptionAnswer;
  const parsed: ParsedQuestion = {
    id: `parsed-${index + 1}`,
    orderIndex: index,
    content: normalizeWhitespace(contentLines.join(" ")),
    options: normalizedOptions,
    correctAnswer,
    errors: [],
    raw: lines.join("\n"),
  };

  parsed.errors = validateParsedQuestion(parsed);
  return parsed;
}

export function validateParsedQuestion(question: Pick<ParsedQuestion, "content" | "options" | "correctAnswer">) {
  const errors: string[] = [];

  if (!question.content.trim()) {
    errors.push("Thiếu nội dung câu hỏi.");
  }

  for (const key of ANSWER_KEYS) {
    if (!question.options[key]?.trim()) {
      errors.push(`Thiếu đáp án ${key}.`);
    }
  }

  if (!question.correctAnswer) {
    errors.push("Thiếu đáp án đúng.");
  } else if (!ANSWER_KEYS.includes(question.correctAnswer)) {
    errors.push("Đáp án đúng phải là A, B, C hoặc D.");
  }

  return errors;
}

function splitQuestionBlocks(text: string) {
  const lines = text.split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const questionMatch = trimmed.match(questionStartPattern);

    if (questionMatch) {
      if (current.some((value) => value.trim())) {
        blocks.push(current);
      }
      current = [questionMatch[1] ?? ""];
      continue;
    }

    if (current.length) {
      current.push(line);
    }
  }

  if (current.some((value) => value.trim())) {
    blocks.push(current);
  }

  return blocks;
}

function parseOptionLine(line: string): { key: AnswerKey; value: string; inlineAnswer?: AnswerKey } | null {
  const cleanLine = stripInlineMarkup(line);
  const match = cleanLine.match(optionPattern);

  if (!match) {
    return null;
  }

  const inlineAnswer = splitInlineAnswer(match[2]);

  return {
    key: match[1].toUpperCase() as AnswerKey,
    value: inlineAnswer.text,
    inlineAnswer: inlineAnswer.answer,
  };
}

function splitInlineAnswer(value: string): { text: string; answer?: AnswerKey } {
  const cleanValue = stripInlineMarkup(value);
  const answerMatch = cleanValue.match(inlineAnswerPattern);

  if (!answerMatch || answerMatch.index === undefined) {
    return { text: normalizeWhitespace(cleanValue) };
  }

  return {
    text: normalizeWhitespace(cleanValue.slice(0, answerMatch.index)),
    answer: answerMatch[1].toUpperCase() as AnswerKey,
  };
}

function detectEmphasizedAnswersFromHtml(html: string): Record<number, AnswerKey> {
  const answers: Record<number, AnswerKey> = {};
  const paragraphs = html.split(/<\/p>/i);
  let questionIndex = -1;

  for (const paragraph of paragraphs) {
    const text = stripInlineMarkup(paragraph);
    if (questionStartPattern.test(text.trim())) {
      questionIndex += 1;
    }

    const optionMatch = parseOptionLine(text);
    if (questionIndex >= 0 && optionMatch && isEmphasizedLine(paragraph) && !answers[questionIndex]) {
      answers[questionIndex] = optionMatch.key;
    }
  }

  return answers;
}

function isEmphasizedLine(line: string) {
  return /(\*\*|__|<strong\b|<b\b|<mark\b|background-color|highlight)/iu.test(line);
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripInlineMarkup(value: string) {
  return value
    .replace(/<\/?(strong|b|mark|span|em|i)[^>]*>/giu, "")
    .replace(/[*_`]+/g, "")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}
