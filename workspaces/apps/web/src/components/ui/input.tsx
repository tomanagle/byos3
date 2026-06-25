import * as React from "react";
import { cn } from "@byos3/ui";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-card/60 px-3.5 py-2 text-sm text-foreground shadow-sm transition-colors",
        "placeholder:text-muted-foreground/70 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
