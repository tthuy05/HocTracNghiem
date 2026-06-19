import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  extractDocxForParsing,
  parseQuestionContent,
  parseQuestionsFromText,
} from "@/lib/parser";

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

  it("splits multiple options that are on the same line", () => {
    const result = parseQuestionsFromText(`
Câu 1: Chọn dịch vụ lưu trữ phù hợp?
A. File Server B. Web Server
C. DNS Server D. DHCP Server
Đáp án: A
`);

    expect(result.totalDetected).toBe(1);
    expect(result.questions[0].options.A).toBe("File Server");
    expect(result.questions[0].options.B).toBe("Web Server");
    expect(result.questions[0].options.C).toBe("DNS Server");
    expect(result.questions[0].options.D).toBe("DHCP Server");
    expect(result.questions[0].correctAnswer).toBe("A");
  });

  it("keeps numbered requirement lines inside a labeled question", () => {
    const result = parseQuestionsFromText(`
Câu 1: Bạn cần cấp quyền nào?
1.Cấp quyền đọc.
2.Cấp quyền sửa.
3.Cấp quyền xóa.
A. 1,2 B. 2,3 C. 1,3 D. 1,2,3
Đáp án: A
`);

    expect(result.totalDetected).toBe(1);
    expect(result.questions[0].content).toContain("1.Cấp quyền đọc.");
    expect(result.questions[0].options.A).toBe("1,2");
    expect(result.questions[0].options.D).toBe("1,2,3");
    expect(result.questions[0].errors).toHaveLength(0);
  });

  it("preserves source line breaks instead of flattening question content", () => {
    const result = parseQuestionsFromText(`
Cau 1: Tinh huong ban dau.
Day la doan mo ta rieng.
1. Menh de thu nhat.
2. Menh de thu hai.
A. Mot B. Hai C. Ba D. Bon
Answer: A
`);

    expect(result.questions[0].content).toBe(
      "Tinh huong ban dau.\nDay la doan mo ta rieng.\n1. Menh de thu nhat.\n2. Menh de thu hai.",
    );
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

  it("splits adjacent unnumbered questions after complete inline options", () => {
    const result = parseQuestionsFromText(`
Câu 1: First question?
**Alpha** B. Beta C. Gamma D. Delta
Second question? One B. Two **C. Three** D. Four
Third question?
A. Red B. Blue C. Green **D. Black**
`);

    expect(result.totalDetected).toBe(3);
    expect(result.questions[0].options.A).toBe("Alpha");
    expect(result.questions[0].correctAnswer).toBe("A");
    expect(result.questions[1].options.A).toBe("One");
    expect(result.questions[1].correctAnswer).toBe("C");
    expect(result.questions[2].correctAnswer).toBe("D");
    expect(result.questions.every((question) => question.errors.length === 0)).toBe(true);
  });

  it("recovers unlabeled DOCX list options around labeled choices", () => {
    const result = parseQuestionsFromText(`
Câu 1: Which option is correct?
First unlabeled option.
Second unlabeled option.
**Third unlabeled option.** D. Fourth labeled option.
`);

    expect(result.questions[0].options.A).toBe("First unlabeled option.");
    expect(result.questions[0].options.B).toBe("Second unlabeled option.");
    expect(result.questions[0].options.C).toBe("Third unlabeled option.");
    expect(result.questions[0].options.D).toBe("Fourth labeled option.");
    expect(result.questions[0].correctAnswer).toBe("C");
    expect(result.questions[0].errors).toHaveLength(0);
  });

  it("detects red DOCX option text as a best-effort correct answer signal", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    );
    zip.folder("_rels")?.file(
      ".rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    );
    zip.folder("word")?.file(
      "document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Cau 1: Pick the red answer</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. Alpha</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>B. Beta</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. Gamma</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. Delta</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const arrayBuffer = Uint8Array.from(buffer).buffer;
    const extracted = await extractDocxForParsing(arrayBuffer);
    const result = parseQuestionsFromText(extracted.text, {
      emphasizedAnswersByOrder: extracted.emphasizedAnswersByOrder,
    });

    expect(extracted.emphasizedAnswersByOrder[0]).toBe("B");
    expect(result.questions[0].correctAnswer).toBe("B");
    expect(result.questions[0].errors).toHaveLength(0);
  });
});

describe("parseQuestionContent", () => {
  it("extracts a flattened permissions table and numbered statements", () => {
    const content = parseQuestionContent(
      "Bạn đang cấu hình thư mục dùng chung. " +
        "Nhóm/Người dùng Quyền bảo mật NTFS Quyền Chia sẻ (Share) " +
        "Sales Read Change Marketing Modify Change R&D Deny Full Control " +
        "Bạn cần làm gì để cấp quyền phù hợp? " +
        "1. Cấp quyền cho Sales. 2. Cấp quyền cho Marketing. 3. Giữ quyền R&D. 4. Cấp quyền cho Admin. 5. Kiểm tra truy cập.",
    );

    expect(content.content).toBe("Bạn đang cấu hình thư mục dùng chung.");
    expect(content.table).toEqual({
      headers: ["Nhóm/Người dùng", "Quyền bảo mật NTFS", "Quyền Chia sẻ (Share)"],
      rows: [
        ["Sales", "Read", "Change"],
        ["Marketing", "Modify", "Change"],
        ["R&D", "Deny", "Full Control"],
      ],
    });
    expect(content.questionText).toBe("Bạn cần làm gì để cấp quyền phù hợp?");
    expect(content.statements).toEqual([
      "Cấp quyền cho Sales.",
      "Cấp quyền cho Marketing.",
      "Giữ quyền R&D.",
      "Cấp quyền cho Admin.",
      "Kiểm tra truy cập.",
    ]);
  });

  it("extracts numbered statements without mistaking IP addresses for list markers", () => {
    const content = parseQuestionContent(
      "Máy chủ có địa chỉ 10.1.1.1. Bạn cần chọn các bước nào? 1.Kiểm tra DNS 2.Kiểm tra TCP/IP 3.Khởi động lại",
    );

    expect(content.content).toBe("Máy chủ có địa chỉ 10.1.1.1.");
    expect(content.questionText).toBe("Bạn cần chọn các bước nào?");
    expect(content.statements).toEqual(["Kiểm tra DNS", "Kiểm tra TCP/IP", "Khởi động lại"]);
  });

  it("supports the compact table header form", () => {
    const content = parseQuestionContent(
      "Tình huống. Nhóm/Người dùng NTFS Chia sẻ Sales Read Change Finance Modify Read",
    );

    expect(content.table?.headers).toEqual(["Nhóm/Người dùng", "NTFS", "Chia sẻ"]);
    expect(content.table?.rows).toEqual([
      ["Sales", "Read", "Change"],
      ["Finance", "Modify", "Read"],
    ]);
  });

  it("supports generic tables preserved from DOCX cell boundaries", () => {
    const content = parseQuestionContent(
      "Dữ liệu khảo sát:\nKhu vực\tMáy chủ\tTrạng thái\nHà Nội\tSRV-01\tOnline\nĐà Nẵng\tSRV-02\tOffline\nMáy chủ nào cần kiểm tra?",
    );

    expect(content.content).toBe("Dữ liệu khảo sát:");
    expect(content.table).toEqual({
      headers: ["Khu vực", "Máy chủ", "Trạng thái"],
      rows: [
        ["Hà Nội", "SRV-01", "Online"],
        ["Đà Nẵng", "SRV-02", "Offline"],
      ],
    });
    expect(content.questionText).toBe("Máy chủ nào cần kiểm tra?");
  });
});
