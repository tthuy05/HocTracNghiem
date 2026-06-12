# Học Trắc Nghiệm

Học Trắc Nghiệm is a Next.js app for turning multiple-choice exam outlines into repeatable study sessions. Students import or paste A/B/C/D questions, fix any parser misses, then study in rounds until every question is answered correctly.

## Main Features

- Create, view, rename, and delete study sets.
- Import by pasting text or uploading `.docx`.
- Parse `Câu 1:`, `Câu 1.`, `1.`, and `Question 1:` question formats.
- Parse `A.`, `A)`, and `A -` option formats for A/B/C/D.
- Detect correct answers from `Đáp án: A`, `Answer: B`, `Correct: C`, and `Correct answer: D`.
- Best-effort `.docx` bold/highlight answer detection, with explicit answer-line fallback.
- Preview parsed questions, mark invalid questions, and edit question text/options/correct answers before saving.
- Study in rounds: wrong answers are queued for the next round until mastered.
- Persist study sessions, answer attempts, queues, round number, progress, and reset state in the database.

## Tech Stack

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui-style components
- Prisma ORM 7 with driver adapters
- SQLite for local development
- PostgreSQL for production
- Vitest for unit tests
- Playwright for e2e tests

## Installation

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
```

The default local database URL is:

```env
DATABASE_URL="file:./prisma/sqlite/dev.db"
```

Local SQLite files and `.env` are ignored by Git.

## Local Development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Database Migration Guide

This project keeps separate Prisma schemas and migration folders:

- `prisma/sqlite/schema.prisma` for local SQLite
- `prisma/postgres/schema.prisma` for production PostgreSQL

The active schema is selected from `DATABASE_URL` in `prisma.config.ts` and `scripts/prisma-run.mjs`.

For local development:

```bash
npm run db:migrate -- --name your_migration_name
```

For production after setting a PostgreSQL `DATABASE_URL`:

```bash
npm run db:deploy
```

## Testing

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

If Playwright browsers are not installed yet:

```bash
npx playwright install chromium
```

## Supported Study Outline Formats

```text
Câu 1: Question text
A. Option A
B. Option B
C. Option C
D. Option D
Đáp án: B
```

```text
Question 1: Question text
A) Option A
B) Option B
C) Option C
D) Option D
Correct answer: D
```

```text
1. Question text
A - Option A
B - Option B
C - Option C
D - Option D
Answer: A
```

## Deployment Guide

1. Create a PostgreSQL database using Supabase, Neon, Prisma Postgres, or another cloud provider.
2. In Vercel, add `DATABASE_URL` to Project Settings > Environment Variables.
3. Use the PostgreSQL connection string, for example:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
```

4. Run migrations against the production database:

```bash
npm run db:deploy
```

5. Connect the GitHub repository to Vercel and deploy. GitHub should contain only source code; imported user content, local SQLite data, and original `.docx` files are not stored in the repo.

## Screenshot Placeholders

- `docs/screenshots/home.png`
- `docs/screenshots/create-study-set.png`
- `docs/screenshots/study-session.png`
- `docs/screenshots/completion.png`

## Roadmap

- Improve `.docx` highlighted-answer detection for more Word styling variants.
- Add optional explanations per question.
- Add import/export for study sets.
- Add study history charts.
- Add authentication and shared class libraries.
