import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Settings as SettingsIcon, 
  MessageCircle, 
  Clock, 
  Save, 
  Loader2, 
  Plus, 
  X, 
  Eye, 
  EyeOff,
  Key,
  Bot,
  Sparkles,
  ShoppingBag
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface MaskedInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
}

const MaskedInput = ({ label, value, onChange, placeholder, description }: MaskedInputProps) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="relative">
        <Input
          type={isVisible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
          onClick={() => setIsVisible(!isVisible)}
        >
          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

const Settings = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Channel toggles
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [postingTimes, setPostingTimes] = useState<string[]>(['10:00', '14:00', '20:00']);
  const [newTime, setNewTime] = useState('');

  // AliExpress credentials
  const [aliexpressAppKey, setAliexpressAppKey] = useState('');
  const [aliexpressAppSecret, setAliexpressAppSecret] = useState('');
  const [aliexpressTrackingId, setAliexpressTrackingId] = useState('');

  // Telegram credentials
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');

  // WhatsApp/GreenAPI credentials
  const [greenApiInstanceId, setGreenApiInstanceId] = useState('');
  const [greenApiToken, setGreenApiToken] = useState('');
  const [greenApiChatId, setGreenApiChatId] = useState('');

  // Custom AI prompt
  const [customAiPrompt, setCustomAiPrompt] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      setUserId(user.id);

      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettingsId(data.id);
        setTelegramEnabled(data.telegram_enabled || false);
        setWhatsappEnabled(data.whatsapp_enabled || false);
        setPostingTimes(data.posting_times || ['10:00', '14:00', '20:00']);
        
        // API credentials - empty defaults for privacy
        setAliexpressAppKey(data.aliexpress_app_key || '');
        setAliexpressAppSecret(data.aliexpress_app_secret || '');
        setAliexpressTrackingId(data.aliexpress_tracking_id || '');
        setTelegramBotToken(data.telegram_bot_token || '');
        setTelegramChatId(data.telegram_chat_id || '');
        setGreenApiInstanceId(data.greenapi_instance_id || '');
        setGreenApiToken(data.greenapi_api_token || '');
        setGreenApiChatId(data.greenapi_chat_id || '');
        setCustomAiPrompt(data.custom_ai_prompt || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: "Error",
        description: "Failed to load settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updateData = {
        telegram_enabled: telegramEnabled,
        whatsapp_enabled: whatsappEnabled,
        posting_times: postingTimes,
        aliexpress_app_key: aliexpressAppKey || null,
        aliexpress_app_secret: aliexpressAppSecret || null,
        aliexpress_tracking_id: aliexpressTrackingId || null,
        telegram_bot_token: telegramBotToken || null,
        telegram_chat_id: telegramChatId || null,
        greenapi_instance_id: greenApiInstanceId || null,
        greenapi_api_token: greenApiToken || null,
        greenapi_chat_id: greenApiChatId || null,
        custom_ai_prompt: customAiPrompt || null,
      };

      if (settingsId) {
        const { error } = await supabase
          .from('app_settings')
          .update(updateData)
          .eq('id', settingsId);
        if (error) throw error;
      } else {
        if (!userId) throw new Error("Not authenticated");
        const { data, error } = await supabase
          .from('app_settings')
          .insert({ ...updateData, user_id: userId })
          .select('id')
          .single();
        if (error) throw error;
        setSettingsId(data.id);
      }

      toast({
        title: "Settings Saved!",
        description: "Your preferences have been updated.",
      });
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: "Could not save settings.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addPostingTime = () => {
    if (newTime && !postingTimes.includes(newTime)) {
      setPostingTimes([...postingTimes, newTime].sort());
      setNewTime('');
    }
  };

  const removePostingTime = (time: string) => {
    setPostingTimes(postingTimes.filter(t => t !== time));
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
            <SettingsIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              <span className="gradient-text">Settings</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure your automation preferences and API credentials
            </p>
          </div>
        </div>

        {/* AliExpress API */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-orange-500" />
              AliExpress Affiliate API
            </CardTitle>
            <CardDescription>
              Configure your AliExpress API credentials for generating affiliate links
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MaskedInput
              label="App Key"
              value={aliexpressAppKey}
              onChange={setAliexpressAppKey}
              placeholder="Enter your AliExpress App Key"
            />
            <MaskedInput
              label="App Secret"
              value={aliexpressAppSecret}
              onChange={setAliexpressAppSecret}
              placeholder="Enter your AliExpress App Secret"
            />
            <MaskedInput
              label="Tracking ID"
              value={aliexpressTrackingId}
              onChange={setAliexpressTrackingId}
              placeholder="Enter your Tracking ID"
            />
          </CardContent>
        </Card>

        {/* Telegram */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[#229ED9]/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#229ED9]" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                </svg>
              </div>
              Telegram Bot
            </CardTitle>
            <CardDescription>
              Configure your Telegram bot for posting deals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border">
              <div>
                <p className="font-medium text-foreground">Enable Telegram</p>
                <p className="text-sm text-muted-foreground">Send posts to your Telegram channel</p>
              </div>
              <Switch
                checked={telegramEnabled}
                onCheckedChange={setTelegramEnabled}
              />
            </div>
            <MaskedInput
              label="Bot Token"
              value={telegramBotToken}
              onChange={setTelegramBotToken}
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              description="Get this from @BotFather on Telegram"
            />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Chat ID</Label>
              <p className="text-xs text-muted-foreground">Your channel or group ID (e.g., -1001234567890)</p>
              <Input
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="-1001234567890"
              />
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp/GreenAPI */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[#25D366]/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#25D366]" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              WhatsApp (GreenAPI)
            </CardTitle>
            <CardDescription>
              Configure GreenAPI for WhatsApp messaging
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border">
              <div>
                <p className="font-medium text-foreground">Enable WhatsApp</p>
                <p className="text-sm text-muted-foreground">Send posts via WhatsApp</p>
              </div>
              <Switch
                checked={whatsappEnabled}
                onCheckedChange={setWhatsappEnabled}
              />
            </div>
            <MaskedInput
              label="Instance ID"
              value={greenApiInstanceId}
              onChange={setGreenApiInstanceId}
              placeholder="1234567890"
            />
            <MaskedInput
              label="API Token"
              value={greenApiToken}
              onChange={setGreenApiToken}
              placeholder="your-api-token-here"
            />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Chat ID</Label>
              <p className="text-xs text-muted-foreground">Phone number or group ID</p>
              <Input
                value={greenApiChatId}
                onChange={(e) => setGreenApiChatId(e.target.value)}
                placeholder="972501234567 or 120363..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Custom AI Prompt */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Custom AI Prompt
            </CardTitle>
            <CardDescription>
              Define your own system prompt for generating Hebrew product descriptions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={customAiPrompt}
              onChange={(e) => setCustomAiPrompt(e.target.value)}
              placeholder="Leave empty to use the default prompt. Enter your custom instructions for the AI here..."
              className="min-h-[200px] font-mono text-sm"
              dir="rtl"
            />
            <p className="text-xs text-muted-foreground">
              This prompt will be used as the system message when generating Hebrew descriptions. 
              Leave empty to use the default professional affiliate marketing prompt.
            </p>
          </CardContent>
        </Card>

        {/* Posting Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Posting Schedule
            </CardTitle>
            <CardDescription>
              Define your daily posting windows
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {postingTimes.map((time) => (
                <Badge
                  key={time}
                  variant="outline"
                  className="px-3 py-1.5 text-sm border-primary/30 text-primary"
                >
                  {time}
                  <button
                    onClick={() => removePostingTime(time)}
                    className="ml-2 hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </div>
              <Button onClick={addPostingTime} variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          variant="gradient"
          size="lg"
          className="w-full"
        >
          {isSaving ? (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          ) : (
            <Save className="h-5 w-5 mr-2" />
          )}
          Save All Settings
        </Button>
      </div>
    </MainLayout>
  );
};

export default Settings;
