import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateStudySetClient } from "@/components/study-set/create-study-set-client";
import { Button } from "@/components/ui/button";

export default function NewStudySetPage() {
  return (
    <main className="min-h-screen">
      <div className="container space-y-7 py-8 sm:py-10">
        <Button asChild variant="ghost">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>

        <header className="rounded-lg border bg-card/85 p-5 shadow-soft">
          <div className="max-w-3xl space-y-2">
            <h1 className="text-2xl font-bold sm:text-3xl">Create New Study Set</h1>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">
              Paste an outline or upload a .docx file, review the detected questions, then save the set.
            </p>
          </div>
        </header>

        <CreateStudySetClient />
      </div>
    </main>
  );
}
