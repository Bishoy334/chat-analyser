import type { ParsedChat } from '../types';
import { PLATFORM_PRIORITY } from '../utils/constants';
import { 
    colourise, 
    logInfo, 
    logWarning, 
    logSuccess, 
    logError,
    formatNumber,
    askQuestion
} from '../cli/cli.utils';
import type { Interface as ReadlineInterface } from 'node:readline';

// ============================================================================
// NAME NORMALIZATION
// ============================================================================

/**
 * Normalises participant names across platforms to handle different contact names
 */
export async function normaliseParticipantNames(parsedChats: ParsedChat[], rl?: ReadlineInterface): Promise<ParsedChat[]> {
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
        console.log(`\n${colourise('Found potential name variations:', 'yellow')}`);
    
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
            console.log(`   ${colourise(name, 'yellow')} (${colourise(platform, 'cyan')})`);
        }
    
        // Interactive mapping for single-platform names
        const nameMappings = new Map<string, string>(); // original -> normalised
        const processedNames = new Set<string>();
        
        // If no readline interface provided, use automatic mapping only
        if (!rl) {
            console.log(`\n${colourise('Non-interactive mode:', 'blue')} Using automatic name mapping only`);
            
            for (const [originalName, platform] of singlePlatformNames) {
                if (processedNames.has(originalName)) continue;
                
                const allOtherNames = Array.from(allNames).filter(name => name !== originalName);
                const suggestedMatch = findBestMatch(originalName, allOtherNames, namesByPlatform);
                
                if (suggestedMatch) {
                    // Check if we should reverse the mapping based on platform priority
                    const originalPlatform = platform;
                    const suggestedPlatform = getPlatformForName(suggestedMatch, namesByPlatform);
                    const originalPriority = PLATFORM_PRIORITY[originalPlatform as keyof typeof PLATFORM_PRIORITY] || 999;
                    const suggestedPriority = PLATFORM_PRIORITY[suggestedPlatform as keyof typeof PLATFORM_PRIORITY] || 999;
                    
                    let fromName, toName;
                    if (originalPriority < suggestedPriority) {
                        fromName = suggestedMatch;
                        toName = originalName;
                    } else {
                        fromName = originalName;
                        toName = suggestedMatch;
                    }
                    
                    console.log(`${colourise('✓', 'green')} Auto-mapped ${colourise(fromName, 'yellow')} → ${colourise(toName, 'green')}`);
                    nameMappings.set(fromName, toName);
                    processedNames.add(fromName);
                    processedNames.add(toName);
                } else {
                    console.log(`${colourise('•', 'gray')} Keeping ${colourise(originalName, 'yellow')} separate (no match found)`);
                    nameMappings.set(originalName, originalName);
                    processedNames.add(originalName);
                }
            }
        } else {
    
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
                
                console.log(`\n${colourise('Suggested:', 'blue')} ${colourise(fromName, 'yellow')} → ${colourise(toName, 'green')}`);
                const confirm = await askQuestion(rl, `Accept? (y/n): `);
                
                if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
                console.log(`${colourise('✓', 'green')} Mapped ${colourise(fromName, 'yellow')} → ${colourise(toName, 'green')}`);
                nameMappings.set(fromName, toName);
                processedNames.add(fromName);
                processedNames.add(toName);
                continue;
                }
            }
        
            // If no auto-match or user rejected, ask for manual input
            const manualInput = await askQuestion(rl, `Enter correct name for ${colourise(originalName, 'yellow')} (or Enter to keep separate): `);
        
            if (manualInput && manualInput !== originalName) {
                console.log(`${colourise('✓', 'green')} Mapped ${colourise(originalName, 'yellow')} → ${colourise(manualInput, 'green')}`);
                nameMappings.set(originalName, manualInput);
                processedNames.add(originalName);
                processedNames.add(manualInput);
            } else {
                console.log(`${colourise('•', 'gray')} Keeping ${colourise(originalName, 'yellow')} separate`);
                nameMappings.set(originalName, originalName);
                processedNames.add(originalName);
            }
        }
        }
        
        // Apply name mappings to all chats
        const normalisedChats = parsedChats.map(chat => ({
            ...chat,
            participants: new Set(Array.from(chat.participants).map(name => 
                nameMappings.get(name) || name
            )),
            messages: chat.messages.map(message => ({
                ...message,
                from: message.from ? (nameMappings.get(message.from) || message.from) : message.from
            }))
        }));
    
        return normalisedChats;
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