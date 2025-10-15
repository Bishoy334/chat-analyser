import readline from "node:readline";
import type { ParsedChat } from '../types';
import { PLATFORM_PRIORITY } from '../utils/constants';
import { 
    colorize, 
    logInfo, 
    logWarning, 
    logSuccess, 
    logError,
    formatNumber
} from '../cli/cli.utils';

// ============================================================================
// NAME NORMALIZATION
// ============================================================================

/**
 * Normalizes participant names across platforms to handle different contact names
 */
export async function normalizeParticipantNames(parsedChats: ParsedChat[]): Promise<ParsedChat[]> {
    // Collect all unique participant names from all platforms
    const allNames = new Set<string>();
    const namesByPlatform = new Map<string, Set<string>>();
    
    for (const chat of parsedChats) {
        if (!namesByPlatform.has(chat.platform)) {
            namesByPlatform.set(chat.platform, new Set());
        }
        
        for (const participant of chat.participants) {
            allNames.add(participant);
            namesByPlatform.get(chat.platform)!.add(participant);
        }
    }
  
    // Check if we have potential name variations
    const totalParticipants = allNames.size;
    const maxParticipantsPerPlatform = Math.max(...Array.from(namesByPlatform.values()).map(names => names.size));
  
    // If we have more total participants than the largest single platform,
    // we likely have name variations that need mapping
    if (totalParticipants > maxParticipantsPerPlatform) {
        console.log(`\n${colorize('Found potential name variations:', 'yellow')}`);
    
        // Find names that appear in only one platform
        const singlePlatformNames = new Map<string, string>(); // name -> platform
        const multiPlatformNames = new Set<string>();
    
        for (const name of allNames) {
            let platformCount = 0;
            let lastPlatform = '';
        
            for (const [platform, names] of namesByPlatform) {
                if (names.has(name)) {
                    platformCount++;
                    lastPlatform = platform;
                }
            }
        
            if (platformCount === 1) {
                singlePlatformNames.set(name, lastPlatform);
            } else {
                multiPlatformNames.add(name);
            }
        }
    
        // Show only the names that need mapping
        for (const [name, platform] of singlePlatformNames) {
            console.log(`   ${colorize(name, 'yellow')} (${colorize(platform, 'cyan')})`);
        }
    
        // Interactive mapping for single-platform names
        const nameMappings = new Map<string, string>(); // original -> normalized
        const processedNames = new Set<string>();
    
        // Create readline interface for interactive input
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const askQuestion = (question: string): Promise<string> => {
            return new Promise((resolve) => {
                rl.question(question, (answer) => {
                    resolve(answer.trim());
                });
            });
        };
    
        for (const [originalName, platform] of singlePlatformNames) {
            if (processedNames.has(originalName)) continue;
        
            const allOtherNames = Array.from(allNames).filter(name => name !== originalName);
            
            // Try heuristic-based mapping first
            const suggestedMatch = findBestMatch(originalName, allOtherNames, namesByPlatform);
        
            if (suggestedMatch) {
                // Check if we should reverse the mapping based on platform priority
                const originalPlatform = platform;
                const suggestedPlatform = getPlatformForName(suggestedMatch, namesByPlatform);
                const originalPriority = PLATFORM_PRIORITY[originalPlatform as keyof typeof PLATFORM_PRIORITY] || 999;
                const suggestedPriority = PLATFORM_PRIORITY[suggestedPlatform as keyof typeof PLATFORM_PRIORITY] || 999;
                
                let fromName, toName;
                if (originalPriority < suggestedPriority) {
                // Original has higher priority, keep original as target
                fromName = suggestedMatch;
                toName = originalName;
                } else {
                // Suggested has higher priority, use suggested as target
                fromName = originalName;
                toName = suggestedMatch;
                }
                
                console.log(`\n${colorize('Suggested:', 'blue')} ${colorize(fromName, 'yellow')} → ${colorize(toName, 'green')}`);
                const confirm = await askQuestion(`Accept? (y/n): `);
                
                if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
                console.log(`${colorize('✓', 'green')} Mapped ${colorize(fromName, 'yellow')} → ${colorize(toName, 'green')}`);
                nameMappings.set(fromName, toName);
                processedNames.add(fromName);
                processedNames.add(toName);
                continue;
                }
            }
        
            // If no auto-match or user rejected, ask for manual input
            const manualInput = await askQuestion(`\nEnter correct name for ${colorize(originalName, 'yellow')} (or Enter to keep separate): `);
        
            if (manualInput && manualInput !== originalName) {
                console.log(`${colorize('✓', 'green')} Mapped ${colorize(originalName, 'yellow')} → ${colorize(manualInput, 'green')}`);
                nameMappings.set(originalName, manualInput);
                processedNames.add(originalName);
                processedNames.add(manualInput);
            } else {
                console.log(`${colorize('•', 'gray')} Keeping ${colorize(originalName, 'yellow')} separate`);
                nameMappings.set(originalName, originalName);
                processedNames.add(originalName);
            }
        }
    
        rl.close();
        
        // Apply name mappings to all chats
        const normalizedChats = parsedChats.map(chat => ({
            ...chat,
            participants: new Set(Array.from(chat.participants).map(name => 
                nameMappings.get(name) || name
            )),
            messages: chat.messages.map(message => ({
                ...message,
                from: message.from ? (nameMappings.get(message.from) || message.from) : message.from
            }))
        }));
    
        return normalizedChats;
    } else {
        return parsedChats;
    }
}

/**
 * Simple heuristic to find the best name match with platform priority
 */
export function findBestMatch(originalName: string, knownNames: string[], namesByPlatform: Map<string, Set<string>>): string | null {
    const originalLower = originalName.toLowerCase().trim();
  
    // Sort known names by platform priority (WhatsApp first, then Instagram)
    const sortedKnownNames = knownNames.sort((a, b) => {
        const platformA = getPlatformForName(a, namesByPlatform);
        const platformB = getPlatformForName(b, namesByPlatform);
        const priorityA = PLATFORM_PRIORITY[platformA as keyof typeof PLATFORM_PRIORITY] || 999;
        const priorityB = PLATFORM_PRIORITY[platformB as keyof typeof PLATFORM_PRIORITY] || 999;
        return priorityA - priorityB;
    });
  
    // Check for exact substring matches
    for (const knownName of sortedKnownNames) {
        const knownLower = knownName.toLowerCase().trim();
        
        // If original name is a substring of known name (e.g., "mariam" matches "Mariam Bolis")
        if (knownLower.includes(originalLower) || originalLower.includes(knownLower)) {
            return knownName;
        }
        
        // Check if they share the same first name
        const originalFirst = originalLower.split(' ')[0];
        const knownFirst = knownLower.split(' ')[0];
        
        if (originalFirst === knownFirst && originalFirst.length > 2) {
            return knownName;
        }
        
        // Check if original name is contained in any word of the known name
        const knownWords = knownLower.split(' ');
        for (const word of knownWords) {
            if (word.includes(originalLower) && originalLower.length > 2) {
                return knownName;
            }
        }
    }
    
    return null;
}

/**
 * Helper function to find which platform a name belongs to
 */
export function getPlatformForName(name: string, namesByPlatform: Map<string, Set<string>>): string {
    for (const [platform, names] of namesByPlatform) {
        if (names.has(name)) {
            return platform;
        }
    }
    return 'unknown';
}