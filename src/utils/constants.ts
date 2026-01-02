/**
 * Constants and Configuration Values
 */

import emojiRegex from "emoji-regex";

// ============================================================================
// TIME & ANALYSIS CONFIGURATION
// ============================================================================

// Default configuration values
export const DEFAULT_ENGAGEMENT_GAP_MS = 120_000;        // 2 minutes
export const DEFAULT_SESSION_GAP_MS = 45 * 60 * 1000;    // 45 minutes
export const DEFAULT_ONE_MINUTE_MS = 60_000;             // 1 minute

// Analysis limits
export const MAX_TOP_EMOJIS = 20;
export const MAX_TOP_WORDS = 50;
export const MAX_TOP_WORDS_PER_USER = 30;
export const MIN_WORD_LENGTH = 3;

// ============================================================================
// REGEX PATTERNS
// ============================================================================

export const EMOJI_REGEX = emojiRegex();
export const LINK_REGEX = /https?:\/\/\S+/ig;
export const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;

// Control & direction marks often injected by WhatsApp (e.g., U+200E)
export const CONTROL_MARKS_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export const LATIN_WORD_REGEX = /^[A-Za-z][A-Za-zâ€™'â€™-]*$/;

// ============================================================================
// STOPWORDS & ALLOWED WORDS
// ============================================================================

/**
 * Common stopwords to filter out from word frequency analysis
 * Includes English stopwords and Egyptian Arabizi common words
 */
export const STOPWORDS = new Set<string>([
    // English stopwords
    "the","a","an","and","or","but","if","then","else","so","because",
    "i","you","he","she","it","we","they","me","him","her","them","my","your","our","their",
    "is","am","are","was","were","be","been","being",
    "to","of","in","on","for","with","at","by","from","as","that","this","these","those",
    "not","no","yes","do","does","did","doing","done","can","could","will","would","shall","should",
    "have","has","had","having",
    "what","which","who","whom","whose","when","where","why","how",
]);

/**
 * Egyptian Arabizi words to preserve in analysis (important colloquial terms)
 */
export const EGYPTIAN_ARABIZI_ALLOW = new Set<string>([
    "mabrouk","mabruk","mabrook","alfmabrouk",
    "habibi","habibti","albi","alb",
    "gamed","gamda","gameda","gdn",
    "keteer","kteer","ktir","shwaya","shwya","shwaiya",
    "delwa2ty","delwa2ti","dilwa2ti","delw2ti","delwati",
    "3andak","3andek","3andaha","3ando","3andena","3andi",
    "3aleh","3aleik","3ala",
    "3aref","3arfa","3eib","3omri","3omrak",

    "ya3ni","yaani","ya3ne","bas","aslan","tab","tayeb","tayyeb","tayib","sah","sa7","awy","awi",
    "aywa","aiwa","la2","laa","mashy","mesh","mish","khalas",
    "fe","fi","fih","leh","leeh","lyh",
    "da","dah","dee","di","dy","dol",
    "ana","enta","enty","enti","eh","eih",
    "keda","kida","shokran","shukran","sabah","masa","saba7","masa2",
    "bokra","bukra","naharda","nharda","enaharda","elnaharda",
    "3ashan","ashan","3shan",
]);

// ============================================================================
// SYSTEM EVENT PATTERNS
// ============================================================================

/**
 * Regular expressions for identifying different types of WhatsApp system events
 */
export const SYSTEM_EVENT_PATTERNS = {
    deleted: /this message was deleted/i,
    missedCall: /missed (voice|video) call/i,
    call: /(voice|video) call/i,
    added: /added .* to the group|added .*$/i,
    left: /(left|removed)/i,
    changedSubject: /changed the subject/i,
    changedIcon: /changed this group's icon/i,
    poll: /created a poll/i
};

// ============================================================================
// PLATFORM PRIORITY
// ============================================================================

/**
 * Platform priority for name normalization (higher priority = preferred name format)
 */
export const PLATFORM_PRIORITY = {
    'whatsapp': 1,
    'instagram': 2
};