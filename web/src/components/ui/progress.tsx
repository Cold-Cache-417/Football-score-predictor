import * as React from "react";
import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  value?: number | null;
}) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-pine-800", className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-volt transition-[width] duration-700 ease-out"
        style={{ width: `${(value ?? 0) || 0}%` }}
      />
    </div>
  );
}

export { Progress };
