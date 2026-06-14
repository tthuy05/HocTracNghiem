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

const labeledQuestionStartPattern = /^(?:(?:câu|cau|question)\s*\d+\s*[:.])\s*(.*)$/iu;
const numberedQuestionStartPattern = /^\d+\s*[.)]\s*(.*)$/iu;
const answerPattern = /^(?:đáp\s*án|dap\s*an|answer|correct(?:\s+answer)?)\s*[:\-]\s*([A-D])\b/iu;
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
  const htmlText = htmlToParserText(html.value);

  return {
    text: htmlText || rawText.value,
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

    const inlineOptions = splitInlineOptions(trimmed);
    if (inlineOptions.options.length) {
      const prefix = normalizeWhitespace(inlineOptions.prefix);
      if (prefix) {
        if (currentOption) {
          options[currentOption].push(prefix);
        } else {
          contentLines.push(prefix);
        }
      }

      for (const option of inlineOptions.options) {
        currentOption = option.key;
        if (option.value) {
          options[currentOption].push(option.value);
        }
        if (option.inlineAnswer) {
          explicitAnswer = option.inlineAnswer;
        }
      }

      if (
        inlineOptions.options.length === 1 &&
        !emphasizedOptionAnswer &&
        isEmphasizedOptionLine(trimmed)
      ) {
        emphasizedOptionAnswer = inlineOptions.options[0].key;
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
    const questionText = getQuestionStartText(trimmed, current);

    if (questionText !== null) {
      if (current.some((value) => value.trim())) {
        blocks.push(current);
      }
      current = [questionText];
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

function getQuestionStartText(line: string, currentBlock: string[]) {
  const labeledMatch = line.match(labeledQuestionStartPattern);
  if (labeledMatch) {
    return labeledMatch[1] ?? "";
  }

  const numberedMatch = line.match(numberedQuestionStartPattern);
  if (!numberedMatch) {
    return null;
  }

  if (currentBlock.length === 0 || blockHasOptionMarkers(currentBlock)) {
    return numberedMatch[1] ?? "";
  }

  return null;
}

function blockHasOptionMarkers(lines: string[]) {
  return lines.some((line) => splitInlineOptions(line).options.length > 0);
}

function splitInlineOptions(line: string): {
  prefix: string;
  options: Array<{ key: AnswerKey; value: string; inlineAnswer?: AnswerKey }>;
} {
  const cleanLine = stripInlineMarkup(line);
  const optionMarkerPattern = /(^|\s)([A-D])\s*(?:[.)-])\s*/giu;
  const markers = Array.from(cleanLine.matchAll(optionMarkerPattern)).map((match) => ({
    key: match[2].toUpperCase() as AnswerKey,
    markerStart: (match.index ?? 0) + match[1].length,
    valueStart: (match.index ?? 0) + match[0].length,
  }));

  if (!markers.length) {
    return {
      prefix: cleanLine,
      options: [],
    };
  }

  return {
    prefix: cleanLine.slice(0, markers[0].markerStart),
    options: markers.map((marker, index) => {
      const nextMarker = markers[index + 1];
      const rawValue = cleanLine.slice(marker.valueStart, nextMarker?.markerStart ?? cleanLine.length);
      const inlineAnswer = splitInlineAnswer(rawValue);

      return {
        key: marker.key,
        value: inlineAnswer.text,
        inlineAnswer: inlineAnswer.answer,
      };
    }),
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
    if (labeledQuestionStartPattern.test(text.trim())) {
      questionIndex += 1;
    }

    const inlineOptions = splitInlineOptions(text);
    if (
      questionIndex >= 0 &&
      inlineOptions.options.length === 1 &&
      isEmphasizedOptionLine(paragraph) &&
      !answers[questionIndex]
    ) {
      answers[questionIndex] = inlineOptions.options[0].key;
    }
  }

  return answers;
}

function isEmphasizedLine(line: string) {
  return /(\*\*|__|<strong\b|<b\b|<mark\b|background-color|highlight)/iu.test(line);
}

function isEmphasizedOptionLine(line: string) {
  const withoutLeadingBoldLabel = line.replace(
    /^\s*(?:<p[^>]*>)?\s*<(?:strong|b)[^>]*>\s*[A-D]\s*(?:[.)-])\s*<\/(?:strong|b)>/iu,
    "",
  );
  return isEmphasizedLine(withoutLeadingBoldLabel);
}

function htmlToParserText(html: string) {
  const lines: string[] = [];
  const blockPattern = /<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\1>/giu;
  let inQuestion = false;
  let optionCount = 0;

  for (const match of html.matchAll(blockPattern)) {
    const tag = match[1].toLowerCase();
    let text = htmlBlockToText(match[2]);

    if (!text || isChapterHeading(text)) {
      continue;
    }

    if (labeledQuestionStartPattern.test(text) || (!inQuestion && numberedQuestionStartPattern.test(text))) {
      inQuestion = true;
      optionCount = 0;
      lines.push(text);
      optionCount = advanceOptionCount(optionCount, text);
      continue;
    }

    const inlineOptionsBeforeInference = splitInlineOptions(text);
    if (tag === "li" && inQuestion && optionCount < ANSWER_KEYS.length) {
      const expectedKey = ANSWER_KEYS[optionCount];
      const hasInferredOptionPrefix =
        inlineOptionsBeforeInference.options.length === 0 ||
        (normalizeWhitespace(inlineOptionsBeforeInference.prefix) &&
          inlineOptionsBeforeInference.options[0].key !== expectedKey);

      if (hasInferredOptionPrefix) {
        text = `${expectedKey}. ${text}`;
      }
    }

    lines.push(text);
    optionCount = advanceOptionCount(optionCount, text);
  }

  return lines.join("\n");
}

function advanceOptionCount(currentCount: number, line: string) {
  const inlineOptions = splitInlineOptions(line);
  if (!inlineOptions.options.length) {
    return currentCount;
  }

  const highestOptionIndex = Math.max(...inlineOptions.options.map((option) => ANSWER_KEYS.indexOf(option.key)));
  return Math.max(currentCount, highestOptionIndex + 1);
}

function htmlBlockToText(value: string) {
  return normalizeWhitespace(
    stripInlineMarkup(value)
      .replace(/<br\s*\/?>/giu, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function isChapterHeading(value: string) {
  return /^(?:chương|chuong)\s+\d+\b/iu.test(normalizeWhitespace(value));
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
    .replace(/(?:\*\*|__|`+)/g, "")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}
