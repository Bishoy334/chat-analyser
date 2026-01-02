import type { ParsedChat } from '../types';
import { normaliseParticipantName } from '../utils/text.utils';

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
    const allMessages = chats.flatMap(chat => chat.messages);
  
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
        // Create a normalised key based on participant names AND platform
        const normalisedParticipants = Array.from(chat.participants)
        .map(name => normaliseParticipantName(name).toLowerCase())
        .sort()
        .join('|');
    
        // Include platform in the key to keep different platforms separate
        const key = `${chat.platform}:${normalisedParticipants}`;
    
        if (!groups.has(key)) {
        groups.set(key, []);
        }
        groups.get(key)!.push(chat);
    }
  
    return Array.from(groups.entries()).map(([key, chats]) => ({ key, chats }));
}