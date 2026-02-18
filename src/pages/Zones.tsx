import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  MapPin,
  Clock,
  Users,
  Edit,
  Power,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MessagingAccount {
  id: string;
  account_type: string;
  account_name: string;
  is_active: boolean;
  telegram_chat_id: string | null;
  whatsapp_chat_id: string | null;
  has_bot_token: boolean;
  has_api_token: boolean;
  has_instance_id: boolean;
}

interface Zone {
  id: string;
  name: string;
  is_active: boolean;
  interval_minutes: number;
  interval_start_time: string;
  interval_end_time: string;
  publishing_days: number[];
  last_posted_at: string | null;
  created_at: string;
}

interface ZoneAccount {
  id: string;
  zone_id: string;
  account_id: string;
}

const DAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export default function Zones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [accounts, setAccounts] = useState<MessagingAccount[]>([]);
  const [zoneAccounts, setZoneAccounts] = useState<ZoneAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedZone, setExpandedZone] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [creating, setCreating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [productCounts, setProductCounts] = useState<Record<string, { scheduled: number; sent: number }>>({});

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    await Promise.all([fetchZones(), fetchAccounts(), fetchZoneAccounts()]);
    setLoading(false);
  };

  const fetchZones = async () => {
    const { data } = await supabase
      .from("zones")
      .select("*")
      .order("created_at", { ascending: true });
    setZones((data as Zone[]) || []);
    // Fetch product counts per zone
    if (data && data.length > 0) {
      const { data: zp } = await supabase
        .from("zone_products")
        .select("zone_id, status");
      const counts: Record<string, { scheduled: number; sent: number }> = {};
      (zp || []).forEach((item: any) => {
        if (!counts[item.zone_id]) counts[item.zone_id] = { scheduled: 0, sent: 0 };
        if (item.status === "Scheduled") counts[item.zone_id].scheduled++;
        else if (item.status === "Sent") counts[item.zone_id].sent++;
      });
      setProductCounts(counts);
    }
  };

  const fetchAccounts = async () => {
    const { data } = await supabase.rpc("get_my_messaging_accounts_safe");
    setAccounts((data as MessagingAccount[]) || []);
  };

  const fetchZoneAccounts = async () => {
    const { data } = await supabase.from("zone_accounts").select("*");
    setZoneAccounts((data as ZoneAccount[]) || []);
  };

  const handleCreateZone = async () => {
    if (!newZoneName.trim() || !userId) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("zones").insert({
        user_id: userId,
        name: newZoneName.trim(),
      });
      if (error) throw error;
      toast({ title: `אזור "${newZoneName}" נוצר` });
      setNewZoneName("");
      setShowCreate(false);
      await fetchZones();
    } catch (e) {
      toast({ title: "שגיאה ביצירת אזור", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteZone = async (zoneId: string, zoneName: string) => {
    if (!confirm(`למחוק את האזור "${zoneName}"? כל שיוכי המוצרים יימחקו.`)) return;
    try {
      const { error } = await supabase.from("zones").delete().eq("id", zoneId);
      if (error) throw error;
      toast({ title: `אזור "${zoneName}" נמחק` });
      await fetchZones();
    } catch {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  const handleToggleActive = async (zone: Zone) => {
    try {
      const { error } = await supabase
        .from("zones")
        .update({ is_active: !zone.is_active })
        .eq("id", zone.id);
      if (error) throw error;
      setZones(prev => prev.map(z => z.id === zone.id ? { ...z, is_active: !z.is_active } : z));
    } catch {
      toast({ title: "שגיאה בעדכון", variant: "destructive" });
    }
  };

  const handleSaveZone = async (zone: Zone) => {
    setSaving(zone.id);
    try {
      const { error } = await supabase
        .from("zones")
        .update({
          name: zone.name,
          interval_minutes: zone.interval_minutes,
          interval_start_time: zone.interval_start_time,
          interval_end_time: zone.interval_end_time,
          publishing_days: zone.publishing_days,
        })
        .eq("id", zone.id);
      if (error) throw error;
      toast({ title: "האזור עודכן" });
    } catch {
      toast({ title: "שגיאה בשמירה", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const updateZoneField = (zoneId: string, field: keyof Zone, value: any) => {
    setZones(prev => prev.map(z => z.id === zoneId ? { ...z, [field]: value } : z));
  };

  const toggleDay = (zoneId: string, day: number) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    const days = zone.publishing_days.includes(day)
      ? zone.publishing_days.filter(d => d !== day)
      : [...zone.publishing_days, day];
    updateZoneField(zoneId, "publishing_days", days);
  };

  const getZoneAccountIds = (zoneId: string) =>
    zoneAccounts.filter(za => za.zone_id === zoneId).map(za => za.account_id);

  const handleToggleAccount = async (zoneId: string, accountId: string) => {
    const existing = zoneAccounts.find(za => za.zone_id === zoneId && za.account_id === accountId);
    try {
      if (existing) {
        await supabase.from("zone_accounts").delete().eq("id", existing.id);
        setZoneAccounts(prev => prev.filter(za => za.id !== existing.id));
      } else {
        const { data, error } = await supabase
          .from("zone_accounts")
          .insert({ zone_id: zoneId, account_id: accountId })
          .select()
          .single();
        if (error) throw error;
        setZoneAccounts(prev => [...prev, data as ZoneAccount]);
      }
    } catch {
      toast({ title: "שגיאה בעדכון חשבון", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-hebrew flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" />
              אזורי פרסום
            </h1>
            <p className="text-sm text-muted-foreground font-hebrew mt-1">
              נהל אזורים עם מחסניות נפרדות, תזמונים שונים וקבוצות יעד ייחודיות
            </p>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="gap-2 font-hebrew">
                <Plus className="h-4 w-4" />
                אזור חדש
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle className="font-hebrew text-right">יצירת אזור חדש</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="font-hebrew">שם האזור</Label>
                  <Input
                    value={newZoneName}
                    onChange={e => setNewZoneName(e.target.value)}
                    placeholder="לדוגמה: קבוצות טלגרם ראשיות"
                    className="text-right font-hebrew mt-1"
                  />
                </div>
                <Button
                  onClick={handleCreateZone}
                  disabled={!newZoneName.trim() || creating}
                  className="w-full font-hebrew"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
                  צור אזור
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Zones List */}
        {zones.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-hebrew text-lg font-semibold mb-2">אין אזורים עדיין</h3>
              <p className="text-muted-foreground font-hebrew mb-4">
                צור אזור ראשון כדי להתחיל לנהל מחסניות פרסום נפרדות
              </p>
              <Button onClick={() => setShowCreate(true)} className="font-hebrew gap-2">
                <Plus className="h-4 w-4" />
                צור אזור ראשון
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {zones.map(zone => {
              const isExpanded = expandedZone === zone.id;
              const assignedAccounts = getZoneAccountIds(zone.id);
              const counts = productCounts[zone.id] || { scheduled: 0, sent: 0 };

              return (
                <Card key={zone.id} className={cn(
                  "transition-all duration-200",
                  !zone.is_active && "opacity-60"
                )}>
                  {/* Zone Header - always visible */}
                  <CardHeader
                    className="cursor-pointer select-none"
                    onClick={() => setExpandedZone(isExpanded ? null : zone.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-3 h-3 rounded-full",
                          zone.is_active ? "bg-green-500 shadow-[0_0_8px_hsl(142,76%,36%/0.5)]" : "bg-muted-foreground/30"
                        )} />
                        <CardTitle className="text-lg font-hebrew">{zone.name}</CardTitle>
                        <Badge variant="outline" className="font-hebrew text-xs">
                          <Clock className="h-3 w-3 ml-1" />
                          כל {zone.interval_minutes} דק׳
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-2 text-xs">
                          <Badge variant="secondary" className="font-hebrew">
                            <Layers className="h-3 w-3 ml-1" />
                            {counts.scheduled} בתור
                          </Badge>
                          <Badge variant="outline" className="font-hebrew text-muted-foreground">
                            {counts.sent} נשלחו
                          </Badge>
                        </div>
                        <Badge variant="outline" className="font-hebrew text-xs">
                          <Users className="h-3 w-3 ml-1" />
                          {assignedAccounts.length} קבוצות
                        </Badge>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </CardHeader>

                  {/* Expanded content */}
                  {isExpanded && (
                    <CardContent className="space-y-6 border-t pt-6">
                      {/* Active Toggle + Name */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={zone.is_active}
                            onCheckedChange={() => handleToggleActive(zone)}
                          />
                          <Label className="font-hebrew">{zone.is_active ? "פעיל" : "מושבת"}</Label>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteZone(zone.id, zone.name)}
                          className="font-hebrew gap-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          מחק
                        </Button>
                      </div>

                      {/* Zone Name */}
                      <div>
                        <Label className="font-hebrew">שם האזור</Label>
                        <Input
                          value={zone.name}
                          onChange={e => updateZoneField(zone.id, "name", e.target.value)}
                          className="text-right font-hebrew mt-1"
                        />
                      </div>

                      {/* Scheduling */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <Label className="font-hebrew">אינטרוול (דקות)</Label>
                          <Input
                            type="number"
                            min={15}
                            step={15}
                            value={zone.interval_minutes}
                            onChange={e => updateZoneField(zone.id, "interval_minutes", parseInt(e.target.value) || 60)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="font-hebrew">שעת התחלה</Label>
                          <Input
                            type="time"
                            value={zone.interval_start_time}
                            onChange={e => updateZoneField(zone.id, "interval_start_time", e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="font-hebrew">שעת סיום</Label>
                          <Input
                            type="time"
                            value={zone.interval_end_time}
                            onChange={e => updateZoneField(zone.id, "interval_end_time", e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      {/* Publishing Days */}
                      <div>
                        <Label className="font-hebrew mb-2 block">ימי פרסום</Label>
                        <div className="flex gap-2 flex-wrap">
                          {DAY_LABELS.map((label, idx) => (
                            <button
                              key={idx}
                              onClick={() => toggleDay(zone.id, idx)}
                              className={cn(
                                "h-9 w-9 rounded-lg text-sm font-medium transition-all",
                                zone.publishing_days.includes(idx)
                                  ? "bg-primary text-primary-foreground shadow-glow-sm"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Target Accounts */}
                      <div>
                        <Label className="font-hebrew mb-2 block">קבוצות יעד</Label>
                        {accounts.length === 0 ? (
                          <p className="text-sm text-muted-foreground font-hebrew">
                            אין חשבונות מוגדרים. הגדר חשבונות בדף ההגדרות.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {accounts.map(acc => {
                              const isAssigned = assignedAccounts.includes(acc.id);
                              return (
                                <label
                                  key={acc.id}
                                  className={cn(
                                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                    isAssigned
                                      ? "border-primary/30 bg-primary/5"
                                      : "border-border hover:border-primary/20"
                                  )}
                                >
                                  <Checkbox
                                    checked={isAssigned}
                                    onCheckedChange={() => handleToggleAccount(zone.id, acc.id)}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium truncate block">{acc.account_name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {acc.account_type === "telegram" ? "📱 Telegram" : "💬 WhatsApp"}
                                    </span>
                                  </div>
                                  {!acc.is_active && (
                                    <Badge variant="outline" className="text-xs text-muted-foreground">לא פעיל</Badge>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Save button */}
                      <Button
                        onClick={() => handleSaveZone(zone)}
                        disabled={saving === zone.id}
                        className="w-full font-hebrew gap-2"
                      >
                        {saving === zone.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        שמור שינויים
                      </Button>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
