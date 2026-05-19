// Smart Coupon Manager - Shared Logic

export interface Coupon {
  code: string;       // Primary code (e.g., ILMAR1)
  code2?: string;     // Secondary code (e.g., ILAFF1) - for double coupon stacking
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

export interface DetectedCouponSlot {
  code: string;
  index: number;  // position in text
}

// --- BULK IMPORT PARSER ---
export function parseBulkCoupons(text: string): Coupon[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result: Coupon[] = [];

  for (const line of lines) {
    const dollarAmounts: number[] = [];
    const dollarPattern = /(\d+(?:\.\d+)?)\s*\$/g;
    const dollarPattern2 = /\$\s*(\d+(?:\.\d+)?)/g;
    let m;

    while ((m = dollarPattern.exec(line)) !== null) {
      dollarAmounts.push(parseFloat(m[1]));
    }
    while ((m = dollarPattern2.exec(line)) !== null) {
      const val = parseFloat(m[1]);
      if (!dollarAmounts.includes(val)) dollarAmounts.push(val);
    }

    if (dollarAmounts.length < 2) continue;

    const discount = Math.min(...dollarAmounts);
    const minSpend = Math.max(...dollarAmounts);

    const codesSection = line.replace(/.*[–\-:]\s*/, '');
    const codePattern = /([A-Za-z][A-Za-z0-9]{2,19})/g;
    const codes: string[] = [];
    while ((m = codePattern.exec(codesSection)) !== null) {
      codes.push(m[1].toUpperCase());
    }

    if (codes.length === 0) continue;

    result.push({
      code: codes[0],
      code2: codes[1] || undefined,
      discount_usd: discount,
      min_spend_usd: minSpend,
    });
  }

  return result;
}

// --- PRICE DETECTION LOGIC ---
export function detectReferencePrice(text: string, exchangeRate: number): { priceUsd: number | null; source: string } {
  const usdMatches = text.match(/\$\s?(\d+(?:[.,]\d{1,2})?)/g);
  if (usdMatches && usdMatches.length > 0) {
    const prices = usdMatches.map(m => parseFloat(m.replace(/\$/g, '').replace(',', '.').trim()));
    const lowest = Math.min(...prices.filter(p => !isNaN(p) && p > 0));
    if (isFinite(lowest)) return { priceUsd: lowest, source: `$ (USD) - $${lowest}` };
  }

  const ilsPatterns = [
    /₪\s?(\d+(?:[.,]\d{1,2})?)/g,
    /(\d+(?:[.,]\d{1,2})?)\s?₪/g,
    /(\d+(?:[.,]\d{1,2})?)\s?(?:ש["״]ח|שח|שקל|שקלים)/g,
  ];
  const allIlsPrices: number[] = [];
  for (const pattern of ilsPatterns) {
    const ilsMatches = text.match(pattern);
    if (ilsMatches) {
      for (const match of ilsMatches) {
        const num = parseFloat(match.replace(/[₪ש"״חשקלים]/g, '').replace(',', '.').trim());
        if (!isNaN(num) && num > 0) allIlsPrices.push(num);
      }
    }
  }
  if (allIlsPrices.length > 0) {
    const lowest = Math.min(...allIlsPrices);
    const usdEquiv = parseFloat((lowest / exchangeRate).toFixed(2));
    return { priceUsd: usdEquiv, source: `₪ (ILS) - ₪${lowest} ÷ ${exchangeRate} = $${usdEquiv}` };
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

// --- COUPON DETECTION ---
// Detects coupon codes in text. Returns up to 2 slots.
// Scans lines with coupon-related keywords for Latin alphanumeric codes.
const BLACKLIST = /^(USD|ILS|NIS|CODE|COUPON|HTTP|HTTPS|COM|WWW|OFF|NEW|TOP|APP|HOT|BIG|BUY|GET|VIP|PRO|MAX|SALE|FREE|BEST|SHOP|DEAL|LINK)$/i;

export function detectCouponsInText(text: string): DetectedCouponSlot[] {
  if (!text?.trim()) return [];
  
  const slots: DetectedCouponSlot[] = [];
  const lines = text.split('\n');
  let charOffset = 0;

  // Keywords that indicate a coupon line
  const couponKeywords = /(?:קופון|קופונים|הקופון|קוד|הקוד|code|coupon|הנחה|discount|promo)/i;

  for (const line of lines) {
    if (couponKeywords.test(line)) {
      // Find Latin alphanumeric codes (3+ chars, starts with letter)
      // Use a pattern that doesn't rely on \b for Hebrew compatibility
      const codePattern = /[A-Za-z0-9][A-Za-z0-9_-]{2,24}/g;
      let match;
      while ((match = codePattern.exec(line)) !== null) {
        const code = match[0].toUpperCase();
        if (BLACKLIST.test(code)) continue;
        if (!slots.some(s => s.code === code)) {
          slots.push({ code, index: charOffset + match.index });
        }
      }
    }
    charOffset += line.length + 1;
  }

  // Sort by position, return up to 2
  slots.sort((a, b) => a.index - b.index);
  return slots.slice(0, 2);
}

// --- COUPON REPLACEMENT (Only Slot 2 / affiliate coupon gets replaced) ---
// Coupon 1 = store coupon (NEVER replaced)
// Coupon 2 = affiliate coupon (THIS gets replaced)
// If only 1 coupon detected, it IS the affiliate coupon and gets replaced.
export function replaceCouponsWithSlots(
  text: string,
  detectedSlots: DetectedCouponSlot[],
  newCode: string,
  newCode2?: string
): { updatedText: string; replacements: string[] } {
  if (detectedSlots.length === 0) {
    return { updatedText: text, replacements: [] };
  }

  let updatedText = text;
  const replacements: string[] = [];

  if (detectedSlots.length === 1) {
    // Only one coupon found - this is the affiliate coupon, replace it
    const slot = detectedSlots[0];
    const regex = new RegExp(slot.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    updatedText = updatedText.replace(regex, newCode);
    replacements.push(`${slot.code} → ${newCode}`);
  } else {
    // Two coupons: Slot 1 = store coupon (keep!), Slot 2 = affiliate coupon (replace!)
    const storeCoupon = detectedSlots[0];
    const affiliateCoupon = detectedSlots[1];
    
    // Only replace Slot 2 (affiliate coupon)
    const regex = new RegExp(affiliateCoupon.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    updatedText = updatedText.replace(regex, newCode2 || newCode);
    replacements.push(`${affiliateCoupon.code} → ${newCode2 || newCode}`);
    replacements.push(`${storeCoupon.code} (קופון חנות - לא הוחלף)`);
  }

  return { updatedText, replacements };
}

// --- LEGACY WRAPPER (used by Queue bulk update) ---
export function replaceCouponInText(
  text: string,
  newCode: string,
  newCode2?: string
): { updatedText: string; replacedCode: string | null; mode: string } {
  const detected = detectCouponsInText(text);
  if (detected.length === 0) {
    return { updatedText: text, replacedCode: null, mode: "לא נמצא קוד קופון בטקסט" };
  }

  const { updatedText, replacements } = replaceCouponsWithSlots(text, detected, newCode, newCode2);
  const mode = detected.length === 1
    ? `קופון יחיד: ${replacements[0]}`
    : `קופון כפול: ${replacements.join(' | ')}`;

  return { updatedText, replacedCode: detected[0].code, mode };
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

  const detected = detectCouponsInText(text);
  if (detected.length === 0) {
    return { updatedText: text, applied: false, info: "לא נמצא קוד קופון בטקסט" };
  }

  const { updatedText, replacements } = replaceCouponsWithSlots(text, detected, bestCoupon.code, bestCoupon.code2);
  return { updatedText, applied: true, info: replacements.join(' | ') };
}
