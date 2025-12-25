import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export const StatsCard = ({ title, value, icon: Icon, trend, className }: StatsCardProps) => {
  return (
    <div className={cn(
      "glass-card card-interactive p-5 group",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
            {trend && (
              <span className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                trend.isPositive 
                  ? "bg-success/15 text-success" 
                  : "bg-destructive/15 text-destructive"
              )}>
                {trend.isPositive ? "+" : "-"}{trend.value}%
              </span>
            )}
          </div>
        </div>
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-glow-sm">
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
      </div>
    </div>
  );
};
