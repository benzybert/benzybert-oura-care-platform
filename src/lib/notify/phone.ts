/**
 * Phone numbers are stored as E.164 ("+972501234567") because that is what text and call providers accept.
 * People type them as they dial them, so a leading 0 is read as an Israeli number unless a country code is given.
 */

const DEFAULT_COUNTRY_CODE = "972";

/** E.164 or null. "050-123-4567" becomes "+972501234567"; "+1 (555) 123-4567" becomes "+15551234567". */
export function normalizePhone(input: unknown, defaultCountryCode: string = DEFAULT_COUNTRY_CODE): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (raw.length < 6 || raw.length > 24) return null;
  if (!/^[+\d][\d\s().-]*$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    // already international
  } else if (raw.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = defaultCountryCode + digits.slice(1);
  } else {
    return null; // ambiguous: ask for the country code
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}

/** "+972501234567" shown as "+972 50 *** 4567" so a list of contacts does not spell out numbers. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length < 8) return "+***";
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} *** ${d.slice(-4)}`;
}
