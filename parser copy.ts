// ============================================================================
// IMPORTS
// ============================================================================

// Third-party dependencies
import emojiRegex from "emoji-regex";
import GraphemeSplitter from "grapheme-splitter";
import * as iconv from 'iconv-lite';
import * as xml2js from 'xml2js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Represents a single message with metadata (unified for WhatsApp and Instagram)
 */
export type Message = {
    /** When the message was sent */
  timestamp: Date;
    /** Sender name (undefined for system messages) */
    from?: string;
    /** Raw message text, sanitized and stitched into a single line */
    text: string;
    /** Whether this is a system-generated message */
  isSystem: boolean;
    /** Whether this represents a media file (e.g., "<Media omitted>") */
    isMediaNotice: boolean;
    /** Type of media if this is a media message */
    mediaType?: string;
    /** Platform this message came from */
    platform: 'whatsapp' | 'instagram' | 'android_messages';
    /** Instagram-specific data (only present for Instagram messages) */
    instagramData?: {
        /** Reactions on this message */
        reactions?: Array<{
            reaction: string;
            actor: string;
            timestamp: number;
        }>;
        /** Shared content (reels, posts) */
        share?: {
            link: string;
            share_text: string;
            original_content_owner: string;
        };
        /** Photos attached to message */
        photos?: Array<{
            uri: string;
            creation_timestamp: number;
        }>;
        /** Videos attached to message */
        videos?: Array<{
            uri: string;
            creation_timestamp: number;
        }>;
        /** Audio files attached to message */
        audio_files?: Array<{
            uri: string;
            creation_timestamp: number;
        }>;
        /** Call duration in seconds (for call messages) */
        call_duration?: number;
        /** Whether this is a reaction message */
        isReaction?: boolean;
    };
};

/**
 * Complete parsed chat data structure
 */
export type ParsedChat = {
    /** All messages in chronological order */
  messages: Message[];
    /** Set of all participant names */
  participants: Set<string>;
    /** Platform this chat came from */
    platform: 'whatsapp' | 'instagram' | 'android_messages' | 'mixed';
    /** Original chat title/name (for identification) */
    title?: string;
};

/**
 * Configuration options for time-based engagement analysis
 */
export type TimeSpentOptions = {
    /** Maximum gap between messages to count as engagement (default: 2 minutes) */
    gapMs?: number;
    /** Maximum gap between messages to count as same session (default: 45 minutes) */
    sessionGapMs?: number;
    /** Whether to count full gap time or just 1 minute per message hop */
    countFullGap?: boolean;
};

/**
 * Types of system events that can occur in WhatsApp chats
 */
export type SystemEvent =
  | "deleted" | "missed_call" | "call"
  | "added" | "left"
  | "subject_change" | "icon_change"
  | "poll" | "system_other";

/**
 * Comprehensive chat analysis metrics
 */
export type Metrics = {
    /** Overall chat statistics */
  totals: {
    messages: number;
    words: number;
    characters: number;
    emojis: number;
    mediaNotices: number;
    links: number;
  };
    
    /** Most frequently used emojis across the chat */
  topEmojis: Array<{ emoji: string; count: number }>;
    
    /** Most frequently used words across the chat */
  topWords: Array<{ word: string; count: number }>;
    
    /** Per-user statistics and metrics */
  byUser: Record<string, {
    messages: number;
    words: number;
    characters: number;
    emojis: number;
    avgMsgLengthChars: number;
    mediaNotices: number;
    links: number;
    questionRate: number;      // fraction of messages containing '?'
    exclamationRate: number;   // fraction of messages containing '!'
    topWords: Array<{ word: string; count: number }>;
    medianResponseSec?: number;
    avgResponseSec?: number;
    responseCount?: number;
    responseBuckets?: number[]; // counts per bucket
    activityHeatmap?: number[][]; // 7x24 grid (day x hour)
    longestStreak?: number;
    currentStreak?: number;
    topMentions?: Array<{ mention: string; count: number }>;
    mediaCounts?: Record<string, number>; // media type -> count
  }>;
    
    /** Message count by hour of day (24 bins, local time) */
    hourlyHistogram: number[];
    
    /** Message count by day of week (7 bins, 0=Sunday) */
    weekdayHistogram: number[];
    
    /** Total estimated engagement time in milliseconds */
    timeSpentMs: number;
    
    /** Chat sessions with timing and participant data */
  sessions: Array<{
        start: string;              // ISO timestamp
        end: string;                // ISO timestamp
    durationMs: number;
    messages: number;
    participants: string[];
  }>;
    
    /** Count of different system events */
  systemEvents: Record<SystemEvent, number>;
    
    /** Most shared link domains */
  linkDomains: Array<{ domain: string; count: number }>;
    
    /** Number of messages containing Arabic script characters */
    arabicScriptMessages: number;
    
    /** Reply latency statistics between user pairs */
  pairwiseReplyLatency: Array<{
        from: string; 
        to: string;
        medianSec: number; 
        avgSec: number; 
        samples: number;
    }>;
    
    /** Users who initiated the most chat sessions */
  sessionInitiators: Array<{ user: string; sessionsStarted: number }>;
    
    /** Messages with session metadata for chat simulator */
  messages: Array<{
    timestamp: string;
    from?: string;
    text: string;
    isSystem: boolean;
    isMediaNotice: boolean;
    sessionIndex: number;
    platform: 'whatsapp' | 'instagram' | 'android_messages';
  }>;
};

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

// Text processing utilities
const GRAPHEME_SPLITTER = new GraphemeSplitter();
const EMOJI_REGEX = emojiRegex();
const LINK_REGEX = /https?:\/\/\S+/ig;
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;

// Control & direction marks often injected by WhatsApp (e.g., U+200E)
const CONTROL_MARKS_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

// Default configuration values
const DEFAULT_ENGAGEMENT_GAP_MS = 120_000;        // 2 minutes
const DEFAULT_SESSION_GAP_MS = 45 * 60 * 1000;    // 45 minutes
const DEFAULT_ONE_MINUTE_MS = 60_000;             // 1 minute

// Analysis limits
const MAX_TOP_EMOJIS = 20;
const MAX_TOP_WORDS = 50;
const MAX_TOP_WORDS_PER_USER = 30;
const MIN_WORD_LENGTH = 3;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Removes control and direction marks from text that WhatsApp often injects
 */
function stripControlMarks(text: string): string {
    return text.replace(CONTROL_MARKS_REGEX, "");
}

const LATIN_WORD_REGEX = /^[A-Za-z][A-Za-z’'’-]*$/;

/**
 * Common stopwords to filter out from word frequency analysis
 * Includes English stopwords and Egyptian Arabizi common words
 */
const STOPWORDS = new Set<string>([
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
const EGYPTIAN_ARABIZI_ALLOW = new Set<string>([
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

/**
 * Tokenizes text into individual words, removing punctuation and symbols
 */
function tokenizeWords(text: string, isSystemMessage: boolean = false): string[] {
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
  const words = (text.toLowerCase().match(/\p{L}+(?:['’]\p{L}+)*/gu) || []);

  if (isSystemMessage) {
    return words.filter(word => !systemWords.has(word));
  }

  return words;
}

/**
 * Normalizes participant display names by collapsing any run of whitespace
 * characters (including non-breaking/narrow no-break spaces) into a single
 * ASCII space and trimming leading/trailing spaces.
 */
function normalizeParticipantName(name: string): string {
  // Replace various space-like characters with regular spaces, collapse runs, trim
  return name
    .replace(/[\u00A0\u202F\u2007]/g, ' ') // NBSP, NNBSP, figure space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Counts the number of emojis in text using proper grapheme splitting
 */
function countEmojis(text: string): number {
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
function getMediaType(text: string): string | null {
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

function isMediaNotice(text: string): boolean {
    return getMediaType(text) !== null;
}

// ============================================================================
// WHATSAPP PARSER
// ============================================================================

/**
 * WhatsApp message format examples:
 *   "12/31/20, 7:59 PM - Name: message"  (US iOS)
 *   "31/12/20, 19:59 - Name: message"    (AU/EU 24h)
 *   "[12/31/20, 7:59:12 PM] Name: ..."   (newer format)
 *   "[19/3/2025, 8:00:59 pm] Name: ..."  (lowercase am/pm, thin space)
 */
const DATE_PREFIXES: Array<{ regex: RegExp; kind: "dash" | "bracket" }> = [
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
function parseDateParts(
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

/**
 * Parses WhatsApp chat export text into structured message data
 * Handles multiple timestamp formats and message continuations
 */
export function parseWhatsApp(chatText: string): ParsedChat {
    const lines = chatText.split(/\r?\n/);
  const messages: Message[] = [];
    let currentMessage: Message | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();

        // Skip empty lines
    if (!line) {
      continue;
    }

        // Try to match any date prefix variant
        let isNewMessage = false;

        for (const datePattern of DATE_PREFIXES) {
            const match = datePattern.regex.exec(line);

            if (match) {
                isNewMessage = true;

        const [
                    fullMatch, dayOrMonth, monthOrDay, year, hour, minute, second, ampm
                ] = match as unknown as [
          string, string, string, string, string, string, string | undefined, string | undefined
        ];

        const parsedDate = parseDateParts(
                    parseInt(dayOrMonth, 10),
                    parseInt(monthOrDay, 10),
                    parseInt(year, 10),
                    parseInt(hour, 10),
                    parseInt(minute, 10),
                    second ? parseInt(second, 10) : undefined,
                    ampm
                );

                const messageContent = line.slice(fullMatch.length);

                // Parse sender and message text
                const colonIndex = messageContent.indexOf(":");
                let sender: string | undefined;
                let messageText: string;

                if (colonIndex > -1) {
                    // Regular message: "Name: message"
                    sender = normalizeParticipantName(messageContent.slice(0, colonIndex).trim());
                    messageText = messageContent.slice(colonIndex + 1).trim();

                    // Check if this is a system message disguised as a regular message
                    const systemPatterns = [
                        "changed the group name to",
                        "changed this group's icon",
                        "changed the subject",
                        "added .* to the group",
                        "added .*$",
                        "left the group",
                        "removed .* from the group",
                        "created a poll",
                        "this message was deleted",
                        "missed (voice|video) call",
                        "(voice|video) call",
                        "you added .*",
                        "you removed .*",
                        "you left",
                        "you joined",
                        "security code changed",
                        "messages and calls are end-to-end encrypted",
                        "you created group",
                        "only messages that mention",
                        "you changed the settings",
                        "you pinned a message"
                    ];

                    // Also check for the specific pattern: "GroupName: Edition: system message"
                    const hasEditionPattern = /^[^:]+:\s*[^:]+:\s*/.test(messageText);
                    
                    // Check for WhatsApp system message patterns that start with specific phrases
                    const hasWhatsAppSystemPattern = /^(messages and calls are end-to-end encrypted|you created group|you added|you changed|you left|you joined|only messages that mention|you changed the settings|you pinned a message)/i.test(messageText);
                    
                    const isSystemMessage = systemPatterns.some(pattern => {
                        const regex = new RegExp(pattern, 'i');
                        return regex.test(messageText);
                    }) || hasEditionPattern || hasWhatsAppSystemPattern;

                    // Check if this is a media message - if so, keep the sender
                    const mediaType = getMediaType(messageText);
                    const isMediaMessage = mediaType !== null;

                    if (isSystemMessage && !isMediaMessage) {
                        sender = undefined;
                        messageText = messageContent.trim();
                    }
        } else {
                    // System message without colon
                    sender = undefined;
                    messageText = messageContent.trim();
        }

                // Sanitize text for control marks
                messageText = stripControlMarks(messageText);

                // Save previous message if exists
                if (currentMessage) {
                    messages.push(currentMessage);
        }

                // Create new message
                const mediaType = getMediaType(messageText);
                const isMediaMessage = mediaType !== null;
                currentMessage = {
          timestamp: parsedDate,
                    from: sender,
                    text: messageText,
                    isSystem: sender === undefined && !isMediaMessage,
                    isMediaNotice: isMediaNotice(messageText),
                    mediaType: mediaType || undefined,
                    platform: 'whatsapp'
        };

        break;
      }
    }

        if (!isNewMessage) {
            // Check if this line starts with unicode characters that might indicate a system message
            // or if it contains patterns like "image omitted" that should be treated as new messages
            const hasUnicodePrefix = /^[\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(line);
            const hasSystemPattern = /image omitted|this message was deleted|missed (voice|video) call|(voice|video) call/i.test(line);
            
            if (hasUnicodePrefix || hasSystemPattern) {
                // This looks like a system message that should be treated as a new message
                // even though it doesn't start with a date pattern
                
                // First, save the current message if it exists
                if (currentMessage) {
                    messages.push(currentMessage);
                }
                
                // Try to extract timestamp from the line if it contains one
                let timestamp = new Date(); // fallback
                let cleanText = stripControlMarks(line);
                let sender: string | undefined;
                
                // Look for embedded timestamp patterns in the line
                for (const datePattern of DATE_PREFIXES) {
                    const match = datePattern.regex.exec(cleanText);
                    if (match) {
                        const [
                            fullMatch, dayOrMonth, monthOrDay, year, hour, minute, second, ampm
                        ] = match as unknown as [
                            string, string, string, string, string, string, string | undefined, string | undefined
                        ];
                        
                        timestamp = parseDateParts(
                            parseInt(dayOrMonth, 10),
                            parseInt(monthOrDay, 10),
                            parseInt(year, 10),
                            parseInt(hour, 10),
                            parseInt(minute, 10),
                            second ? parseInt(second, 10) : undefined,
                            ampm
                        );
                        
                        // Remove the timestamp from the text
                        cleanText = cleanText.replace(fullMatch, '').trim();
                        break;
                    }
                }
                
                // Check if this is a media message and extract sender if present
                const mediaType = getMediaType(cleanText);
                const isMediaMessage = mediaType !== null;
                
                if (isMediaMessage) {
                    // For media messages, try to extract sender from "Sender: media type"
                    const colonIndex = cleanText.indexOf(":");
                    if (colonIndex > -1) {
                        sender = normalizeParticipantName(cleanText.slice(0, colonIndex).trim());
                        cleanText = cleanText.slice(colonIndex + 1).trim();
                    }
                }
                
                // Create a new message (could be system or media)
                currentMessage = {
                    timestamp: timestamp,
                    from: sender,
                    text: cleanText,
                    isSystem: !isMediaMessage,
                    isMediaNotice: isMediaMessage,
                    mediaType: mediaType || undefined,
                    platform: 'whatsapp'
                };
            } else {
                // Continuation of previous message (multi-line message)
                if (currentMessage) {
                    currentMessage.text += "\n" + stripControlMarks(line);
                }
                // Note: Lines without a current message are ignored (rare edge case)
            }
        }
    }

    // Don't forget the last message
    if (currentMessage) {
        messages.push(currentMessage);
    }

  // Extract unique participants (exclude system messages and detected group names)
  const participants = new Set<string>();
  const potentialGroupNames = new Set<string>();
  
  // First pass: identify potential group names from system messages
  for (const message of messages) {
    if (message.isSystem && message.text) {
      // Look for group name patterns in system messages (support straight and curly quotes)
      const groupNameMatch = message.text.match(/changed the group name to ["“”]([^"“”]+)["“”]/i);
      if (groupNameMatch) {
        potentialGroupNames.add(groupNameMatch[1]);
      }
      
      // If this looks like a system message with a leading "GroupName: ...", add that prefix as a potential group name
      // But only if it's NOT a real person's name (avoid names that appear in regular messages)
      if (/changed the group name to|messages and calls are end-to-end encrypted|you created group|you added|you removed|you left|you joined|you changed the settings|you pinned a message/i.test(message.text)) {
        const prefixBeforeFirstColon = message.text.split(":")[0]?.trim();
        if (prefixBeforeFirstColon) {
          // Only add as group name if it contains common group name indicators
          const hasGroupIndicators = /club|group|edition|chat|team|crew|gang|squad/i.test(prefixBeforeFirstColon);
          if (hasGroupIndicators) {
            potentialGroupNames.add(prefixBeforeFirstColon);
          }
        }
      }
      
    }
  }
  
  // Second pass: collect actual participants
  for (const message of messages) {
    if (message.from && !message.isSystem) {
      const normalized = normalizeParticipantName(message.from);
      if (!potentialGroupNames.has(normalized)) {
        participants.add(normalized);
      }
    }
  }

  return { messages, participants, platform: 'whatsapp' as const };
}

// ============================================================================
// INSTAGRAM PARSER
// ============================================================================

/**
 * Instagram message types from the export format
 */
type InstagramMessage = {
  sender_name: string;
  timestamp_ms: number;
  content?: string;
  photos?: Array<{ uri: string; creation_timestamp: number }>;
  videos?: Array<{ uri: string; creation_timestamp: number }>;
  audio_files?: Array<{ uri: string; creation_timestamp: number }>;
  reactions?: Array<{ reaction: string; actor: string; timestamp: number }>;
  share?: { link: string; share_text: string; original_content_owner: string };
  call_duration?: number;
  is_geoblocked_for_viewer?: boolean;
  is_unsent_image_by_messenger_kid_parent?: boolean;
};

type InstagramExport = {
  participants: Array<{ name: string }>;
  messages: InstagramMessage[];
};

/**
 * Parses Instagram chat export JSON into structured message data
 */

/**
 * Decodes Instagram's incorrectly encoded Unicode escape sequences
 * Instagram exports UTF-8 bytes as Unicode escape sequences, so we need to:
 * 1. Find sequences of Unicode escapes that form valid UTF-8 characters
 * 2. Convert them back to bytes and decode as UTF-8
 */
function decodeInstagramUnicode(str: string): string {
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

export function parseInstagram(chatJson: string, title?: string): ParsedChat {
  // First decode any Unicode escape sequences in the JSON string
  const decodedJson = decodeInstagramUnicode(chatJson);
  const data: InstagramExport = JSON.parse(decodedJson);
  const messages: Message[] = [];
  
  // Extract participants
  const participants = new Set<string>();
  for (const participant of data.participants) {
    participants.add(normalizeParticipantName(participant.name));
  }
  
  // Process messages
  for (const msg of data.messages) {
    const timestamp = new Date(msg.timestamp_ms);
    const sender = normalizeParticipantName(msg.sender_name);
    
    // Determine message type and content
    let text = msg.content || '';
    let isSystem = false;
    let isMediaNotice = false;
    let mediaType: string | undefined;
    let instagramData: Message['instagramData'] = {};
    
    // Handle different message types
    if (msg.photos && msg.photos.length > 0) {
      text = `${sender} sent ${msg.photos.length} photo${msg.photos.length > 1 ? 's' : ''}`;
      isMediaNotice = true;
      mediaType = 'photo';
      instagramData.photos = msg.photos;
    } else if (msg.videos && msg.videos.length > 0) {
      text = `${sender} sent ${msg.videos.length} video${msg.videos.length > 1 ? 's' : ''}`;
      isMediaNotice = true;
      mediaType = 'video';
      instagramData.videos = msg.videos;
    } else if (msg.audio_files && msg.audio_files.length > 0) {
      text = `${sender} sent ${msg.audio_files.length} audio file${msg.audio_files.length > 1 ? 's' : ''}`;
      isMediaNotice = true;
      mediaType = 'audio';
      instagramData.audio_files = msg.audio_files;
    } else if (msg.share) {
      // Shared content (reels, posts)
      text = `${sender} shared: ${msg.share.share_text || 'Instagram content'}`;
      isMediaNotice = true;
      mediaType = 'share';
      instagramData.share = msg.share;
    } else if (msg.call_duration !== undefined) {
      // Call messages
      if (text.includes('started a video chat') || text.includes('started a voice chat')) {
        text = `${sender} started a ${text.includes('video') ? 'video' : 'voice'} chat`;
        isSystem = true;
      } else if (text.includes('Video chat ended') || text.includes('Voice chat ended')) {
        const duration = msg.call_duration;
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        text = `${text} (${minutes}:${seconds.toString().padStart(2, '0')})`;
        isSystem = true;
      }
      instagramData.call_duration = msg.call_duration;
    } else if (text.includes('Reacted') && text.includes('to your message')) {
      // Reaction messages
      isSystem = true;
      instagramData.isReaction = true;
    } else if (!text.trim()) {
      // Empty message, skip
      continue;
    }
    
    // Handle reactions on messages
    if (msg.reactions && msg.reactions.length > 0) {
      instagramData.reactions = msg.reactions;
    }
    
    // Create message object
    const message: Message = {
      timestamp,
      from: isSystem ? undefined : sender,
      text: stripControlMarks(text),
      isSystem,
      isMediaNotice,
      mediaType,
      platform: 'instagram',
      instagramData: Object.keys(instagramData).length > 0 ? instagramData : undefined
    };
    
    messages.push(message);
  }
  
  // Sort messages by timestamp (Instagram exports should already be sorted, but just in case)
  messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  return { 
    messages, 
    participants, 
    platform: 'instagram' as const,
    title
  };
}

// ============================================================================
// ANDROID MESSAGES PARSER
// ============================================================================

/**
 * Android Messages XML SMS message structure
 */
type AndroidSMS = {
  protocol: string;
  address: string;
  date: string;
  type: string;
  subject?: string;
  body: string;
  toa?: string;
  sc_toa?: string;
  service_center?: string;
  read: string;
  status: string;
  locked: string;
  date_sent: string;
  sub_id: string;
  readable_date: string;
  contact_name: string;
};

/**
 * Android Messages XML MMS message structure
 */
type AndroidMMS = {
  date: string;
  rr?: string;
  sub?: string;
  ct_t?: string;
  read_status?: string;
  seen: string;
  msg_box: string;
  address: string;
  sub_cs?: string;
  resp_st?: string;
  retr_st?: string;
  d_tm?: string;
  text_only: string;
  exp?: string;
  locked: string;
  m_id?: string;
  st?: string;
  retr_txt_cs?: string;
  retr_txt?: string;
  creator: string;
  date_sent: string;
  read: string;
  m_size?: string;
  rpt_a?: string;
  ct_cls?: string;
  pri?: string;
  sub_id: string;
  tr_id?: string;
  resp_txt?: string;
  ct_l?: string;
  m_cls?: string;
  d_rpt?: string;
  v?: string;
  _id: string;
  m_type: string;
  readable_date: string;
  contact_name: string;
  parts?: {
    part: Array<{
      seq: string;
      ct: string;
      name?: string;
      chset: string;
      cd?: string;
      fn?: string;
      cid?: string;
      cl?: string;
      ctt_s?: string;
      ctt_t?: string;
      text?: string;
      sub_id: string;
    }>;
  };
  addrs?: {
    addr: Array<{
      address: string;
      type: string;
      charset: string;
    }>;
  };
};

/**
 * Processes a single SMS message
 */
function processSMSMessage(sms: AndroidSMS): Message | null {
  // Parse timestamp (Android uses milliseconds since epoch)
  const timestamp = new Date(parseInt(sms.date, 10));
  
  // Determine sender based on message type
  // type="1" = received (incoming from contact), type="2" = sent (outgoing from phone owner)
  let sender: string | undefined;
  if (sms.type === '1') {
    // Received message - sender is the contact
    sender = sms.contact_name ? normalizeParticipantName(sms.contact_name) : undefined;
  } else if (sms.type === '2') {
    // Sent message - sender is unknown (phone owner), will be resolved during name normalization
    sender = undefined; // Let the CLI handle name normalization
  }
  
  // Clean up message body
  let messageText = sms.body || '';
  
  // Decode HTML entities (like &#128557; for emojis)
  messageText = messageText.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });
  
  // Check if this is a media message
  const mediaType = getMediaType(messageText);
  const isMediaMessage = mediaType !== null;
  
  return {
    timestamp,
    from: sender,
    text: stripControlMarks(messageText),
    isSystem: false,
    isMediaNotice: isMediaMessage,
    mediaType: mediaType || undefined,
    platform: 'android_messages'
  };
}

/**
 * Processes a single MMS message
 */
function processMMSMessage(mms: AndroidMMS): Message | null {
  // Parse timestamp (Android uses milliseconds since epoch)
  const timestamp = new Date(parseInt(mms.date, 10));
  
  // Determine sender based on message box
  // msg_box="1" = received (incoming from contact), msg_box="2" = sent (outgoing from phone owner)
  let sender: string | undefined;
  if (mms.msg_box === '1') {
    // Received message - sender is the contact
    sender = mms.contact_name ? normalizeParticipantName(mms.contact_name) : undefined;
  } else if (mms.msg_box === '2') {
    // Sent message - sender is unknown (phone owner), will be resolved during name normalization
    sender = undefined; // Let the CLI handle name normalization
  }
  
  // Extract text content from parts
  let messageText = '';
  if (mms.parts && mms.parts.part) {
    const parts = Array.isArray(mms.parts.part) ? mms.parts.part : [mms.parts.part];
    
    for (const part of parts) {
      if (part.ct === 'text/plain' && part.text) {
        let partText = part.text;
        
        // Handle different character sets
        const charset = parseInt(part.chset, 10);
        if (charset === 106) {
          // UTF-8 encoding - decode HTML entities
          partText = partText.replace(/&#(\d+);/g, (match, dec) => {
            return String.fromCharCode(parseInt(dec, 10));
          });
        } else if (charset === 3) {
          // ISO-8859-1 encoding - might need special handling
          // For now, treat as regular text
        }
        
        messageText += partText;
      }
    }
  }
  
  // If no text content found, check if it's a media-only message
  if (!messageText.trim()) {
    if (mms.parts && mms.parts.part) {
      const parts = Array.isArray(mms.parts.part) ? mms.parts.part : [mms.parts.part];
      const mediaParts = parts.filter(part => part.ct && part.ct !== 'text/plain');
      
      if (mediaParts.length > 0) {
        // This is a media message
        const mediaTypes = mediaParts.map(part => {
          if (part.ct?.includes('image')) return 'image';
          if (part.ct?.includes('video')) return 'video';
          if (part.ct?.includes('audio')) return 'audio';
          return 'media';
        });
        
        messageText = `${sender || 'Unknown'} sent ${mediaTypes.join(', ')}`;
        
        return {
          timestamp,
          from: sender,
          text: messageText,
          isSystem: false,
          isMediaNotice: true,
          mediaType: mediaTypes[0],
          platform: 'android_messages'
        };
      }
    }
    
    // If we still have no content, skip this message
    return null;
  }
  
  // Check if this is a media message
  const mediaType = getMediaType(messageText);
  const isMediaMessage = mediaType !== null;
  
  return {
    timestamp,
    from: sender,
    text: stripControlMarks(messageText),
    isSystem: false,
    isMediaNotice: isMediaMessage,
    mediaType: mediaType || undefined,
    platform: 'android_messages'
  };
}

/**
 * Parses Android Messages XML export into structured message data
 */
export async function parseAndroidMessages(xmlContent: string, title?: string): Promise<ParsedChat> {
  const messages: Message[] = [];
  const participants = new Set<string>();
  
  // Parse XML content using xml2js
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true
  });
  
  const result = await parser.parseStringPromise(xmlContent);
  
  // Check if we have the expected structure
  if (!result.smses) {
    throw new Error('Invalid Android Messages XML format: missing smses element');
  }
  
  // Process SMS messages
  if (result.smses.sms) {
    const smsArray = Array.isArray(result.smses.sms) ? result.smses.sms : [result.smses.sms];
    
    for (const sms of smsArray) {
      const message = processSMSMessage(sms);
      if (message) {
        messages.push(message);
        // Only add named participants (contacts), not undefined senders (phone owner)
        if (message.from) {
          participants.add(message.from);
        }
      }
    }
  }
  
  // Process MMS messages
  if (result.smses.mms) {
    const mmsArray = Array.isArray(result.smses.mms) ? result.smses.mms : [result.smses.mms];
    
    for (const mms of mmsArray) {
      const message = processMMSMessage(mms);
      if (message) {
        messages.push(message);
        // Only add named participants (contacts), not undefined senders (phone owner)
        if (message.from) {
          participants.add(message.from);
        }
      }
    }
  }
  
  // Sort messages by timestamp
  messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  return {
    messages,
    participants,
    platform: 'android_messages' as const,
    title
  };
}

// ============================================================================
// CHAT MERGING UTILITIES
// ============================================================================

/**
 * Merges multiple ParsedChat objects into a single unified chat
 * Combines messages from different platforms and participants
 */
export function mergeChats(chats: ParsedChat[]): ParsedChat {
  if (chats.length === 0) {
    return { messages: [], participants: new Set(), platform: 'mixed' };
  }
  
  if (chats.length === 1) {
    return chats[0];
  }
  
  // Combine all messages
  const allMessages: Message[] = [];
  for (const chat of chats) {
    allMessages.push(...chat.messages);
  }
  
  // Sort by timestamp
  allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  // Combine all participants
  const allParticipants = new Set<string>();
  for (const chat of chats) {
    for (const participant of chat.participants) {
      allParticipants.add(participant);
    }
  }
  
  // Determine platform
  const platforms = new Set(chats.map(chat => chat.platform));
  const platform: 'whatsapp' | 'instagram' | 'mixed' = 
    platforms.size === 1 ? platforms.values().next().value : 'mixed';
  
  // Generate title from chat titles
  const titles = chats.map(chat => chat.title).filter(Boolean);
  const title = titles.length > 0 ? titles.join(' + ') : undefined;
  
  return {
    messages: allMessages,
    participants: allParticipants,
    platform,
    title
  };
}

/**
 * Finds chats that likely belong to the same conversation
 * based on participant name matching
 */
export function findRelatedChats(chats: ParsedChat[]): Array<{ key: string; chats: ParsedChat[] }> {
  const groups = new Map<string, ParsedChat[]>();
  
  for (const chat of chats) {
    // Create a normalized key based on participant names AND platform
    const normalizedParticipants = Array.from(chat.participants)
      .map(name => normalizeParticipantName(name).toLowerCase())
      .sort()
      .join('|');
    
    // Include platform in the key to keep different platforms separate
    const key = `${chat.platform}:${normalizedParticipants}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(chat);
  }
  
  return Array.from(groups.entries()).map(([key, chats]) => ({ key, chats }));
}

// ============================================================================
// SYSTEM EVENT CLASSIFICATION
// ============================================================================

/**
 * Regular expressions for identifying different types of WhatsApp system events
 */
const SYSTEM_EVENT_PATTERNS = {
  deleted: /this message was deleted/i,
  missedCall: /missed (voice|video) call/i,
  call: /(voice|video) call/i,
  added: /added .* to the group|added .*$/i,
  left: /(left|removed)/i,
  changedSubject: /changed the subject/i,
  changedIcon: /changed this group's icon/i,
  poll: /created a poll/i
};

/**
 * Classifies a system message into a specific event type
 */
function classifySystemEvent(text: string): SystemEvent {
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

// ============================================================================
// METRICS COMPUTATION
// ============================================================================

/**
 * Computes comprehensive chat analysis metrics
 * Fast implementation without spell checking for performance
 */
export async function computeMetrics(
    parsedChat: ParsedChat,
    options: TimeSpentOptions = {},
    platform?: string
): Promise<Metrics> {
    // WhatsApp exports are chronologically sorted; keep as-is for speed
    const messages = parsedChat.messages;

    const engagementGapMs = options.gapMs ?? DEFAULT_ENGAGEMENT_GAP_MS;
    const sessionGapMs = options.sessionGapMs ?? DEFAULT_SESSION_GAP_MS;
    const countFullGap = options.countFullGap ?? true;

  const totals = {
    messages: 0,
    words: 0,
    characters: 0,
    emojis: 0,
    mediaNotices: 0,
    links: 0
  };

  const byUser: Metrics["byUser"] = {};
  const emojiCounts = new Map<string, number>();
  const wordCounts = new Map<string, number>();
  const hourly = Array(24).fill(0);
  const weekday = Array(7).fill(0);

  const systemEvents: Record<SystemEvent, number> = {
    deleted: 0, missed_call: 0, call: 0,
    added: 0, left: 0, subject_change: 0, icon_change: 0, poll: 0,
    system_other: 0
  };

  const domainCounts = new Map<string, number>();
  const normalizedParticipants = new Set<string>(Array.from(parsedChat.participants).map(normalizeParticipantName));

  // Pairwise reply latency: A -> B
  const lastByUser = new Map<string, Date>();
  const pairLatencies = new Map<string, number[]>(); // "A|B" => seconds[]
  const responseSamplesByUser = new Map<string, number[]>(); // user => seconds[] (response time when they reply)

  let arabicScriptMsgs = 0;
  let timeSpentMs = 0;

  // Sessions
  type Session = { start: Date; end: Date; count: number; participants: Set<string>; initiator?: string; platform?: string };
  const sessions: Session[] = [];
  let curSession: Session | null = null;
  
  // Message data for chat simulator
  const messageData: Array<{
    timestamp: string;
    from?: string;
    text: string;
    isSystem: boolean;
    isMediaNotice: boolean;
    sessionIndex: number;
    platform: 'whatsapp' | 'instagram' | 'android_messages';
  }> = [];

  // Per-user word counts
  const perUserWords = new Map<string, Map<string, number>>();
  const perUserMentions = new Map<string, Map<string, number>>();
  const perUserMediaCounts = new Map<string, Map<string, number>>();
  
  // Per-user activity tracking
  const perUserActivity = new Map<string, number[][]>(); // 7x24 grid
  const perUserDailyActivity = new Map<string, Set<string>>(); // user -> Set of "YYYY-MM-DD"

  let prev: Message | null = null;

  for (const m of messages) {
    totals.messages += 1;

    // Mentions: extract from RAW text before stripping control marks,
    // then remove the spans and finally strip control marks for analysis.
    let visibleText: string;
    const mentionsFound: string[] = [];
    if (m.isMediaNotice) {
      visibleText = "";
    } else {
      const rawText = m.text;
      
      // Extract unicode mentions: @⁨Name⁩
      const unicodeMentionRegex = /\u2068([\s\S]*?)\u2069/g;
      let mm: RegExpExecArray | null;
      while ((mm = unicodeMentionRegex.exec(rawText)) !== null) {
        const norm = normalizeParticipantName(mm[1]);
        if (normalizedParticipants.has(norm)) mentionsFound.push(norm);
      }
      
      // Extract @mentions: @Name (where Name matches a participant)
      const atMentionRegex = /@([A-Za-z\u00C0-\u017F\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u200E\u200F\u202A-\u202E\u2066-\u2069\s]+)/g;
      let am: RegExpExecArray | null;
      while ((am = atMentionRegex.exec(rawText)) !== null) {
        const mentionText = am[1].trim();
        const norm = normalizeParticipantName(mentionText);
        if (normalizedParticipants.has(norm)) {
          mentionsFound.push(norm);
        }
      }
      
      // Remove both types of mentions from text
      let textWithoutMentionsRaw = rawText.replace(unicodeMentionRegex, "");
      textWithoutMentionsRaw = textWithoutMentionsRaw.replace(atMentionRegex, "");
      visibleText = stripControlMarks(textWithoutMentionsRaw);
    }

    // characters: count only visible content (not literal "image omitted")
    totals.characters += visibleText.length;

    if (m.isMediaNotice) {
      totals.mediaNotices += 1;
    }

    const emojiCount = countEmojis(visibleText);
    totals.emojis += emojiCount;

    const links = visibleText.match(LINK_REGEX) || [];
    totals.links += links.length;

    const hour = m.timestamp.getHours();
    hourly[hour] += 1;

    const day = m.timestamp.getDay();
    weekday[day] += 1;

        if (ARABIC_CHAR_REGEX.test(visibleText)) {
      arabicScriptMsgs += 1;
    }

    // Sessions by gap
    if (!curSession) {
      curSession = { start: m.timestamp, end: m.timestamp, count: 1, participants: new Set(m.from ? [m.from] : []), platform };
      curSession.initiator = m.from;
      sessions.push(curSession);
    } else {
      const deltaSinceSessionEnd = m.timestamp.getTime() - curSession.end.getTime();

            if (deltaSinceSessionEnd <= sessionGapMs) {
        curSession.end = m.timestamp;
        curSession.count += 1;
        if (m.from) curSession.participants.add(m.from);
      } else {
        curSession = { start: m.timestamp, end: m.timestamp, count: 1, participants: new Set(m.from ? [m.from] : []), platform };
        curSession.initiator = m.from;
        sessions.push(curSession);
      }
    }
    
    // Store message data for chat simulator
    const currentSessionIndex = sessions.length - 1;
    messageData.push({
      timestamp: m.timestamp.toISOString(),
      from: m.from,
      text: m.text,
      isSystem: m.isSystem,
      isMediaNotice: m.isMediaNotice,
      sessionIndex: currentSessionIndex,
      platform: m.platform
    });

    // Words (no spellcheck)
    const tokens = tokenizeWords(visibleText, m.isSystem);
    totals.words += tokens.length;

    // Count top words (filter stopwords, numbers, short tokens, keep Arabizi allow list)
    const filtered = tokens.filter(tok => {
      if (!LATIN_WORD_REGEX.test(tok)) return false;  // "top words" considers Latin-only
      if (tok.length < MIN_WORD_LENGTH) return false;
      if (/\d/.test(tok)) return false;
      if (EGYPTIAN_ARABIZI_ALLOW.has(tok)) return true; // force-allow important colloquial words
      if (STOPWORDS.has(tok)) return false;
      // exclude self name tokens (first/last) from top words for that user
      if (m.from) {
        const name = normalizeParticipantName(m.from).toLowerCase();
        const nameParts = name.split(' ');
        if (nameParts.includes(tok)) return false;
      }
      // exclude common system words regardless (belt & braces)
      const SYSTEM_EXCLUDES = new Set(['omitted','image','video','audio','sticker','gif','document','edited','https','http','www','com','org','net','co','uk','ca','au','de','fr','es','it','ru','jp','cn','in','br','mx','ar','cl','pe','ve','ec','bo','py','uy','io','me','ly','tv','cc','tk','ml','ga','cf','cd','cm','ci','sn','mg','bf','ne','td','tg','bj','gn','gw','lr','sl','gm','gh','ng','bi','rw','ug','ke','tz','zm','mw','sz','ls','bw','na','za','zw','ao','mz','mg','mu','sc','km','yt','re','dj','so','et','er','sd','ss','eg','ly','tn','dz','ma','eh','mr']);
      if (SYSTEM_EXCLUDES.has(tok)) return false;
      return true;
    });

    for (const w of filtered) {
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }

    // Per-user word counts
    const userKey = m.from ? normalizeParticipantName(m.from) : "__system__";
    if (!perUserWords.has(userKey)) perUserWords.set(userKey, new Map());
    
    // Per-user activity tracking
    if (m.from) {
      m.from = normalizeParticipantName(m.from);
      // Initialize activity grid if needed
      if (!perUserActivity.has(m.from)) {
        perUserActivity.set(m.from, Array(7).fill(null).map(() => Array(24).fill(0)));
      }
      
      // Track hourly activity
      const dayOfWeek = m.timestamp.getDay();
      const hourOfDay = m.timestamp.getHours();
      const activityGrid = perUserActivity.get(m.from)!;
      activityGrid[dayOfWeek][hourOfDay]++;
      
      // Track daily activity for streaks
      if (!perUserDailyActivity.has(m.from)) {
        perUserDailyActivity.set(m.from, new Set());
      }
      const dateKey = m.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
      perUserDailyActivity.get(m.from)!.add(dateKey);
    }
    const wmap = perUserWords.get(userKey)!;
    for (const w of filtered) {
      wmap.set(w, (wmap.get(w) ?? 0) + 1);
    }

    // Track mentions per user (only participants) and normalized
    if (m.from && mentionsFound.length > 0) {
      const fromNorm = normalizeParticipantName(m.from);
      if (!perUserMentions.has(fromNorm)) perUserMentions.set(fromNorm, new Map());
      const mmap = perUserMentions.get(fromNorm)!;
      for (const mn of mentionsFound) {
        mmap.set(mn, (mmap.get(mn) ?? 0) + 1);
      }
    }

    // Track media counts per user
    if (m.from && m.mediaType) {
      const fromNorm = normalizeParticipantName(m.from);
      if (!perUserMediaCounts.has(fromNorm)) perUserMediaCounts.set(fromNorm, new Map());
      const mediaMap = perUserMediaCounts.get(fromNorm)!;
      mediaMap.set(m.mediaType, (mediaMap.get(m.mediaType) ?? 0) + 1);
    }

    // Track top emojis (from visibleText only)
    const emojiMatches = visibleText.match(EMOJI_REGEX);
    if (emojiMatches) {
      for (const em of emojiMatches) {
        emojiCounts.set(em, (emojiCounts.get(em) ?? 0) + 1);
      }
    }

    // Per-user aggregations (content uses visibleText)
    if (!byUser[userKey]) {
      byUser[userKey] = {
        messages: 0,
        words: 0,
        characters: 0,
        emojis: 0,
        avgMsgLengthChars: 0,
        mediaNotices: 0,
        links: 0,
        questionRate: 0,
        exclamationRate: 0,
        topWords: []
      };
    }

    const bu = byUser[userKey];
    bu.messages += 1;
    bu.mediaNotices += m.isMediaNotice ? 1 : 0;
    bu.characters += visibleText.length;
    bu.words += tokens.length;
    bu.emojis += emojiCount;
    bu.links += links.length;

    if (visibleText.includes("?")) {
      bu.questionRate += 1;
    }
    if (visibleText.includes("!")) {
      bu.exclamationRate += 1;
    }

    // System events
    if (m.isSystem) {
            const kind = classifySystemEvent(m.text);
      systemEvents[kind] += 1;
    }

    // Domains
    for (const href of links) {
      try {
        const host = new URL(href).host.replace(/^www\./, "");
        domainCounts.set(host, (domainCounts.get(host) ?? 0) + 1);
      } catch {
        // ignore parsing errors
      }
    }

    // Pairwise reply latency: reply to the immediately previous message
    // Conditions: different senders, not system, within 24h.
    if (m.from && prev && prev.from && !m.isSystem && !prev.isSystem && prev.from !== m.from) {
      const secs = (m.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
      if (secs >= 0 && secs <= 86400) {
        const key = `${prev.from}|${m.from}`;
        const arr = pairLatencies.get(key) ?? [];
        arr.push(secs);
        pairLatencies.set(key, arr);
        const mine = responseSamplesByUser.get(m.from) ?? [];
        mine.push(secs);
        responseSamplesByUser.set(m.from, mine);
      }
    }

    // Engagement time by gap (based on timestamps only)
    if (prev) {
      const delta = m.timestamp.getTime() - prev.timestamp.getTime();
            if (delta > 0 && delta <= engagementGapMs) {
        if (countFullGap) {
                    timeSpentMs += Math.min(delta, engagementGapMs);
        } else {
                    timeSpentMs += DEFAULT_ONE_MINUTE_MS; // 1 minute per hop
        }
      }
    }

    prev = m;
  }

  // Per-user averages and rates
  for (const [user, bu] of Object.entries(byUser)) {
    if (bu.messages > 0) {
      bu.avgMsgLengthChars = bu.characters / bu.messages;
      bu.questionRate = bu.questionRate / bu.messages;
      bu.exclamationRate = bu.exclamationRate / bu.messages;
    } else {
      bu.avgMsgLengthChars = 0;
      bu.questionRate = 0;
      bu.exclamationRate = 0;
    }

    // Response time summary
    const samples = responseSamplesByUser.get(user) ?? [];
    if (samples.length > 0) {
      samples.sort((a,b)=>a-b);
      const mid = Math.floor(samples.length/2);
      const median = (samples.length % 2 === 1) ? samples[mid] : (samples[mid-1]+samples[mid])/2;
      const avg = samples.reduce((s,x)=>s+x,0)/samples.length;
      bu.medianResponseSec = median;
      bu.avgResponseSec = avg;
      bu.responseCount = samples.length;
      // buckets: <5m, <15m, <1h, <6h, <24h, >24h
      const buckets = [0,0,0,0,0,0];
      for (const s of samples) {
        if (s < 300) buckets[0]++; else if (s < 900) buckets[1]++; else if (s < 3600) buckets[2]++; else if (s < 21600) buckets[3]++; else if (s < 86400) buckets[4]++; else buckets[5]++;
      }
      bu.responseBuckets = buckets;
    } else {
      bu.medianResponseSec = 0;
      bu.avgResponseSec = 0;
      bu.responseCount = 0;
      bu.responseBuckets = [0,0,0,0,0,0];
    }
    
    // Activity heatmap and streaks
    const activityGrid = perUserActivity.get(user) || Array(7).fill(null).map(() => Array(24).fill(0));
    bu.activityHeatmap = activityGrid;
    
    const dailyActivity = perUserDailyActivity.get(user) || new Set();
    const sortedDates = Array.from(dailyActivity).sort();
    
    if (sortedDates.length > 0) {
      // Calculate streaks
      let longestStreak = 0;
      let currentStreak = 0;
      let tempStreak = 1;
      
      for (let i = 1; i < sortedDates.length; i++) {
        const prevDate = new Date(sortedDates[i-1]);
        const currDate = new Date(sortedDates[i]);
        const dayDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (dayDiff === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);
      
      // Current streak (from most recent date)
      const today = new Date().toISOString().split('T')[0];
      const mostRecentDate = sortedDates[sortedDates.length - 1];
      const daysSinceLastActivity = Math.floor((new Date(today).getTime() - new Date(mostRecentDate).getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceLastActivity <= 1) {
        // Calculate current streak backwards from most recent
        currentStreak = 1;
        for (let i = sortedDates.length - 2; i >= 0; i--) {
          const prevDate = new Date(sortedDates[i]);
          const currDate = new Date(sortedDates[i+1]);
          const dayDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
          if (dayDiff === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
      
      bu.longestStreak = longestStreak;
      bu.currentStreak = currentStreak;
    } else {
      bu.longestStreak = 0;
      bu.currentStreak = 0;
    }
  }

  // Top emojis
  const topEmojis = Array.from(emojiCounts.entries())
    .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOP_EMOJIS)
    .map(([emoji, count]) => ({ emoji, count }));

  // Top words (overall)
  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOP_WORDS)
    .map(([word, count]) => ({ word, count }));

  // Top words per user
  for (const [user, wmap] of perUserWords.entries()) {
    const list = Array.from(wmap.entries())
      .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOP_WORDS_PER_USER)
      .map(([word, count]) => ({ word, count }));

    byUser[user].topWords = list;

    // Top mentions per user
    const mmap = perUserMentions.get(user);
    if (mmap) {
      const mentionsList = Array.from(mmap.entries())
        .sort((a,b)=> b[1]-a[1])
        .slice(0, 30)
        .map(([mention,count])=>({ mention, count }));
      byUser[user].topMentions = mentionsList;
    } else {
      byUser[user].topMentions = [];
    }

    // Media counts per user
    const mediaMap = perUserMediaCounts.get(user);
    if (mediaMap) {
      const mediaCounts: Record<string, number> = {};
      for (const [mediaType, count] of mediaMap.entries()) {
        mediaCounts[mediaType] = count;
      }
      byUser[user].mediaCounts = mediaCounts;
    } else {
      byUser[user].mediaCounts = {};
    }
  }

  // Sessions output formatting + initiators
  const sessionsOut = sessions.map(s => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    durationMs: s.end.getTime() - s.start.getTime(),
    messages: s.count,
    participants: Array.from(s.participants),
    platform: s.platform
  }));

  // Session initiators count
  const sessionInitiatorCounts = new Map<string, number>();
  for (const s of sessions) {
    if (s.initiator) {
      sessionInitiatorCounts.set(s.initiator, (sessionInitiatorCounts.get(s.initiator) ?? 0) + 1);
    }
  }
  const sessionInitiators = Array.from(sessionInitiatorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([user, sessionsStarted]) => ({ user, sessionsStarted }));

  // Pairwise reply latency summary
  const pairwiseReplyLatency = Array.from(pairLatencies.entries()).map(([key, arr]) => {
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    const median = (arr.length % 2 === 1) ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
    const [from, to] = key.split("|");
    return { from, to, medianSec: median, avgSec: avg, samples: arr.length };
  }).sort((a, b) => b.samples - a.samples);

  // Link domains
  const linkDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({ domain, count }));

  return {
    totals,
    topEmojis,
    topWords,
    byUser,
    hourlyHistogram: hourly,
    weekdayHistogram: weekday,
    timeSpentMs,
    sessions: sessionsOut,
    systemEvents,
    linkDomains,
    arabicScriptMessages: arabicScriptMsgs,
    pairwiseReplyLatency,
    sessionInitiators,
    messages: messageData
  };
}

// ============================================================================
// HTML REPORT GENERATOR
// ============================================================================

/**
 * Formats a number with commas for better readability
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Formats time duration in milliseconds to human-readable format
 */
function formatDuration(ms: number): { seconds: number; hours: number; days: number; formatted: string } {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  
  let formatted = '';
  if (days > 0) {
    formatted += `${days} day${days !== 1 ? 's' : ''}`;
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      formatted += `, ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
    }
  } else if (hours > 0) {
    formatted += `${hours} hour${hours !== 1 ? 's' : ''}`;
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    if (remainingMinutes > 0) {
      formatted += `, ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    }
  } else {
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      formatted += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      formatted += `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
  }
  
  return { seconds, hours, days, formatted };
}

/**
 * Formats hourly histogram with actual hour labels
 */
function formatHourlyHistogram(histogram: number[]): Array<{ hour: string; count: number; percentage: number }> {
  const total = histogram.reduce((sum, count) => sum + count, 0);
  return histogram.map((count, index) => ({
    hour: `${index.toString().padStart(2, '0')}:00`,
    count,
    percentage: total > 0 ? (count / total * 100) : 0
  }));
}

/**
 * Formats weekday histogram with actual day names
 */
function formatWeekdayHistogram(histogram: number[]): Array<{ day: string; count: number; percentage: number }> {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const total = histogram.reduce((sum, count) => sum + count, 0);
  return histogram.map((count, index) => ({
    day: dayNames[index],
    count,
    percentage: total > 0 ? (count / total * 100) : 0
  }));
}

/**
 * Generates time series data for each participant (words per month)
 */
export function generateTimeSeriesData(parsedChat: ParsedChat): Array<{ participant: string; data: Array<{ month: string; words: number }> }> {
  const monthlyData = new Map<string, Map<string, number>>();
  
  // Initialize monthly data for each participant
  parsedChat.participants.forEach(participant => {
    monthlyData.set(participant, new Map());
  });
  
  // Process messages to count words per month per participant
  parsedChat.messages.forEach(message => {
    if (message.from && !message.isMediaNotice) {
      const date = new Date(message.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const wordCount = message.text.split(/\s+/).filter(word => word.length > 0).length;
      
      const participantData = monthlyData.get(message.from);
      if (participantData) {
        const currentCount = participantData.get(monthKey) || 0;
        participantData.set(monthKey, currentCount + wordCount);
      }
    }
  });
  
  // Convert to array format and fill missing months with 0
  const allMonths = new Set<string>();
  monthlyData.forEach(participantData => {
    participantData.forEach((_, month) => allMonths.add(month));
  });
  
  const sortedMonths = Array.from(allMonths).sort();
  
  return Array.from(parsedChat.participants).map(participant => {
    const participantData = monthlyData.get(participant) || new Map();
    const data = sortedMonths.map(month => ({
      month,
      words: participantData.get(month) || 0
    }));
    
    return { participant, data };
  });
}