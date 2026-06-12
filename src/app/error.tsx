"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container flex min-h-screen items-center justify-center py-10">
      <Card className="w-full max-w-lg border-red-200">
        <CardHeader>
          <CardTitle>Đã xảy ra lỗi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Ứng dụng chưa thể hoàn tất yêu cầu. Hãy thử lại hoặc quay về màn hình trước.
          </p>
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Thử lại
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
