/**
 * Metrics and Analytics Type Definitions
 */

/**
 * Types of system events that can occur in Whatsapp chats
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
    totals: {
        messages: number;
        words: number;
        characters: number;
        emojis: number;
        mediaNotices: number;
        links: number;
    };
    topEmojis: Array<{ emoji: string; count: number }>;
    topWords: Array<{ word: string; count: number }>;
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
    hourlyHistogram: number[];  // Message count by hour of day (24 bins, local time)
    weekdayHistogram: number[]; // Message count by day of week (7 bins, 0=Sunday)
    timeSpentMs: number; // Total estimated engagement time in milliseconds
    /** Chat sessions with timing and participant data */
    sessions: Array<{
        start: string;              // ISO timestamp
        end: string;                // ISO timestamp
        durationMs: number;
        messages: number;
        participants: string[];
    }>;
    systemEvents: Record<SystemEvent, number>;
    linkDomains: Array<{ domain: string; count: number }>;
    arabicScriptMessages: number;
    pairwiseReplyLatency: Array<{
        from: string; 
        to: string;
        medianSec: number; 
        avgSec: number; 
        samples: number;
    }>;
    sessionInitiators: Array<{ user: string; sessionsStarted: number }>;
    messages: Array<{
        timestamp: string;
        from?: string;
        text: string;
        isSystem: boolean;
        isMediaNotice: boolean;
        sessionIndex: number;
        platform: 'whatsapp' | 'instagram';
    }>;
};