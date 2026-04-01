import { cn } from "@/lib/utils";

const dotColors = {
  running: "bg-green-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  idle: "bg-gray-500",
} as const;

const pingColors = {
  running: "bg-green-400",
  warning: "bg-amber-400",
  error: "bg-red-400",
  idle: "",
} as const;

interface StatusDotProps {
  status: keyof typeof dotColors;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span className={cn("relative flex h-2.5 w-2.5", className)}>
      {status === "running" && (
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            pingColors[status]
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex rounded-full h-2.5 w-2.5",
          dotColors[status]
        )}
      />
    </span>
  );
}
