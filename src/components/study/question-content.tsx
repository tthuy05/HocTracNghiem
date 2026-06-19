import type { QuestionTable } from "@/lib/parser";

type QuestionContentProps = {
  content: string;
  table?: QuestionTable;
  questionText?: string;
  statements?: string[];
};

export function QuestionContent({
  content,
  table,
  questionText,
  statements,
}: QuestionContentProps) {
  return (
    <div className="question-content">
      {splitParagraphs(content).map((paragraph, index) => (
        <p key={`${index}-${paragraph}`}>{paragraph}</p>
      ))}

      {table ? <QuestionTableView table={table} /> : null}

      {splitParagraphs(questionText ?? "").map((paragraph, index) => (
        <p key={`${index}-${paragraph}`} className="question-prompt">
          {paragraph}
        </p>
      ))}

      {statements?.length ? (
        <ol className="question-statements">
          {statements.map((statement, index) => (
            <li key={`${index}-${statement}`}>{statement}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function QuestionTableView({ table }: { table: QuestionTable }) {
  return (
    <div className="question-table-scroll">
      <table className="question-table">
        <thead>
          <tr>
            {table.headers.map((header, index) => (
              <th key={`${index}-${header}`} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join("-")}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cellIndex}-${cell}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function splitParagraphs(value: string) {
  return value
    .split(/\n+/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
