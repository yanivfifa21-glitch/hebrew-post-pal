// Smart Coupon Manager - Shared Logic

export interface Coupon {
  code: string;
  discount_usd: number;
  min_spend_usd: number;
}

export interface CouponCampaign {
  id: string;
  name: string;
  is_active: boolean;
  exchange_rate: number;
  coupons: Coupon[];
}

// --- PRICE DETECTION LOGIC ---
export function detectReferencePrice(text: string, exchangeRate: number): { priceUsd: number | null; source: string } {
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
export function findBestCoupon(priceUsd: number, coupons: Coupon[]): Coupon | null {
  const eligible = coupons
    .filter(c => priceUsd >= c.min_spend_usd)
    .sort((a, b) => b.discount_usd - a.discount_usd);
  return eligible.length > 0 ? eligible[0] : null;
}

// --- COUPON REPLACEMENT ---
export function replaceCouponInText(text: string, newCode: string): { updatedText: string; replacedCode: string | null; mode: string } {
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
    const oldCode = uniqueCodes[0];
    const updatedText = text.replace(new RegExp(oldCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newCode);
    return { updatedText, replacedCode: oldCode, mode: "קופון יחיד - הוחלף" };
  }

  // Double coupon: replace ONLY the second unique code
  const secondCode = uniqueCodes[1];
  const updatedText = text.replace(new RegExp(secondCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newCode);
  return { updatedText, replacedCode: secondCode, mode: `קופון כפול - הוחלף רק השני (${secondCode})` };
}

// --- APPLY COUPON TO TEXT ---
export function applyCouponToText(
  text: string, 
  coupons: Coupon[], 
  exchangeRate: number
): { updatedText: string; applied: boolean; info: string } {
  if (!text?.trim() || coupons.length === 0) {
    return { updatedText: text, applied: false, info: "אין טקסט או קופונים" };
  }

  const { priceUsd } = detectReferencePrice(text, exchangeRate);
  if (priceUsd === null) {
    return { updatedText: text, applied: false, info: "לא נמצא מחיר בטקסט" };
  }

  const bestCoupon = findBestCoupon(priceUsd, coupons);
  if (!bestCoupon) {
    return { updatedText: text, applied: false, info: `מחיר $${priceUsd} - אין קופון מתאים` };
  }

  const { updatedText, replacedCode, mode } = replaceCouponInText(text, bestCoupon.code);
  if (!replacedCode) {
    return { updatedText: text, applied: false, info: mode };
  }

  return { updatedText, applied: true, info: `${mode} → ${bestCoupon.code}` };
}
