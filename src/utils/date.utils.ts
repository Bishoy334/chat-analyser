/**
 * Date Parsing Utilities
 */

// ============================================================================
// WHATSAPP DATE PARSING
// ============================================================================

/**
 * WhatsApp message format examples:
 *   "12/31/20, 7:59 PM - Name: message"  (US iOS)
 *   "31/12/20, 19:59 - Name: message"    (AU/EU 24h)
 *   "[12/31/20, 7:59:12 PM] Name: ..."   (newer format)
 *   "[19/3/2025, 8:00:59 pm] Name: ..."  (lowercase am/pm, thin space)
 */
export const DATE_PREFIXES: Array<{ regex: RegExp; kind: "dash" | "bracket" }> = [
    {
        // Brackets + optional seconds + am/pm + trailing " - "
        // \s* allows normal or thin space before am/pm
        regex: /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?\]?\s-\s/,
        kind: "dash"
    },
    {
        // Brackets + optional seconds + am/pm + space (no dash)
        regex: /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?\]?\s/,
        kind: "bracket"
    }
];

/**
 * Parses date components from WhatsApp timestamp format
 * Handles DD/MM vs MM/DD ambiguity and AM/PM conversion
 */
export function parseDateParts(
    dayOrMonth: number,
    monthOrDay: number,
    year: number,
    hour: number,
    minute: number,
    second: number | undefined,
    ampm?: string
): Date {
    // Convert 2-digit years to 4-digit (assumes 2000s)
    const fullYear = year < 100 ? 2000 + year : year;

    // DD/MM vs MM/DD heuristic - default to DD/MM (European format)
    const preferDDMM = true;
    let day: number;
    let month: number;

    if (dayOrMonth > 12) {
        // First number > 12, must be day
        day = dayOrMonth;
        month = monthOrDay - 1; // JavaScript months are 0-indexed
    } else if (monthOrDay > 12 && dayOrMonth <= 12) {
        // Second number > 12, must be day
        day = monthOrDay;
        month = dayOrMonth - 1;
    } else if (preferDDMM) {
        // Ambiguous case, prefer DD/MM
        day = dayOrMonth;
        month = monthOrDay - 1;
    } else {
        // Ambiguous case, use MM/DD
        day = monthOrDay;
        month = dayOrMonth - 1;
    }

    let hour24 = hour;

    // Convert 12-hour format to 24-hour format
    if (ampm) {
        const ampmUpper = ampm.toUpperCase();

        if (ampmUpper === "PM" && hour24 < 12) {
            hour24 += 12;
        }
        if (ampmUpper === "AM" && hour24 === 12) {
            hour24 = 0;
        }
    }

    const seconds = typeof second === "number" ? second : 0;

    return new Date(fullYear, month, day, hour24, minute, seconds, 0);
}