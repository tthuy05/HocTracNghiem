import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="container flex min-h-screen items-center justify-center py-10">
      <div className="flex items-center gap-3 rounded-lg border bg-card px-5 py-4 text-sm font-medium shadow-soft">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Loading study data...
      </div>
    </main>
  );
}
