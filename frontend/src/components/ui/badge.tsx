import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-brand-600/20 text-brand-400 border-brand-600/30",
        success: "bg-green-500/20 text-green-400 border-green-500/30",
        warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        destructive: "bg-red-500/20 text-red-400 border-red-500/30",
        muted: "bg-muted text-muted-foreground border-border",
        info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
