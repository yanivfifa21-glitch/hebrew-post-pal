import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, MessageCircle, Clock, Save, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const Settings = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [postingTimes, setPostingTimes] = useState<string[]>(['10:00', '14:00', '20:00']);
  const [newTime, setNewTime] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettingsId(data.id);
        setTelegramEnabled(data.telegram_enabled);
        setWhatsappEnabled(data.whatsapp_enabled);
        setPostingTimes(data.posting_times || ['10:00', '14:00', '20:00']);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
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
      };

      if (settingsId) {
        const { error } = await supabase
          .from('app_settings')
          .update(updateData)
          .eq('id', settingsId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('app_settings')
          .insert(updateData);
        if (error) throw error;
      }

      toast({
        title: "Settings Saved!",
        description: "Your preferences have been updated.",
      });
    } catch (error) {
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
      <div className="space-y-8 max-w-2xl">
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
              Configure your automation preferences
            </p>
          </div>
        </div>

        {/* Distribution Channels */}
        <div className="glass-card neon-border p-6 space-y-6">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Distribution Channels</h2>
          </div>

          <div className="space-y-4">
            {/* Telegram */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#229ED9]/20 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#229ED9]" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-foreground">Telegram</p>
                  <p className="text-sm text-muted-foreground">Send posts to Telegram Bot</p>
                </div>
              </div>
              <Switch
                checked={telegramEnabled}
                onCheckedChange={setTelegramEnabled}
              />
            </div>

            {/* WhatsApp */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#25D366]/20 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#25D366]" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-foreground">WhatsApp</p>
                  <p className="text-sm text-muted-foreground">Send posts via WhatsApp API</p>
                </div>
              </div>
              <Switch
                checked={whatsappEnabled}
                onCheckedChange={setWhatsappEnabled}
              />
            </div>
          </div>
        </div>

        {/* Posting Schedule */}
        <div className="glass-card neon-border p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Posting Schedule</h2>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Define your daily posting windows. Scheduled products will be sent at these times.
            </p>

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
                <Label htmlFor="newTime" className="sr-only">Add Time</Label>
                <Input
                  id="newTime"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full"
                />
              </div>
              <Button onClick={addPostingTime} variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>

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
          Save Settings
        </Button>
      </div>
    </MainLayout>
  );
};

export default Settings;
