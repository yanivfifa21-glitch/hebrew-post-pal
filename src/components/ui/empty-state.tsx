import { cn } from "@/lib/utils";
import { LucideIcon, Package, Inbox, Search, FileText } from "lucide-react";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  variant?: "default" | "minimal";
}

export const EmptyState = ({
  icon: Icon = Package,
  title,
  description,
  action,
  className,
  variant = "default",
}: EmptyStateProps) => {
  if (variant === "minimal") {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
        <div className="relative">
          <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mb-4">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
        {action && (
          <Button onClick={action.onClick} className="mt-4" variant="outline" size="sm">
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("glass-card p-8 md:p-12", className)}>
      <div className="flex flex-col items-center justify-center text-center max-w-sm mx-auto">
        {/* Animated Icon Container */}
        <div className="relative mb-6">
          {/* Outer glow ring */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/20 to-secondary/20 blur-xl animate-pulse-soft" />
          
          {/* Icon container */}
          <div className="relative h-20 w-20 rounded-3xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center border border-border/50 shadow-lg">
            <Icon className="h-9 w-9 text-muted-foreground animate-float" />
          </div>
          
          {/* Decorative dots */}
          <div className="absolute -top-2 -right-2 h-3 w-3 rounded-full bg-primary/30 animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
          <div className="absolute -bottom-1 -left-3 h-2 w-2 rounded-full bg-secondary/40 animate-pulse-soft" style={{ animationDelay: '0.5s' }} />
        </div>

        <h3 className="text-xl font-bold text-foreground mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
        
        {action && (
          <Button 
            onClick={action.onClick} 
            className="mt-6" 
            variant="gradient"
          >
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
};

// Pre-built empty states for common use cases
export const EmptyQueue = ({ onAdd }: { onAdd?: () => void }) => (
  <EmptyState
    icon={Inbox}
    title="Queue is empty"
    description="Add products to your queue to start automating your affiliate posts."
    action={onAdd ? { label: "Add Product", onClick: onAdd } : undefined}
  />
);

export const EmptyHistory = () => (
  <EmptyState
    icon={FileText}
    title="No history yet"
    description="Products you've sent will appear here. Start by adding and posting your first product!"
  />
);

export const EmptySearch = ({ query }: { query?: string }) => (
  <EmptyState
    icon={Search}
    title="No results found"
    description={query ? `We couldn't find any products matching "${query}".` : "Try adjusting your search or filters."}
    variant="minimal"
  />
);
