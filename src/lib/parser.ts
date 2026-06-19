import mammoth from "mammoth";
import JSZip from "jszip";

export const ANSWER_KEYS = ["A", "B", "C", "D"] as const;
export type AnswerKey = (typeof ANSWER_KEYS)[number];

export type QuestionTable = {
  headers: string[];
  rows: string[][];
};

export type QuestionOption = {
  label: AnswerKey;
  text: string;
};

export type QuestionContent = {
  content: string;
  table?: QuestionTable;
  questionText?: string;
  statements?: string[];
};

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

const tableHeaderPattern =
  /(?<group>Nhóm\s*\/\s*Người\s+dùng)\s+(?<ntfs>(?:Quyền\s+bảo\s+mật\s+)?NTFS)\s+(?<share>(?:Quyền\s+)?Chia\s+sẻ(?:\s*\(Share\))?)/iu;
const asciiTableHeaderPattern =
  /(?<group>Nhom\s*\/\s*Nguoi\s+dung|Group\s*\/\s*User)\s+(?<ntfs>(?:Quyen\s+bao\s+mat\s+)?NTFS)\s+(?<share>(?:Quyen\s+)?Chia\s+se(?:\s*\(Share\))?|Share)/iu;
const permissionPattern =
  "Full\\s+Control|Read\\s*&\\s*Execute|List\\s+Folder\\s+Contents|No\\s+Access|Modify|Change|Read|Write|Deny|Allow";
const tableRowPattern = new RegExp(
  `^(?<name>[^.!?\\n]{1,80}?)\\s+(?<ntfs>${permissionPattern})\\s+(?<share>${permissionPattern})(?=\\s|$)`,
  "iu",
);
const numberedStatementPattern = /(?:^|\s)(\d{1,2})\.(?!\d)\s*/gu;
const trailingQuestionPattern =
  /^(?<statement>[\s\S]*?[.!?])\s+(?<question>(?:Bạn|Anh|Chị|Hành động|Lựa chọn|Phương án|Những|Các|Điều gì|Câu nào)[\s\S]*\?)$/iu;

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

export function parseQuestionContent(input: string): QuestionContent {
  const normalized = normalizeStructuredText(stripInlineMarkup(input));
  const tableExtraction = extractQuestionTable(normalized);

  if (tableExtraction.table) {
    const beforeTable = splitContentAndQuestionText(tableExtraction.before);
    const afterTableStatements = extractNumberedStatements(tableExtraction.after);
    const afterTable = splitContentAndQuestionText(afterTableStatements.before);

    return compactQuestionContent({
      content: beforeTable.content,
      table: tableExtraction.table,
      questionText: joinStructuredText(
        beforeTable.questionText,
        afterTable.content,
        afterTable.questionText,
        afterTableStatements.after,
      ),
      statements: afterTableStatements.statements,
    });
  }

  const statementExtraction = extractNumberedStatements(normalized);
  const beforeStatements = splitContentAndQuestionText(statementExtraction.before);

  return compactQuestionContent({
    content: beforeStatements.content,
    questionText: joinStructuredText(
      beforeStatements.questionText,
      statementExtraction.after,
    ),
    statements: statementExtraction.statements,
  });
}

export async function extractDocxForParsing(arrayBuffer: ArrayBuffer): Promise<DocxExtraction> {
  const buffer = Buffer.from(arrayBuffer);
  const [rawText, html] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer }),
  ]);
  const htmlText = htmlToParserText(html.value);
  const coloredAnswersByOrder = await detectColoredAnswersFromDocx(buffer);

  return {
    text: htmlText || rawText.value,
    emphasizedAnswersByOrder: {
      ...detectEmphasizedAnswersFromHtml(html.value),
      ...coloredAnswersByOrder,
    },
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
        const prefixOption = getMissingOptionForPrefix(prefix, inlineOptions.options[0].key, currentOption, options);
        if (prefixOption) {
          options[prefixOption].push(prefix);
          if (!emphasizedOptionAnswer && isTextEmphasizedInLine(trimmed, prefix)) {
            emphasizedOptionAnswer = prefixOption;
          }
        } else if (currentOption) {
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

      const emphasizedInlineAnswer = getEmphasizedAnswerFromLine(trimmed, inlineOptions.options);
      if (!emphasizedOptionAnswer && emphasizedInlineAnswer) {
        emphasizedOptionAnswer = emphasizedInlineAnswer;
      }

      continue;
    }

    if (currentOption) {
      const continuation = splitInlineAnswer(trimmed);
      if (continuation.text) {
        const nextOption = getNextUnlabeledOption(trimmed, currentOption, options);
        if (nextOption) {
          currentOption = nextOption;
          options[currentOption].push(continuation.text);
          if (!emphasizedOptionAnswer && isEmphasizedLine(trimmed)) {
            emphasizedOptionAnswer = currentOption;
          }
        } else {
          options[currentOption].push(continuation.text);
        }
      }
      if (continuation.answer) {
        explicitAnswer = continuation.answer;
      }
    } else {
      contentLines.push(trimmed);
    }
  }

  const promotedAnswer = promoteTrailingContentToMissingOptions(contentLines, options);
  if (!emphasizedOptionAnswer && promotedAnswer) {
    emphasizedOptionAnswer = promotedAnswer;
  }

  if (!hasParsedOptions(options)) {
    const inferred = inferUnlabeledOptions(contentLines);
    if (inferred) {
      contentLines.splice(0, contentLines.length, ...inferred.contentLines);
      for (const key of ANSWER_KEYS) {
        options[key].push(inferred.options[key]);
      }
      if (!emphasizedOptionAnswer && inferred.emphasizedAnswer) {
        emphasizedOptionAnswer = inferred.emphasizedAnswer;
      }
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
    content: normalizeContentLines(contentLines),
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
    if (
      (blockHasCompleteOptionMarkers(currentBlock) || blockHasUnlabeledOptionTail(currentBlock)) &&
      looksLikeQuestionStartWithoutMarker(line)
    ) {
      return line;
    }

    const embeddedNumberedQuestion = getEmbeddedNumberedQuestionText(line);
    if (embeddedNumberedQuestion && canStartQuestionAfterBlock(currentBlock)) {
      return embeddedNumberedQuestion;
    }
    return null;
  }

  if (canStartQuestionAfterBlock(currentBlock)) {
    return numberedMatch[1] ?? "";
  }

  return null;
}

function canStartQuestionAfterBlock(lines: string[]) {
  return lines.length === 0 || blockHasOptionMarkers(lines) || blockHasUnlabeledOptionTail(lines);
}

function blockHasOptionMarkers(lines: string[]) {
  return lines.some((line) => splitInlineOptions(line).options.length > 0);
}

function blockHasCompleteOptionMarkers(lines: string[]) {
  const keys = new Set(lines.flatMap((line) => splitInlineOptions(line).options.map((option) => option.key)));
  return ANSWER_KEYS.every((key) => keys.has(key));
}

function blockHasUnlabeledOptionTail(lines: string[]) {
  const meaningfulLines = lines.filter((line) => normalizeWhitespace(stripInlineMarkup(line)));
  if (meaningfulLines.length < ANSWER_KEYS.length + 1 || blockHasOptionMarkers(lines)) {
    return false;
  }

  const optionLikeTail = meaningfulLines.slice(-ANSWER_KEYS.length);
  return (
    optionLikeTail.some(isEmphasizedLine) &&
    optionLikeTail.every((line) => {
      const cleanLine = normalizeWhitespace(stripInlineMarkup(line));
      return cleanLine.length >= 2 && cleanLine.length <= 180 && !cleanLine.endsWith("?");
    })
  );
}

function looksLikeQuestionStartWithoutMarker(line: string) {
  const cleanLine = normalizeWhitespace(stripInlineMarkup(line));
  if (!cleanLine) {
    return false;
  }

  const inlineOptions = splitInlineOptions(cleanLine);
  if (inlineOptions.options.length) {
    const prefix = normalizeWhitespace(inlineOptions.prefix);
    return prefix.length >= 15 && prefix.includes("?");
  }

  return cleanLine.length >= 80 || cleanLine.includes("?");
}

function getEmbeddedNumberedQuestionText(line: string) {
  const cleanLine = normalizeWhitespace(stripInlineMarkup(line));
  const match = cleanLine.match(/^(?:CLO[\w.]*\s*[–-]\s*.+?\s+)?\d+\s*[.)]\s*(.+)$/iu);
  return match?.[1] ?? null;
}

function splitInlineOptions(line: string): {
  prefix: string;
  options: Array<{ key: AnswerKey; value: string; inlineAnswer?: AnswerKey }>;
} {
  const cleanLine = stripInlineMarkup(line);
  const optionMarkerPattern = /(^|\s)([A-D])\s*(?:[.)-])\s*/giu;
  let markers = Array.from(cleanLine.matchAll(optionMarkerPattern)).map((match) => ({
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

  const prefix = cleanLine.slice(0, markers[0].markerStart);
  const missingOptionAStart = getMissingOptionAStart(prefix, markers[0].key);
  if (missingOptionAStart !== null) {
    markers = [
      {
        key: "A",
        markerStart: missingOptionAStart,
        valueStart: missingOptionAStart,
      },
      ...markers,
    ];
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

function getMissingOptionAStart(prefix: string, firstOptionKey: AnswerKey) {
  const cleanPrefix = normalizeWhitespace(prefix);
  if (firstOptionKey !== "B" || !cleanPrefix) {
    return null;
  }

  const questionMarkIndex = prefix.lastIndexOf("?");
  if (questionMarkIndex >= 0) {
    const optionText = normalizeWhitespace(prefix.slice(questionMarkIndex + 1));
    return isMissingOptionAValue(optionText) ? questionMarkIndex + 1 : null;
  }

  return isMissingOptionAValue(cleanPrefix) ? 0 : null;
}

function isMissingOptionAValue(value: string) {
  return (
    value.length > 0 &&
    value.length <= 120 &&
    !value.includes("?") &&
    !labeledQuestionStartPattern.test(value)
  );
}

function getMissingOptionForPrefix(
  prefix: string,
  firstInlineOption: AnswerKey,
  currentOption: AnswerKey | null,
  options: Record<AnswerKey, string[]>,
): AnswerKey | null {
  if (!isOptionLikeText(prefix)) {
    return null;
  }

  const firstInlineIndex = ANSWER_KEYS.indexOf(firstInlineOption);
  const candidate = currentOption
    ? ANSWER_KEYS[ANSWER_KEYS.indexOf(currentOption) + 1]
    : ANSWER_KEYS[firstInlineIndex - 1];

  if (!candidate) {
    return null;
  }

  return ANSWER_KEYS.indexOf(candidate) < firstInlineIndex && !options[candidate].length ? candidate : null;
}

function getNextUnlabeledOption(
  line: string,
  currentOption: AnswerKey,
  options: Record<AnswerKey, string[]>,
): AnswerKey | null {
  const nextOption = ANSWER_KEYS[ANSWER_KEYS.indexOf(currentOption) + 1];
  if (!nextOption || options[nextOption].length || !options[currentOption].length || !isOptionLikeText(line)) {
    return null;
  }

  return nextOption;
}

function promoteTrailingContentToMissingOptions(
  contentLines: string[],
  options: Record<AnswerKey, string[]>,
): AnswerKey | undefined {
  if (!hasParsedOptions(options)) {
    return undefined;
  }

  const missingKeys = ANSWER_KEYS.filter((key) => !options[key].some((value) => value.trim()));
  if (!missingKeys.length) {
    return undefined;
  }

  const promotedLines: string[] = [];
  while (promotedLines.length < missingKeys.length && contentLines.length) {
    const candidate = contentLines[contentLines.length - 1];
    if (!isOptionLikeText(candidate)) {
      break;
    }
    promotedLines.unshift(contentLines.pop() ?? "");
  }

  if (promotedLines.length !== missingKeys.length) {
    contentLines.push(...promotedLines);
    return undefined;
  }

  let emphasizedAnswer: AnswerKey | undefined;
  for (const [index, key] of missingKeys.entries()) {
    const line = promotedLines[index];
    options[key].push(stripInlineMarkup(line));
    if (isEmphasizedLine(line)) {
      emphasizedAnswer = key;
    }
  }

  return emphasizedAnswer;
}

function isOptionLikeText(value: string) {
  const cleanValue = normalizeWhitespace(stripInlineMarkup(value));
  return (
    cleanValue.length >= 2 &&
    cleanValue.length <= 220 &&
    !cleanValue.endsWith("?") &&
    !labeledQuestionStartPattern.test(cleanValue) &&
    !looksLikeNumberedQuestionLine(cleanValue) &&
    !getEmbeddedNumberedQuestionText(cleanValue)
  );
}

function looksLikeNumberedQuestionLine(value: string) {
  return /^\d+\s*[.)]\s+\S/iu.test(value);
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

function getEmphasizedAnswerFromLine(
  line: string,
  options: Array<{ key: AnswerKey; value: string }>,
): AnswerKey | undefined {
  for (const fragment of getEmphasizedTextFragments(line)) {
    const fragmentOptions = splitInlineOptions(fragment);
    if (fragmentOptions.options.length) {
      return fragmentOptions.options[0].key;
    }

    const cleanFragment = normalizeWhitespace(stripInlineMarkup(fragment));
    const matchedOption = options.find((option) => {
      const optionValue = normalizeWhitespace(option.value);
      return optionValue && (optionValue.includes(cleanFragment) || cleanFragment.includes(optionValue));
    });
    if (matchedOption) {
      return matchedOption.key;
    }
  }

  return undefined;
}

function getEmphasizedTextFragments(line: string) {
  return Array.from(line.matchAll(/(?:\*\*|__)([\s\S]+?)(?:\*\*|__)|<(strong|b|mark)\b[^>]*>([\s\S]*?)<\/\2>/giu))
    .map((match) => match[1] ?? match[3] ?? "")
    .filter((value) => normalizeWhitespace(stripInlineMarkup(value)));
}

function isTextEmphasizedInLine(line: string, value: string) {
  const cleanValue = normalizeWhitespace(stripInlineMarkup(value));
  return getEmphasizedTextFragments(line).some((fragment) => {
    const cleanFragment = normalizeWhitespace(stripInlineMarkup(fragment));
    return cleanFragment && (cleanFragment.includes(cleanValue) || cleanValue.includes(cleanFragment));
  });
}

function htmlToParserText(html: string) {
  const lines: string[] = [];
  const blockPattern = /<(table|p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\1>/giu;
  let inQuestion = false;
  let optionCount = 0;

  for (const match of html.matchAll(blockPattern)) {
    const tag = match[1].toLowerCase();

    if (tag === "table") {
      lines.push(...htmlTableToParserLines(match[2]));
      continue;
    }

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

function hasParsedOptions(options: Record<AnswerKey, string[]>) {
  return ANSWER_KEYS.some((key) => options[key].some((value) => value.trim()));
}

function inferUnlabeledOptions(contentLines: string[]) {
  const meaningfulLines = contentLines.filter((line) => normalizeWhitespace(stripInlineMarkup(line)));
  if (meaningfulLines.length < ANSWER_KEYS.length + 1) {
    return null;
  }

  const optionLines = meaningfulLines.slice(-ANSWER_KEYS.length);
  if (!optionLines.some(isEmphasizedLine)) {
    return null;
  }

  const inferredOptions = ANSWER_KEYS.reduce(
    (accumulator, key, optionIndex) => ({
      ...accumulator,
      [key]: stripInlineMarkup(optionLines[optionIndex]),
    }),
    {} as Record<AnswerKey, string>,
  );
  const emphasizedIndex = optionLines.findIndex(isEmphasizedLine);

  return {
    contentLines: meaningfulLines.slice(0, -ANSWER_KEYS.length).map(stripInlineMarkup),
    options: inferredOptions,
    emphasizedAnswer: emphasizedIndex >= 0 ? ANSWER_KEYS[emphasizedIndex] : undefined,
  };
}

async function detectColoredAnswersFromDocx(buffer: Buffer): Promise<Record<number, AnswerKey>> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    return {};
  }

  const answers: Record<number, AnswerKey> = {};
  const paragraphs = Array.from(documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/giu)).map((match) => match[0]);
  let questionIndex = -1;
  let inQuestion = false;
  let optionCount = 0;

  for (const paragraph of paragraphs) {
    const { text: rawText, coloredText } = readDocxParagraphText(paragraph);
    let text = normalizeWhitespace(rawText);
    const redText = normalizeWhitespace(coloredText);

    if (!text || isChapterHeading(text)) {
      continue;
    }

    if (labeledQuestionStartPattern.test(text) || (!inQuestion && numberedQuestionStartPattern.test(text))) {
      questionIndex += 1;
      inQuestion = true;
      optionCount = 0;
      const answerFromLine = getColoredAnswerKey(text, redText);
      if (answerFromLine) {
        answers[questionIndex] = answerFromLine;
      }
      optionCount = advanceOptionCount(optionCount, text);
      continue;
    }

    const inlineOptionsBeforeInference = splitInlineOptions(text);
    if (isDocxListItem(paragraph) && inQuestion && optionCount < ANSWER_KEYS.length) {
      const expectedKey = ANSWER_KEYS[optionCount];
      const hasInferredOptionPrefix =
        inlineOptionsBeforeInference.options.length === 0 ||
        (normalizeWhitespace(inlineOptionsBeforeInference.prefix) &&
          inlineOptionsBeforeInference.options[0].key !== expectedKey);

      if (hasInferredOptionPrefix) {
        text = `${expectedKey}. ${text}`;
      }
    }

    if (questionIndex >= 0 && redText && !answers[questionIndex]) {
      const answerFromLine = getColoredAnswerKey(text, redText);
      if (answerFromLine) {
        answers[questionIndex] = answerFromLine;
      }
    }

    optionCount = advanceOptionCount(optionCount, text);
  }

  return answers;
}

function readDocxParagraphText(paragraphXml: string) {
  let text = "";
  let coloredText = "";
  const runs = Array.from(paragraphXml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/giu)).map((match) => match[0]);

  for (const run of runs) {
    const runText = readDocxRunText(run);
    text += runText;
    if (isColoredDocxRun(run)) {
      coloredText += runText;
    }
  }

  return { text, coloredText };
}

function readDocxRunText(runXml: string) {
  const textParts = Array.from(runXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/giu)).map((match) =>
    decodeXmlEntities(match[1]),
  );
  const tabCount = Array.from(runXml.matchAll(/<w:tab\b[^>]*\/>/giu)).length;

  return textParts.join("") + (tabCount ? " ".repeat(tabCount) : "");
}

function isColoredDocxRun(runXml: string) {
  return /<w:color\b[^>]*\bw:val="(?:FF0000|F00|red)"[^>]*\/?>/iu.test(runXml);
}

function isDocxListItem(paragraphXml: string) {
  return /<w:numPr\b[\s\S]*?<\/w:numPr>/iu.test(paragraphXml);
}

function getColoredAnswerKey(line: string, coloredText: string): AnswerKey | undefined {
  if (!coloredText) {
    return undefined;
  }

  const coloredOptions = splitInlineOptions(coloredText);
  if (coloredOptions.options.length) {
    return coloredOptions.options[0].key;
  }

  const coloredValue = normalizeWhitespace(coloredText);
  if (!coloredValue) {
    return undefined;
  }

  const lineOptions = splitInlineOptions(line);
  return lineOptions.options.find((option) => {
    const optionValue = normalizeWhitespace(option.value);
    return optionValue && (optionValue.includes(coloredValue) || coloredValue.includes(optionValue));
  })?.key;
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
  const withEmphasis = value.replace(
    /<(strong|b|mark)\b[^>]*>([\s\S]*?)<\/\1>/giu,
    (_, _tag, content) => ` **${htmlInlineToText(content)}** `,
  );
  return normalizeWhitespace(withEmphasis.replace(/<br\s*\/?>/giu, "\n").replace(/<[^>]+>/g, " "));
}

function htmlTableToParserLines(value: string) {
  return Array.from(value.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu))
    .map((rowMatch) =>
      Array.from(rowMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/giu))
        .map((cellMatch) => htmlBlockToText(cellMatch[1]))
        .filter(Boolean)
        .join("\t"),
    )
    .filter(Boolean);
}

function htmlInlineToText(value: string) {
  return normalizeWhitespace(stripInlineMarkup(value).replace(/<[^>]+>/g, " "));
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

function normalizeContentLines(lines: string[]) {
  return lines
    .map((line) =>
      line
        .split("\t")
        .map((part) => normalizeWhitespace(stripInlineMarkup(part)))
        .join("\t"),
    )
    .filter(Boolean)
    .join("\n");
}

function normalizeStructuredText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .split("\t")
        .map(normalizeWhitespace)
        .join("\t"),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractQuestionTable(value: string): {
  before: string;
  table?: QuestionTable;
  after: string;
} {
  const delimitedTable = extractDelimitedQuestionTable(value);
  if (delimitedTable.table) {
    return delimitedTable;
  }

  const headerMatch = tableHeaderPattern.exec(value) ?? asciiTableHeaderPattern.exec(value);
  if (!headerMatch?.groups || headerMatch.index === undefined) {
    return { before: value, after: "" };
  }

  const headers = [
    normalizeWhitespace(headerMatch.groups.group),
    normalizeWhitespace(headerMatch.groups.ntfs),
    normalizeWhitespace(headerMatch.groups.share),
  ];
  const before = normalizeStructuredText(value.slice(0, headerMatch.index));
  let remaining = value.slice(headerMatch.index + headerMatch[0].length);
  const rows: string[][] = [];

  while (remaining.trimStart()) {
    const candidate = remaining.trimStart();
    const rowMatch = tableRowPattern.exec(candidate);
    if (!rowMatch?.groups) {
      break;
    }

    rows.push([
      normalizeWhitespace(rowMatch.groups.name),
      normalizeWhitespace(rowMatch.groups.ntfs),
      normalizeWhitespace(rowMatch.groups.share),
    ]);
    remaining = candidate.slice(rowMatch[0].length);
  }

  if (!rows.length) {
    return { before: value, after: "" };
  }

  return {
    before,
    table: { headers, rows },
    after: normalizeStructuredText(remaining),
  };
}

function extractDelimitedQuestionTable(value: string): {
  before: string;
  table?: QuestionTable;
  after: string;
} {
  const lines = value.split("\n");

  for (let startIndex = 0; startIndex < lines.length; startIndex += 1) {
    const headers = splitDelimitedTableRow(lines[startIndex]);
    if (headers.length < 2) {
      continue;
    }

    const rows: string[][] = [];
    let endIndex = startIndex + 1;
    while (endIndex < lines.length) {
      const row = splitDelimitedTableRow(lines[endIndex]);
      if (row.length !== headers.length) {
        break;
      }

      rows.push(row);
      endIndex += 1;
    }

    if (!rows.length) {
      continue;
    }

    return {
      before: normalizeStructuredText(lines.slice(0, startIndex).join("\n")),
      table: { headers, rows },
      after: normalizeStructuredText(lines.slice(endIndex).join("\n")),
    };
  }

  return { before: value, after: "" };
}

function splitDelimitedTableRow(value: string) {
  return value
    .split("\t")
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function extractNumberedStatements(value: string): {
  before: string;
  statements?: string[];
  after: string;
} {
  const markers = Array.from(value.matchAll(numberedStatementPattern)).map((match) => {
    const numberText = match[1];
    const markerOffset = match[0].lastIndexOf(numberText);

    return {
      number: Number(numberText),
      markerStart: (match.index ?? 0) + markerOffset,
      valueStart: (match.index ?? 0) + match[0].length,
    };
  });

  let bestRun: typeof markers = [];
  for (let startIndex = 0; startIndex < markers.length; startIndex += 1) {
    if (markers[startIndex].number !== 1) {
      continue;
    }

    const run = [markers[startIndex]];
    let expectedNumber = 2;
    for (let markerIndex = startIndex + 1; markerIndex < markers.length; markerIndex += 1) {
      if (markers[markerIndex].number !== expectedNumber) {
        break;
      }

      run.push(markers[markerIndex]);
      expectedNumber += 1;
    }

    if (run.length >= 2 && run.length > bestRun.length) {
      bestRun = run;
    }
  }

  if (!bestRun.length) {
    return { before: value, after: "" };
  }

  const statements = bestRun.map((marker, index) => {
    const nextMarker = bestRun[index + 1];
    return normalizeStructuredText(value.slice(marker.valueStart, nextMarker?.markerStart ?? value.length));
  });
  let after = "";
  const lastStatement = statements.at(-1);
  const trailingQuestion = lastStatement?.match(trailingQuestionPattern);

  if (trailingQuestion?.groups) {
    statements[statements.length - 1] = normalizeStructuredText(trailingQuestion.groups.statement);
    after = normalizeStructuredText(trailingQuestion.groups.question);
  }

  return {
    before: normalizeStructuredText(value.slice(0, bestRun[0].markerStart)),
    statements,
    after,
  };
}

function splitContentAndQuestionText(value: string): {
  content: string;
  questionText?: string;
} {
  const normalized = normalizeStructuredText(value);
  const questionEnd = normalized.lastIndexOf("?");
  if (questionEnd < 0) {
    return { content: normalized };
  }

  const sentenceBoundaryPattern = /[.!?]\s+/gu;
  let questionStart = 0;
  for (const match of normalized.slice(0, questionEnd).matchAll(sentenceBoundaryPattern)) {
    questionStart = (match.index ?? 0) + match[0].length;
  }

  return {
    content: normalizeStructuredText(normalized.slice(0, questionStart)),
    questionText: normalizeStructuredText(normalized.slice(questionStart)),
  };
}

function joinStructuredText(...values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim())).join("\n");
}

function compactQuestionContent(content: QuestionContent): QuestionContent {
  return {
    content: content.content,
    ...(content.table ? { table: content.table } : {}),
    ...(content.questionText ? { questionText: content.questionText } : {}),
    ...(content.statements?.length ? { statements: content.statements } : {}),
  };
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

function decodeXmlEntities(value: string) {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}
