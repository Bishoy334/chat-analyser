import fs from "node:fs";
import path from "node:path";
import type { ParsedChat } from '../types';
import { detectPlatform } from '../utils/file.utils';
import { parseWhatsApp } from '../parsers/whatsapp.parser';
import { parseInstagram } from '../parsers/instagram.parser';
import { parseAndroidMessages } from '../parsers/android-messages.parser';
import { mergeChats, findRelatedChats } from '../parsers/chat-merger';

// ============================================================================
// FILE PROCESSING
// ============================================================================

/**
 * Parses a single chat file based on its detected platform
 */
export async function parseChatFile(filePath: string): Promise<ParsedChat> {
    const content = fs.readFileSync(filePath, "utf8");
    const platform = detectPlatform(filePath, content);
    const fileName = path.basename(filePath, path.extname(filePath));
  
    if (platform === 'instagram') {
        return parseInstagram(content, fileName);
    } else if (platform === 'android_messages') {
        return await parseAndroidMessages(content, fileName);
    } else {
        return parseWhatsApp(content);
    }
}

/**
 * Processes multiple chat files and merges related conversations
 */
export async function processMultipleChats(filePaths: string[]): Promise<ParsedChat[]> {
    const parsedChats: ParsedChat[] = [];
  
    // Parse all files
    for (const filePath of filePaths) {
        try {
            const chat = await parseChatFile(filePath);
            // Only add chats that have messages
            if (chat.messages.length > 0) {
                parsedChats.push(chat);
            }
        } catch (error) {
            console.error(`❌ Error parsing ${filePath}:`, error);
        }
    }
  
    // Group related chats by participants
    const relatedGroups = findRelatedChats(parsedChats);
  
    // Merge related chats
    const mergedChats: ParsedChat[] = [];
    for (const group of relatedGroups) {
        if (group.chats.length === 1) {
            mergedChats.push(group.chats[0]);
        } else {
            const merged = mergeChats(group.chats);
            mergedChats.push(merged);
        }
    }
  
    return mergedChats;
}