import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Smile } from "lucide-react";

// Popular emojis that animate on Telegram Premium
const POPULAR_EMOJIS = [
  { emoji: "🔥", label: "Fire" },
  { emoji: "⭐", label: "Star" },
  { emoji: "💎", label: "Diamond" },
  { emoji: "🎁", label: "Gift" },
  { emoji: "❤️", label: "Heart" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "💰", label: "Money" },
  { emoji: "✨", label: "Sparkles" },
  { emoji: "🎉", label: "Party" },
  { emoji: "👑", label: "Crown" },
  { emoji: "💥", label: "Boom" },
  { emoji: "🌟", label: "Glow Star" },
  { emoji: "💫", label: "Dizzy" },
  { emoji: "🤩", label: "Star Eyes" },
  { emoji: "😍", label: "Heart Eyes" },
  { emoji: "🥳", label: "Celebration" },
];

interface PostEmojiPickerProps {
  selectedEmoji: string;
  onSelect: (emoji: string) => void;
}

export const PostEmojiPicker = ({ selectedEmoji, onSelect }: PostEmojiPickerProps) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
  };

  const handleClear = () => {
    onSelect("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {selectedEmoji || <Smile className="h-4 w-4" />}
          <span className="text-xs">אימוג'י לפוסט</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground text-right" dir="rtl">
            בחר אימוג'י שיופיע בתחילת הפוסט
            <br />
            <span className="text-primary">מונפש לחברי Telegram Premium!</span>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {POPULAR_EMOJIS.map(({ emoji, label }) => (
              <button
                key={emoji}
                onClick={() => handleSelect(emoji)}
                className={`text-xl p-2 rounded-lg hover:bg-muted transition-colors ${
                  selectedEmoji === emoji ? "bg-primary/20 ring-2 ring-primary" : ""
                }`}
                title={label}
              >
                {emoji}
              </button>
            ))}
          </div>
          {selectedEmoji && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs text-muted-foreground"
              onClick={handleClear}
            >
              הסר אימוג'י
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
