import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Languages } from "lucide-react";

export type TranslationMode = "standard" | "aiRewrite";

interface TranslationModeSelectorProps {
  mode: TranslationMode;
  onChange: (mode: TranslationMode) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const TranslationModeSelector = ({
  mode,
  onChange,
  disabled = false,
  compact = false,
}: TranslationModeSelectorProps) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange("standard")}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            mode === "standard"
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Languages className="h-3.5 w-3.5" />
          תרגום רגיל
        </button>
        <button
          type="button"
          onClick={() => onChange("aiRewrite")}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            mode === "aiRewrite"
              ? "bg-gradient-to-r from-primary/20 to-secondary/20 text-primary border border-primary/30"
              : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI Rewrite
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">מצב יצירת תוכן</Label>
      <RadioGroup
        value={mode}
        onValueChange={(value) => onChange(value as TranslationMode)}
        disabled={disabled}
        className="grid grid-cols-2 gap-3"
      >
        <label
          htmlFor="mode-standard"
          className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
            mode === "standard"
              ? "border-primary/50 bg-primary/5"
              : "border-border hover:border-primary/30 hover:bg-muted/30"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <RadioGroupItem value="standard" id="mode-standard" className="mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">תרגום רגיל</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              תרגום סטנדרטי של תיאור המוצר לעברית
            </p>
          </div>
        </label>

        <label
          htmlFor="mode-aiRewrite"
          className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
            mode === "aiRewrite"
              ? "border-primary/50 bg-gradient-to-br from-primary/5 to-secondary/5"
              : "border-border hover:border-primary/30 hover:bg-muted/30"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <RadioGroupItem value="aiRewrite" id="mode-aiRewrite" className="mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">AI Rewrite</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              כתיבה מחדש בסגנון טלגרם ישראלי טבעי
            </p>
          </div>
        </label>
      </RadioGroup>
    </div>
  );
};
