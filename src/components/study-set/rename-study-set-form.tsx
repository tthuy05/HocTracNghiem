"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { updateStudySetTitleAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RenameStudySetForm({ studySetId, currentTitle }: { studySetId: string; currentTitle: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!isEditing) {
    return (
      <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
        <Pencil className="h-4 w-4" />
        Đổi Tên Bộ Đề
      </Button>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await updateStudySetTitleAction(studySetId, formData);
          setIsEditing(false);
        });
      }}
      className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
    >
      <Input name="title" defaultValue={currentTitle} aria-label="Tên bộ đề" className="sm:w-64" />
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          <Check className="h-4 w-4" />
          Lưu
        </Button>
        <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
          <X className="h-4 w-4" />
          Hủy
        </Button>
      </div>
    </form>
  );
}
