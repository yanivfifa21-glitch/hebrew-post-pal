import Lottie from "lottie-react";
import { useEffect, useState } from "react";

interface TelegramEmojiProps {
  animationUrl?: string;
  size?: number;
  className?: string;
}

const DEFAULT_ANIMATION_URL = "https://assets9.lottiefiles.com/packages/lf20_myejioos.json";

export const TelegramEmoji = ({ 
  animationUrl = DEFAULT_ANIMATION_URL, 
  size = 40,
  className = ""
}: TelegramEmojiProps) => {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnimation = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(animationUrl);
        if (!response.ok) throw new Error("Failed to load animation");
        const data = await response.json();
        setAnimationData(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnimation();
  }, [animationUrl]);

  if (isLoading) {
    return (
      <div 
        className={`inline-flex items-center justify-center bg-muted/30 rounded-full animate-pulse ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (error || !animationData) {
    return (
      <div 
        className={`inline-flex items-center justify-center text-muted-foreground ${className}`}
        style={{ width: size, height: size }}
      >
        🎉
      </div>
    );
  }

  return (
    <div 
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <Lottie
        animationData={animationData}
        loop={true}
        autoplay={true}
        style={{ width: size, height: size }}
      />
    </div>
  );
};

export default TelegramEmoji;
