import type { ParsedChat, Message } from '../types';
import { stripControlMarks, normaliseParticipantName, decodeInstagramUnicode } from '../utils/text.utils';

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
export function parseInstagram(chatJson: string, title?: string): ParsedChat {
    // First decode any Unicode escape sequences in the JSON string
    const decodedJson = decodeInstagramUnicode(chatJson);
    const data: InstagramExport = JSON.parse(decodedJson);
    const messages: Message[] = [];
  
    // Extract participants
    const participants = new Set<string>();
    for (const participant of data.participants) {
        participants.add(normaliseParticipantName(participant.name));
    }

    // Process messages
    for (const msg of data.messages) {
        const timestamp = new Date(msg.timestamp_ms);
        const sender = normaliseParticipantName(msg.sender_name);

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