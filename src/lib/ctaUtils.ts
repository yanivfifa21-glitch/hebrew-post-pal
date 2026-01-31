// Random CTA text generator for product links
const CTA_OPTIONS = [
  "לרכישה",
  "להזמנה",
  "להזמנה מאליאקספרס"
];

export function getRandomCTA(): string {
  const randomIndex = Math.floor(Math.random() * CTA_OPTIONS.length);
  return CTA_OPTIONS[randomIndex];
}

export function formatProductLink(affiliateLink: string): string {
  const cta = getRandomCTA();
  // Keep the link on its own line for cleaner formatting in Telegram/WhatsApp
  return `👇 ${cta}:\n${affiliateLink}`;
}
