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

// --- BULK IMPORT PARSER ---
// Parses text like: "3$ מעל 15$ – ILMAR1 / ILAFF1"
export function parseBulkCoupons(text: string): Coupon[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result: Coupon[] = [];

  for (const line of lines) {
    // Extract all dollar amounts from the line
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

    // First amount = discount, second = min spend
    const discount = Math.min(...dollarAmounts);
    const minSpend = Math.max(...dollarAmounts);

    // Extract coupon codes: uppercase alphanumeric, 3+ chars
    // Look after – or - or : for codes
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
  // Step A: Look for USD prices ($XX, $XX.XX)
  const usdMatches = text.match(/\$\s?(\d+(?:[.,]\d{1,2})?)/g);
  if (usdMatches && usdMatches.length > 0) {
    const prices = usdMatches.map(m => parseFloat(m.replace(/\$/g, '').replace(',', '.').trim()));
    const lowest = Math.min(...prices.filter(p => !isNaN(p) && p > 0));
    if (isFinite(lowest)) return { priceUsd: lowest, source: `$ (USD) - $${lowest}` };
  }

  // Step B: Look for ILS prices (₪XX, XX₪, XX ש"ח, XX שח, XX שקל, XX שקלים)
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

// --- COUPON REPLACEMENT (Slot-based) ---
// Strategy:
// 1. First check for explicit markers: COUPON1/COUPON2 or קופון1/קופון2
// 2. Then scan coupon keyword lines for uppercase codes
// Slot 1 = first code, Slot 2 = second code.
export function replaceCouponInText(
  text: string, 
  newCode: string, 
  newCode2?: string
): { updatedText: string; replacedCode: string | null; mode: string } {
  // --- Strategy 1: Explicit markers ---
  const markerSlot1 = /(?:COUPON1|קופון1)/gi;
  const markerSlot2 = /(?:COUPON2|קופון2)/gi;
  if (markerSlot1.test(text)) {
    let updatedText = text.replace(/(?:COUPON1|קופון1)/gi, newCode);
    const replacements = [`קופון1 → ${newCode}`];
    if (markerSlot2.test(text) && newCode2) {
      updatedText = updatedText.replace(/(?:COUPON2|קופון2)/gi, newCode2);
      replacements.push(`קופון2 → ${newCode2}`);
    } else if (markerSlot2.test(updatedText)) {
      updatedText = updatedText.replace(/(?:COUPON2|קופון2)/gi, newCode);
      replacements.push(`קופון2 → ${newCode}`);
    }
    return { updatedText, replacedCode: "COUPON1", mode: `מרקר: ${replacements.join(' | ')}` };
  }

  // --- Strategy 2: Find codes on coupon-keyword lines ---
  const foundCodes: { code: string; index: number }[] = [];
  
  // Coupon keywords (broad match - includes "הנחה" which often appears with codes)
  const couponKeywords = /(?:קופון|קופונים|הקופון|הקופונים|קוד|הקוד|code|coupon|הנחה)/i;
  
  const lines = text.split('\n');
  let charOffset = 0;
  for (const line of lines) {
    if (couponKeywords.test(line)) {
      // Find all uppercase codes (3+ chars starting with letter) on this line
      const codePattern = /\b([A-Za-z][A-Za-z0-9]{2,19})\b/g;
      let match;
      while ((match = codePattern.exec(line)) !== null) {
        const code = match[1].toUpperCase();
        // Skip common Hebrew-adjacent false positives and short generic words
        if (/^(USD|ILS|NIS|CODE|COUPON|HTTP|HTTPS|COM|WWW)$/i.test(code)) continue;
        if (!foundCodes.some(f => f.code === code)) {
          foundCodes.push({ code, index: charOffset + match.index });
        }
      }
    }
    charOffset += line.length + 1;
  }

  // Sort by position in text
  foundCodes.sort((a, b) => a.index - b.index);

  if (foundCodes.length === 0) {
    return { updatedText: text, replacedCode: null, mode: "לא נמצא קוד קופון בטקסט" };
  }

  let updatedText = text;
  const replacements: string[] = [];

  // Slot 1: Replace first code with newCode
  const slot1Code = foundCodes[0].code;
  const slot1Regex = new RegExp(slot1Code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  updatedText = updatedText.replace(slot1Regex, newCode);
  replacements.push(`${slot1Code} → ${newCode}`);

  // Slot 2: Replace second code with newCode2 (or newCode if no code2)
  if (foundCodes.length >= 2) {
    const slot2Code = foundCodes[1].code;
    const slot2Regex = new RegExp(slot2Code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    updatedText = updatedText.replace(slot2Regex, newCode2 || newCode);
    replacements.push(`${slot2Code} → ${newCode2 || newCode}`);
  }

  const mode = foundCodes.length === 1 
    ? `קופון יחיד: ${replacements[0]}` 
    : `קופון כפול: ${replacements.join(' | ')}`;

  return { updatedText, replacedCode: slot1Code, mode };
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

  const { updatedText, replacedCode, mode } = replaceCouponInText(text, bestCoupon.code, bestCoupon.code2);
  if (!replacedCode) {
    return { updatedText: text, applied: false, info: mode };
  }

  return { updatedText, applied: true, info: `${mode}` };
}
