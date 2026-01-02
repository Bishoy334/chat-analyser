/**
 * Hierarchical Analysis Type Definitions
 */

/**
 * Analysis results for a single person across all platforms
 */
export type PersonAnalysis = {
    name: string;
    totalMessages: number;
    totalWords: number;
    totalCharacters: number;
    totalEmojis: number;
    platforms: Array<{
        platform: 'whatsapp' | 'instagram';
        messages: number;
        words: number;
        characters: number;
        emojis: number;
        avgMsgLength: number;
        topWords: Array<{ word: string; count: number }>;
        activityHeatmap?: number[][];
        longestStreak?: number;
        currentStreak?: number;
    }>;
    crossPlatformMetrics: {
        avgMsgLength: number;
        questionRate: number;
        exclamationRate: number;
        medianResponseSec?: number;
        avgResponseSec?: number;
        responseCount?: number;
    };
};

/**
 * Analysis results for a single platform across all chats
 */
export type PlatformAnalysis = {
    platform: 'whatsapp' | 'instagram';
    totalChats: number;
    totalMessages: number;
    totalWords: number;
    totalCharacters: number;
    totalEmojis: number;
    totalMediaNotices: number;
    participants: Array<{
        name: string;
        messages: number;
        words: number;
        characters: number;
        emojis: number;
        avgMsgLength: number;
        topWords: Array<{ word: string; count: number }>;
    }>;
    topEmojis: Array<{ emoji: string; count: number }>;
    topWords: Array<{ word: string; count: number }>;
    hourlyHistogram: number[];
    weekdayHistogram: number[];
    systemEvents: Record<string, number>;
    linkDomains: Array<{ domain: string; count: number }>;
};

/**
 * Comprehensive hierarchical analysis structure
 */
export type HierarchicalAnalysis = {
    overview: {
        totalChats: number;
        totalMessages: number;
        totalWords: number;
        totalCharacters: number;
        totalEmojis: number;
        totalMediaNotices: number;
        platforms: Array<{
        platform: 'whatsapp' | 'instagram';
        chats: number;
        messages: number;
        words: number;
        characters: number;
        emojis: number;
        }>;
        participants: Array<{
        name: string;
        totalMessages: number;
        totalWords: number;
        totalCharacters: number;
        totalEmojis: number;
        platforms: string[];
        }>;
        topEmojis: Array<{ emoji: string; count: number }>;
        topWords: Array<{ word: string; count: number }>;
        hourlyHistogram: number[];
        weekdayHistogram: number[];
        timeSpentMs: number;
        sessions: number;
    };
    perPlatform: PlatformAnalysis[];
    perPerson: PersonAnalysis[];
    individualChats: Array<{
        title?: string;
        platform: 'whatsapp' | 'instagram' | 'mixed';
        participants: string[];
        metrics: any; // Using Metrics type from metrics.types.ts
    }>;
};