import { ReactNode, forwardRef } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  progress: number;
  shouldTrigger: boolean;
}

export const PullToRefreshIndicator = ({
  pullDistance,
  isRefreshing,
  progress,
  shouldTrigger,
}: PullToRefreshIndicatorProps) => {
  if (pullDistance <= 0 && !isRefreshing) return null;

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all duration-200"
      style={{
        height: pullDistance,
        minHeight: isRefreshing ? 60 : 0,
      }}
    >
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full",
          "bg-primary/10 border border-primary/20 backdrop-blur-sm",
          "transition-all duration-300",
          shouldTrigger && !isRefreshing && "bg-primary/20 scale-110",
          isRefreshing && "bg-primary/20"
        )}
      >
        {isRefreshing ? (
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        ) : (
          <ArrowDown
            className={cn(
              "h-5 w-5 text-primary transition-transform duration-200",
              shouldTrigger && "rotate-180"
            )}
            style={{
              opacity: progress / 100,
              transform: `rotate(${shouldTrigger ? 180 : 0}deg)`,
            }}
          />
        )}
      </div>
    </div>
  );
};

interface PullToRefreshContainerProps {
  children: ReactNode;
  className?: string;
}

export const PullToRefreshContainer = forwardRef<
  HTMLDivElement,
  PullToRefreshContainerProps
>(({ children, className }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "h-full overflow-y-auto overscroll-contain",
        className
      )}
    >
      {children}
    </div>
  );
});