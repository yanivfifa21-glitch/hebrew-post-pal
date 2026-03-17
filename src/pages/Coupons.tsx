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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Trash2, Plus, Ticket, DollarSign, ArrowRightLeft, Eye, Save, Wand2, Upload } from "lucide-react";
import { 
  detectReferencePrice, findBestCoupon, detectCouponsInText, replaceCouponsWithSlots, parseBulkCoupons,
  type Coupon, type CouponCampaign, type DetectedCouponSlot
} from "@/lib/couponUtils";

interface Campaign {
  id: string;
  name: string;
  is_active: boolean;
  exchange_rate: number;
  coupons: Coupon[];
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

  // Bulk import
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<Coupon[]>([]);

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

  // Bulk import handlers
  const handleBulkParse = () => {
    const parsed = parseBulkCoupons(bulkText);
    setBulkPreview(parsed);
    if (parsed.length === 0) {
      toast({ title: "לא זוהו קופונים", description: "בדוק שהפורמט נכון", variant: "destructive" });
    }
  };

  const handleBulkApply = () => {
    if (bulkPreview.length === 0) return;
    setCoupons(bulkPreview);
    setBulkDialogOpen(false);
    setBulkText("");
    setBulkPreview([]);
    toast({ title: `✅ ${bulkPreview.length} קופונים יובאו בהצלחה` });
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

    const { updatedText, replacedCode, mode } = replaceCouponInText(testText, bestCoupon.code, bestCoupon.code2);
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
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setBulkDialogOpen(true)}>
                    <Upload className="h-4 w-4 ml-1" />
                    ייבוא מהיר
                  </Button>
                  <Button variant="outline" size="sm" onClick={addCoupon}>
                    <Plus className="h-4 w-4 ml-1" />
                    הוסף קופון
                  </Button>
                </div>
              </div>

              {coupons.map((coupon, i) => (
                <div key={i} className="flex items-end gap-2 p-3 rounded-lg border border-border/50 bg-card/50">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">קוד 1 (ראשי)</Label>
                    <Input
                      value={coupon.code}
                      onChange={e => updateCoupon(i, "code", e.target.value.toUpperCase())}
                      placeholder="ILMAR1"
                      className="font-mono"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">קוד 2 (משני)</Label>
                    <Input
                      value={coupon.code2 || ""}
                      onChange={e => updateCoupon(i, "code2", e.target.value.toUpperCase())}
                      placeholder="ILAFF1"
                      className="font-mono"
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs text-muted-foreground">הנחה ($)</Label>
                    <Input
                      type="number"
                      value={coupon.discount_usd || ""}
                      onChange={e => updateCoupon(i, "discount_usd", parseFloat(e.target.value) || 0)}
                      placeholder="10"
                    />
                  </div>
                  <div className="w-24 space-y-1">
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
                  אין קופונים - לחץ "הוסף קופון" או "ייבוא מהיר"
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
                      {previewResult.matchedCoupon.code}
                      {previewResult.matchedCoupon.code2 && ` / ${previewResult.matchedCoupon.code2}`}
                      {` ($${previewResult.matchedCoupon.discount_usd} off)`}
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

        {/* Bulk Import Dialog */}
        <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle>ייבוא מהיר של קופונים</DialogTitle>
              <DialogDescription>
                הדבק את רשימת הקופונים בפורמט חופשי, לדוגמא:
                <br />
                <code className="text-xs bg-muted px-1 rounded">3$ מעל 15$ – ILMAR1 / ILAFF1</code>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={`3$ מעל 15$ – ILMAR1 / ILAFF1\n5$ מעל 30$ – ILMAR2 / ILAFF2\n7$ מעל 49$ – ILMAR3 / ILAFF3`}
                className="min-h-[180px] text-sm font-mono"
                dir="ltr"
              />
              <Button onClick={handleBulkParse} className="w-full" variant="outline">
                <Eye className="h-4 w-4 ml-2" />
                זהה קופונים
              </Button>

              {bulkPreview.length > 0 && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  <Label className="text-sm font-semibold">זוהו {bulkPreview.length} קופונים:</Label>
                  {bulkPreview.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm p-2 rounded border border-border/50 bg-muted/30">
                      <Badge variant="outline" className="font-mono">{c.code}</Badge>
                      {c.code2 && <Badge variant="outline" className="font-mono">{c.code2}</Badge>}
                      <span className="text-muted-foreground">${c.discount_usd} הנחה מעל ${c.min_spend_usd}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setBulkDialogOpen(false)}>ביטול</Button>
              <Button onClick={handleBulkApply} disabled={bulkPreview.length === 0}>
                <Upload className="h-4 w-4 ml-2" />
                החל {bulkPreview.length} קופונים
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default Coupons;
