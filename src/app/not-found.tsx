import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="container flex min-h-screen items-center justify-center py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Không tìm thấy bộ đề</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Bộ đề hoặc phiên học có thể đã bị xóa.
          </p>
          <Button asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Về trang chủ
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
