import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Sparkles, Plus } from "lucide-react";
import { TelegramEmoji } from "@/components/ui/TelegramEmoji";

// Preset animated emojis (Lottie URLs)
const PRESET_EMOJIS = [
  { name: "celebrate", url: "https://assets9.lottiefiles.com/packages/lf20_myejioos.json" },
  { name: "fire", url: "https://assets10.lottiefiles.com/packages/lf20_5ngs2ksb.json" },
  { name: "star", url: "https://assets5.lottiefiles.com/packages/lf20_yadyxho9.json" },
  { name: "heart", url: "https://assets4.lottiefiles.com/packages/lf20_r19ov7eb.json" },
  { name: "rocket", url: "https://assets9.lottiefiles.com/packages/lf20_qdazl3u6.json" },
];

interface EmojiPickerProps {
  onSelect: (url: string) => void;
  className?: string;
}

export const EmojiPicker = ({ onSelect, className = "" }: EmojiPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState("");

  const handleSelect = (url: string) => {
    onSelect(url);
    setIsOpen(false);
  };

  const handleCustomAdd = () => {
    if (customUrl.trim()) {
      onSelect(customUrl.trim());
      setCustomUrl("");
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={`gap-2 ${className}`}
        >
          <Sparkles className="h-4 w-4" />
          Add Emoji
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Animated Emojis</h4>
          
          {/* Preset Grid */}
          <div className="grid grid-cols-5 gap-2">
            {PRESET_EMOJIS.map((emoji) => (
              <button
                key={emoji.name}
                onClick={() => handleSelect(emoji.url)}
                className="p-2 rounded-lg hover:bg-muted transition-colors border border-transparent hover:border-primary/50"
                title={emoji.name}
              >
                <TelegramEmoji animationUrl={emoji.url} size={32} />
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Custom URL Input */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Custom Lottie URL</label>
            <div className="flex gap-2">
              <Input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://..."
                className="text-xs h-8"
              />
              <Button 
                size="sm" 
                onClick={handleCustomAdd}
                disabled={!customUrl.trim()}
                className="h-8 px-2"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default EmojiPicker;
