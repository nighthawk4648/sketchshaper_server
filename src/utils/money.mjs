// Money for manual payments: any current ISO 4217 currency, stored as whole minor units (cents, poisha...).

const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

// Fits the Int column with room to spare (e.g. 20,000,000.00 of a 2-decimal currency)
export const MAX_MINOR = 2_000_000_000;

export const isCurrency = (code) => typeof code === "string" && CURRENCIES.has(code);

// How many decimals a currency uses: USD 2, JPY 0, BHD 3
export const fractionDigits = (currency) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;

// "1,250.50" in a 2-decimal currency -> 125050. Throws a message fit to show the admin.
export function toMinorUnits(input, currency) {
  const digits = fractionDigits(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(input ?? "").replace(/[,\s]/g, ""));
  if (!match) throw new Error("Enter the amount as a number, e.g. 1250 or 1250.50.");
  const [, whole, fraction = ""] = match;
  if (fraction.length > digits) {
    throw new Error(digits === 0 ? `${currency} has no decimals.` : `${currency} allows at most ${digits} decimals.`);
  }
  if (whole.replace(/^0+/, "").length > 12) throw new Error("That amount is too large.");
  const minor = Number(whole + fraction.padEnd(digits, "0"));
  if (minor <= 0) throw new Error("The amount must be more than 0.");
  if (minor > MAX_MINOR) throw new Error("That amount is too large.");
  return minor;
}
