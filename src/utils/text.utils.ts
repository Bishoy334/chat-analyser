/**
 * Text Processing Utilities
 */

import GraphemeSplitter from "grapheme-splitter";
import * as iconv from 'iconv-lite';
import { 
    CONTROL_MARKS_REGEX, 
    EMOJI_REGEX, 
    LATIN_WORD_REGEX, 
    STOPWORDS, 
    EGYPTIAN_ARABIZI_ALLOW,
    SYSTEM_EVENT_PATTERNS
} from './constants';
import type { SystemEvent } from '../types';

// ============================================================================
// TEXT PROCESSING
// ============================================================================

const GRAPHEME_SPLITTER = new GraphemeSplitter();

/**
 * Removes control and direction marks from text that WhatsApp often injects
 */
export function stripControlMarks(text: string): string {
    return text.replace(CONTROL_MARKS_REGEX, "");
}

/**
 * Tokenises text into individual words, removing punctuation and symbols
 */
export function tokeniseWords(text: string, isSystemMessage: boolean = false): string[] {
    const systemWords = new Set([
        'omitted', 'edited', 'deleted', 'removed', 'changed', 'added', 'left', 'joined',
        'created', 'pinned', 'unpinned', 'encrypted', 'end-to-end', 'messages', 'calls',
        'group', 'name', 'icon', 'settings', 'admin', 'admins', 'security', 'code',
        'missed', 'voice', 'video', 'call', 'poll', 'this', 'message', 'was', 'to',
        'the', 'you', 'only', 'people', 'can', 'read', 'listen', 'share', 'them',
        'outside', 'chat', 'not', 'even', 'whatsapp', 'meta', 'ai', 'mention',
        'https', 'http', 'www', 'com', 'org', 'net'
    ]);

    // Lowercase and extract tokens preserving contractions like don't / won't
    const words = (text.toLowerCase().match(/\p{L}+(?:['â€™]\p{L}+)*/gu) || []);

    if (isSystemMessage) {
        return words.filter(word => !systemWords.has(word));
    }

    return words;
}

/**
 * Normalises participant display names by collapsing any run of whitespace
 * characters (including non-breaking/narrow no-break spaces) into a single
 * ASCII space and trimming leading/trailing spaces.
 */
export function normaliseParticipantName(name: string): string {
    // Replace various space-like characters with regular spaces, collapse runs, trim
    return name
        .replace(/[\u00A0\u202F\u2007]/g, ' ') // NBSP, NNBSP, figure space
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Counts the number of emojis in text using proper grapheme splitting
 */
export function countEmojis(text: string): number {
    const clusters = GRAPHEME_SPLITTER.splitGraphemes(text);
    let count = 0;

    for (const cluster of clusters) {
        if (EMOJI_REGEX.test(cluster)) {
        count += 1;
        }
    }

    return count;
}

/**
 * Checks if a message represents a media file notice from WhatsApp
 */
export function getMediaType(text: string): string | null {
    const normalizedText = stripControlMarks(text).trim().toLowerCase();
  
    // Common WhatsApp media notice variants
    if (normalizedText === "image omitted" || normalizedText === "<image omitted>") {
        return "image";
    } else if (normalizedText === "video omitted" || normalizedText === "<video omitted>") {
        return "video";
    } else if (normalizedText === "audio omitted" || normalizedText === "<audio omitted>") {
        return "audio";
    } else if (normalizedText === "sticker omitted" || normalizedText === "<sticker omitted>") {
        return "sticker";
    } else if (normalizedText === "document omitted" || normalizedText === "<document omitted>") {
        return "document";
    } else if (normalizedText === "gif omitted" || normalizedText === "<gif omitted>") {
        return "gif";
    } else if (normalizedText === "<media omitted>" || normalizedText === "media omitted") {
        return "media";
    }
    
    // Check if the text contains media patterns (for cases like "Sender: image omitted")
    if (normalizedText.includes("image omitted")) {
        return "image";
    } else if (normalizedText.includes("video omitted")) {
        return "video";
    } else if (normalizedText.includes("audio omitted")) {
        return "audio";
    } else if (normalizedText.includes("sticker omitted")) {
        return "sticker";
    } else if (normalizedText.includes("document omitted")) {
        return "document";
    } else if (normalizedText.includes("gif omitted")) {
        return "gif";
    } else if (normalizedText.includes("media omitted")) {
        return "media";
    }
    
    return null;
}

export function isMediaNotice(text: string): boolean {
    return getMediaType(text) !== null;
}

/**
 * Classifies a system message into a specific event type
 */
export function classifySystemEvent(text: string): SystemEvent {
    if (SYSTEM_EVENT_PATTERNS.deleted.test(text)) return "deleted";
    if (SYSTEM_EVENT_PATTERNS.missedCall.test(text)) return "missed_call";
    if (SYSTEM_EVENT_PATTERNS.call.test(text)) return "call";
    if (SYSTEM_EVENT_PATTERNS.added.test(text)) return "added";
    if (SYSTEM_EVENT_PATTERNS.left.test(text)) return "left";
    if (SYSTEM_EVENT_PATTERNS.changedSubject.test(text)) return "subject_change";
    if (SYSTEM_EVENT_PATTERNS.changedIcon.test(text)) return "icon_change";
    if (SYSTEM_EVENT_PATTERNS.poll.test(text)) return "poll";
    return "system_other";
}

/**
 * Decodes Instagram's incorrectly encoded Unicode escape sequences
 * Instagram exports UTF-8 bytes as Unicode escape sequences, so we need to:
 * 1. Find sequences of Unicode escapes that form valid UTF-8 characters
 * 2. Convert them back to bytes and decode as UTF-8
 */
export function decodeInstagramUnicode(str: string): string {
    // Find sequences of Unicode escapes that might be UTF-8 encoded characters
    // Look for patterns like \u00f0\u009f\u0098\u00a1 (4-byte UTF-8 sequences)
    return str.replace(/\\u([0-9a-fA-F]{4})(\\u[0-9a-fA-F]{4})*/g, (match) => {
        // Extract all the Unicode codes from this sequence
        const codes = match.match(/\\u([0-9a-fA-F]{4})/g);
        if (!codes) return match;
        
        // Convert to bytes
        const bytes = codes.map(code => parseInt(code.slice(2), 16));
        
        // Try to decode as UTF-8
        try {
        const buffer = Buffer.from(bytes);
        const decoded = iconv.decode(buffer, 'utf8');
        return decoded;
        } catch (error) {
        // If decoding fails, return the original match
        return match;
        }
    });
}