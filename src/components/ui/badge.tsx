import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "secondary";

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-sky-200 bg-sky-100 text-sky-900",
  success: "border-emerald-200 bg-emerald-100 text-emerald-900",
  warning: "border-amber-200 bg-amber-100 text-amber-900",
  danger: "border-red-200 bg-red-100 text-red-900",
  secondary: "border-slate-200 bg-slate-100 text-slate-700",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
