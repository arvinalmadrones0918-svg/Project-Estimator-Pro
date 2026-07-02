// ── Universal currency formatting ────────────────────────────────────────────
// A single source of truth for how money is displayed everywhere. The active
// currency is driven by the project's Currency field (falling back to the
// company/app base currency). No currency symbol is ever hardcoded.

// Currencies the app formats out of the box. Intl.NumberFormat handles the
// symbol/grouping; this list also powers currency pickers and the fallback.
export const SUPPORTED_CURRENCIES = [
  { code: "PHP", label: "Philippine Peso", symbol: "₱" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "CAD", label: "Canadian Dollar", symbol: "C$" },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$" },
  { code: "MYR", label: "Malaysian Ringgit", symbol: "RM" },
  { code: "THB", label: "Thai Baht", symbol: "฿" },
  { code: "IDR", label: "Indonesian Rupiah", symbol: "Rp" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", label: "Saudi Riyal", symbol: "﷼" },
];
const CURRENCY_SYMBOLS = Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c.code, c.symbol]));

// Module-level active currency: the project's currency sets this so every
// existing `money(x)` call renders in the right currency without threading it
// through hundreds of call sites.
let activeCurrency = "USD";
const currencyListeners = new Set();

export function setActiveCurrency(code) {
  if (!code || typeof code !== "string") return;
  const next = code.toUpperCase();
  if (next === activeCurrency) return;
  activeCurrency = next;
  currencyListeners.forEach((fn) => fn()); // notify subscribers so the UI re-renders
}
export function getActiveCurrency() {
  return activeCurrency;
}
// Subscribe to active-currency changes (used by a top-level React subscription
// so every monetary value re-renders when the project currency changes).
export function subscribeCurrency(listener) {
  currencyListeners.add(listener);
  return () => currencyListeners.delete(listener);
}

// Format a value as currency using Intl.NumberFormat. `currency` overrides the
// active currency when provided (e.g. per-project displays).
export function formatMoney(value, currency = activeCurrency) {
  const num = Number(value) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    // Unknown currency code → symbol-prefixed fallback.
    const symbol = CURRENCY_SYMBOLS[currency] || "";
    return `${symbol}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

// Backwards-compatible shim: `money(x)` is used across the app and now formats
// in the active (project) currency. An explicit currency can still be passed.
export function money(value, currency) {
  return formatMoney(value, currency);
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
