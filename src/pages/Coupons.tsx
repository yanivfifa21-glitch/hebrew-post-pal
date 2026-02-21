import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Trash2, Plus, Ticket, DollarSign, ArrowRightLeft, Eye, Save, Wand2 } from "lucide-react";

interface Coupon {
  code: string;
  discount_usd: number;
  min_spend_usd: number;
}

interface Campaign {
  id: string;
  name: string;
  is_active: boolean;
  exchange_rate: number;
  coupons: Coupon[];
}

// --- PRICE DETECTION LOGIC ---
function detectReferencePrice(text: string, exchangeRate: number): { priceUsd: number | null; source: string } {
  // Step A: Look for USD prices ($XX, $XX.XX)
  const usdMatches = text.match(/\$\s?(\d+(?:[.,]\d{1,2})?)/g);
  if (usdMatches && usdMatches.length > 0) {
    const prices = usdMatches.map(m => parseFloat(m.replace(/\$/g, '').replace(',', '.').trim()));
    const lowest = Math.min(...prices.filter(p => !isNaN(p) && p > 0));
    if (isFinite(lowest)) return { priceUsd: lowest, source: `$ (USD) - $${lowest}` };
  }

  // Step B: Look for ILS prices (₪XX, XX₪)
  const ilsMatches = text.match(/₪\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?₪/g);
  if (ilsMatches && ilsMatches.length > 0) {
    const prices = ilsMatches.map(m => parseFloat(m.replace(/₪/g, '').replace(',', '.').trim()));
    const lowest = Math.min(...prices.filter(p => !isNaN(p) && p > 0));
    if (isFinite(lowest)) {
      const usdEquiv = parseFloat((lowest / exchangeRate).toFixed(2));
      return { priceUsd: usdEquiv, source: `₪ (ILS) - ₪${lowest} ÷ ${exchangeRate} = $${usdEquiv}` };
    }
  }

  return { priceUsd: null, source: "לא נמצא מחיר" };
}

// --- COUPON MATCHING ---
function findBestCoupon(priceUsd: number, coupons: Coupon[]): Coupon | null {
  const eligible = coupons
    .filter(c => priceUsd >= c.min_spend_usd)
    .sort((a, b) => b.discount_usd - a.discount_usd);
  return eligible.length > 0 ? eligible[0] : null;
}

// --- COUPON REPLACEMENT ---
function replaceCouponInText(text: string, newCode: string): { updatedText: string; replacedCode: string | null; mode: string } {
  // Find coupon codes near keywords like קופון, קוד, code, coupon
  const couponPattern = /(?:קופון|קוד|code|coupon|CODE|COUPON)\s*[:：]?\s*([A-Za-z0-9]{3,20})/gi;
  const matches: { fullMatch: string; code: string; index: number }[] = [];
  let match;
  
  while ((match = couponPattern.exec(text)) !== null) {
    matches.push({ fullMatch: match[0], code: match[1], index: match.index });
  }

  // Also find standalone all-caps codes that look like coupons (e.g., ILFEB4)
  const standalonePattern = /\b([A-Z]{2,}[A-Z0-9]{2,})\b/g;
  while ((match = standalonePattern.exec(text)) !== null) {
    const code = match[1];
    // Skip if already found or if it looks like a common word
    if (!matches.some(m => m.code === code) && code.length >= 4 && code.length <= 15) {
      matches.push({ fullMatch: match[0], code: match[1], index: match.index });
    }
  }

  if (matches.length === 0) {
    return { updatedText: text, replacedCode: null, mode: "לא נמצא קוד קופון" };
  }

  // Deduplicate by code
  const uniqueCodes = [...new Set(matches.map(m => m.code))];

  if (uniqueCodes.length === 1) {
    // Single coupon: replace all occurrences
    const oldCode = uniqueCodes[0];
    const updatedText = text.replace(new RegExp(oldCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newCode);
    return { updatedText, replacedCode: oldCode, mode: "קופון יחיד - הוחלף" };
  }

  // Double coupon: replace ONLY the second unique code
  const secondCode = uniqueCodes[1];
  const updatedText = text.replace(new RegExp(secondCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newCode);
  return { updatedText, replacedCode: secondCode, mode: `קופון כפול - הוחלף רק השני (${secondCode})` };
}

const Coupons = () => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [campaignName, setCampaignName] = useState("קמפיין ראשי");
  const [isActive, setIsActive] = useState(true);
  const [exchangeRate, setExchangeRate] = useState(3.19);
  const [coupons, setCoupons] = useState<Coupon[]>([
    { code: "", discount_usd: 0, min_spend_usd: 0 }
  ]);

  // Test area
  const [testText, setTestText] = useState("");
  const [previewResult, setPreviewResult] = useState<{
    original: string;
    updated: string;
    priceInfo: string;
    matchedCoupon: Coupon | null;
    replacementMode: string;
    replacedCode: string | null;
  } | null>(null);

  const fetchCampaign = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data, error } = await supabase
        .from("coupon_campaigns")
        .select("*")
        .eq("user_id", session.session.user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCampaign(data as unknown as Campaign);
        setCampaignName(data.name);
        setIsActive(data.is_active);
        setExchangeRate(Number(data.exchange_rate));
        setCoupons((data.coupons as unknown as Coupon[]) || []);
      }
    } catch (err: any) {
      console.error("Error fetching campaign:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("לא מחובר");

      const validCoupons = coupons.filter(c => c.code.trim() !== "");
      const payload: any = {
        user_id: session.session.user.id,
        name: campaignName,
        is_active: isActive,
        exchange_rate: exchangeRate,
        coupons: validCoupons as unknown as Record<string, unknown>[],
      };

      if (campaign?.id) {
        const { error } = await supabase
          .from("coupon_campaigns")
          .update(payload)
          .eq("id", campaign.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("coupon_campaigns")
          .insert(payload);
        if (error) throw error;
      }

      toast({ title: "✅ נשמר בהצלחה" });
      fetchCampaign();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addCoupon = () => setCoupons(prev => [...prev, { code: "", discount_usd: 0, min_spend_usd: 0 }]);
  const removeCoupon = (i: number) => setCoupons(prev => prev.filter((_, idx) => idx !== i));
  const updateCoupon = (i: number, field: keyof Coupon, val: string | number) => {
    setCoupons(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  };

  const handleTestReplace = () => {
    if (!testText.trim()) return;
    const validCoupons = coupons.filter(c => c.code.trim() !== "");
    const { priceUsd, source } = detectReferencePrice(testText, exchangeRate);

    if (priceUsd === null || validCoupons.length === 0) {
      setPreviewResult({
        original: testText,
        updated: testText,
        priceInfo: source,
        matchedCoupon: null,
        replacementMode: priceUsd === null ? "לא נמצא מחיר בטקסט" : "אין קופונים מוגדרים",
        replacedCode: null,
      });
      return;
    }

    const bestCoupon = findBestCoupon(priceUsd, validCoupons);
    if (!bestCoupon) {
      setPreviewResult({
        original: testText,
        updated: testText,
        priceInfo: source,
        matchedCoupon: null,
        replacementMode: `מחיר $${priceUsd} - אין קופון מתאים (מינימום הזמנה גבוה מדי)`,
        replacedCode: null,
      });
      return;
    }

    const { updatedText, replacedCode, mode } = replaceCouponInText(testText, bestCoupon.code);
    setPreviewResult({
      original: testText,
      updated: updatedText,
      priceInfo: source,
      matchedCoupon: bestCoupon,
      replacementMode: mode,
      replacedCode,
    });
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow-sm">
            <Ticket className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">מנהל קופונים חכם</h1>
            <p className="text-sm text-muted-foreground">הגדר קופונים פעילים והחלף אוטומטית בפוסטים</p>
          </div>
        </div>

        {/* Campaign Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">קמפיין פעיל</CardTitle>
                <CardDescription>הגדר את הקופונים הפעילים ושער המרה</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="campaign-active" className="text-sm">פעיל</Label>
                <Switch id="campaign-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Campaign Name + Exchange Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שם קמפיין</Label>
                <Input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="קמפיין ראשי" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  שער דולר ל-שקל
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={exchangeRate}
                  onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Coupons List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">קופונים</Label>
                <Button variant="outline" size="sm" onClick={addCoupon}>
                  <Plus className="h-4 w-4 ml-1" />
                  הוסף קופון
                </Button>
              </div>

              {coupons.map((coupon, i) => (
                <div key={i} className="flex items-end gap-2 p-3 rounded-lg border border-border/50 bg-card/50">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">קוד קופון</Label>
                    <Input
                      value={coupon.code}
                      onChange={e => updateCoupon(i, "code", e.target.value.toUpperCase())}
                      placeholder="ILFEB4"
                      className="font-mono"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs text-muted-foreground">הנחה ($)</Label>
                    <Input
                      type="number"
                      value={coupon.discount_usd || ""}
                      onChange={e => updateCoupon(i, "discount_usd", parseFloat(e.target.value) || 0)}
                      placeholder="10"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs text-muted-foreground">מינימום ($)</Label>
                    <Input
                      type="number"
                      value={coupon.min_spend_usd || ""}
                      onChange={e => updateCoupon(i, "min_spend_usd", parseFloat(e.target.value) || 0)}
                      placeholder="79"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 flex-shrink-0"
                    onClick={() => removeCoupon(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {coupons.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  אין קופונים - לחץ "הוסף קופון" להתחיל
                </p>
              )}
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Save className="h-4 w-4 ml-2" />
              {saving ? "שומר..." : "שמור קמפיין"}
            </Button>
          </CardContent>
        </Card>

        {/* Test & Preview Area */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              בדיקה והחלפה
            </CardTitle>
            <CardDescription>הדבק טקסט פוסט כדי לבדוק זיהוי מחיר והחלפת קופון</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={testText}
              onChange={e => setTestText(e.target.value)}
              placeholder="הדבק כאן טקסט של פוסט עם מחיר וקופון..."
              className="min-h-[120px] text-sm"
              dir="rtl"
            />
            <Button onClick={handleTestReplace} disabled={!testText.trim()} className="w-full">
              <Eye className="h-4 w-4 ml-2" />
              בדוק והצג תצוגה מקדימה
            </Button>

            {previewResult && (
              <div className="space-y-4 mt-4">
                {/* Detection info */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="gap-1">
                    <DollarSign className="h-3 w-3" />
                    {previewResult.priceInfo}
                  </Badge>
                  {previewResult.matchedCoupon && (
                    <Badge className="gap-1 bg-primary/15 text-primary border-primary/30">
                      <Ticket className="h-3 w-3" />
                      {previewResult.matchedCoupon.code} (${previewResult.matchedCoupon.discount_usd} off)
                    </Badge>
                  )}
                  <Badge variant={previewResult.replacedCode ? "default" : "secondary"} className="gap-1">
                    <ArrowRightLeft className="h-3 w-3" />
                    {previewResult.replacementMode}
                  </Badge>
                </div>

                {/* Side by side preview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-destructive">טקסט מקורי</Label>
                    <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-sm whitespace-pre-wrap min-h-[100px] max-h-[300px] overflow-y-auto">
                      {previewResult.original}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-primary">טקסט מעודכן</Label>
                    <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-sm whitespace-pre-wrap min-h-[100px] max-h-[300px] overflow-y-auto">
                      {previewResult.updated}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Coupons;
