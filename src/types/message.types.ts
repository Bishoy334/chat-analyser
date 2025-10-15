/**
 * Message and Chat Type Definitions
 */

/**
 * Represents a single message with metadata. Unified for multiple platforms.
 */
export type Message = {
    timestamp: Date;
    from?: string;
    text: string;
    isSystem: boolean;
    isMediaNotice: boolean;
    mediaType?: string;
    platform: 'whatsapp' | 'instagram';
    instagramData?: {
        reactions?: Array<{
            reaction: string;
            actor: string;
            timestamp: number;
        }>;
        share?: {
            link: string;
            share_text: string;
            original_content_owner: string;
        };
        photos?: Array<{
            uri: string;
            creation_timestamp: number;
        }>;
        videos?: Array<{
            uri: string;
            creation_timestamp: number;
        }>;
        audio_files?: Array<{
            uri: string;
            creation_timestamp: number;
        }>;
        call_duration?: number;
        isReaction?: boolean;
    };
};

/**
 * Complete parsed chat data structure
 */
export type ParsedChat = {
    messages: Message[];
    participants: Set<string>;
    platform: 'whatsapp' | 'instagram';
    title?: string;
    
}

export type TimeSpentOptions = {
    gapMs?: number;             // Maxmimum gap between messages to count as engagement
    sessionGapMs?: number;      // Maxmimum gap between messages to count as same session
    countFullGap?: boolean;     // Whether to count full gap time or just 1 minute per message hop
}
