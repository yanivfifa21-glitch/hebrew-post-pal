import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: 
          "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5",
        destructive: 
          "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 hover:bg-destructive/90 hover:shadow-destructive/30",
        outline: 
          "border-2 border-border bg-transparent hover:bg-muted/50 hover:border-primary/50 hover:text-primary",
        secondary: 
          "bg-secondary text-secondary-foreground shadow-lg shadow-secondary/20 hover:bg-secondary/90 hover:shadow-secondary/30 hover:-translate-y-0.5",
        ghost: 
          "hover:bg-muted/50 hover:text-foreground",
        link: 
          "text-primary underline-offset-4 hover:underline",
        gradient: 
          "bg-gradient-to-r from-primary via-secondary to-accent text-primary-foreground shadow-lg hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5 bg-[length:200%_100%] hover:bg-[position:100%_0] transition-all duration-500",
        success: 
          "bg-success text-success-foreground shadow-lg shadow-success/20 hover:bg-success/90 hover:shadow-success/30 hover:-translate-y-0.5",
        "ghost-destructive": 
          "text-destructive hover:bg-destructive/10 hover:text-destructive",
        glass: 
          "bg-card/50 backdrop-blur-lg border border-border/50 hover:bg-card/70 hover:border-primary/30 shadow-lg",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-lg px-4 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        xl: "h-14 rounded-2xl px-10 text-base font-bold",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
