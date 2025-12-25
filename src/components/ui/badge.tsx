import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 backdrop-blur-sm",
  {
    variants: {
      variant: {
        default: 
          "border-primary/30 bg-primary/15 text-primary",
        secondary: 
          "border-secondary/30 bg-secondary/15 text-secondary",
        destructive: 
          "border-destructive/30 bg-destructive/15 text-destructive",
        outline: 
          "border-border bg-transparent text-foreground",
        success: 
          "border-success/30 bg-success/15 text-success",
        warning: 
          "border-warning/30 bg-warning/15 text-warning",
        pending: 
          "border-warning/30 bg-warning/15 text-warning",
        scheduled: 
          "border-primary/30 bg-primary/15 text-primary",
        sent: 
          "border-success/30 bg-success/15 text-success",
        draft: 
          "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
        queued: 
          "border-secondary/30 bg-secondary/15 text-secondary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
