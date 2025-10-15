import type { ParsedChat, Message } from '../types';
import { DATE_PREFIXES, parseDateParts } from '../utils/date.utils';
import { 
  stripControlMarks, 
  normaliseParticipantName, 
  getMediaType, 
  isMediaNotice 
} from '../utils/text.utils';

// ============================================================================
// WHATSAPP PARSER
// ============================================================================

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
                    sender = normaliseParticipantName(messageContent.slice(0, colonIndex).trim());
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
                        sender = normaliseParticipantName(cleanText.slice(0, colonIndex).trim());
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
        const groupNameMatch = message.text.match(/changed the group name to ["â€œâ€]([^"â€œâ€]+)["â€œâ€]/i);
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
            const normalized = normaliseParticipantName(message.from);
            if (!potentialGroupNames.has(normalized)) {
                participants.add(normalized);
            }
        }
    }

    return { messages, participants, platform: 'whatsapp' as const };
}