/**
 * WhatsApp Chat Analyzer - Main Entry Point
 * 
 * A fast, readable chat analyzer that processes WhatsApp exports and generates
 * comprehensive metrics including engagement analysis, emoji usage, and Egyptian
 * Arabic (Arabizi) text support.
 * 
 * Installation:
 *   npm i -D typescript tsx @types/node
 *   npm i emoji-regex grapheme-splitter
 * 
 * Usage:
 *   npx tsx index.ts path/to/chat.txt           # outputs path/to/chat.json
 *   npx tsx index.ts path/to/chat.txt out.json  # writes to out.json
 */

// ============================================================================
// IMPORTS
// ============================================================================

// Node.js built-in modules
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

// Local modules
import { parseWhatsApp, parseInstagram, parseAndroidMessages, mergeChats, findRelatedChats, computeMetrics, ParsedChat, Metrics, generateTimeSeriesData } from "./parser.js";
import { generateHTMLReport } from "./html-generator.js";

// ============================================================================
// HIERARCHICAL ANALYSIS TYPES
// ============================================================================

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
    platform: 'whatsapp' | 'instagram' | 'android_messages';
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
    responseBuckets?: number[];
  };
};

/**
 * Analysis results for a single platform across all chats
 */
export type PlatformAnalysis = {
  platform: 'whatsapp' | 'instagram' | 'android_messages';
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
      platform: 'whatsapp' | 'instagram' | 'android_messages';
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
    platform: 'whatsapp' | 'instagram' | 'android_messages' | 'mixed';
    participants: string[];
    metrics: Metrics;
  }>;
  lightweightIndividualChats: Array<{
    title?: string;
    platform: 'whatsapp' | 'instagram' | 'android_messages' | 'mixed';
    participants: string[];
    metrics: Metrics;
  }>;
};

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

// Default configuration values
const DEFAULT_ENGAGEMENT_GAP_MS = 120_000;        // 2 minutes
const DEFAULT_SESSION_GAP_MS = 45 * 60 * 1000;    // 45 minutes
const DEFAULT_ONE_MINUTE_MS = 60_000;             // 1 minute

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Detects the platform type based on file extension and content
 */
function detectPlatform(filePath: string, content: string): 'whatsapp' | 'instagram' | 'android_messages' {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath, ext).toLowerCase();
  
  // Check for explicit platform indicators in filename
  if (basename.includes('.whatsapp') || basename.includes('_whatsapp')) {
    return 'whatsapp';
  }
  if (basename.includes('.insta') || basename.includes('_insta') || basename.includes('.instagram') || basename.includes('_instagram')) {
    return 'instagram';
  }
  if (basename.includes('.androidmessages') || basename.includes('_androidmessages') || basename.includes('.android') || basename.includes('_android')) {
    return 'android_messages';
  }
  
  // Fallback to content detection
  if (ext === '.json') {
    try {
      const data = JSON.parse(content);
      // Check if it has Instagram export structure
      if (data.participants && Array.isArray(data.participants) && 
          data.messages && Array.isArray(data.messages) &&
          data.messages.length > 0 && data.messages[0].timestamp_ms) {
        return 'instagram';
      }
    } catch {
      // Not valid JSON, treat as WhatsApp
    }
  }
  
  if (ext === '.xml') {
    // Check if it's Android Messages XML format
    if (content.includes('<smses') && content.includes('<sms ')) {
      return 'android_messages';
    }
  }
  
  return 'whatsapp';
}

/**
 * Parses a single chat file based on its detected platform
 */
async function parseChatFile(filePath: string): Promise<ParsedChat> {
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
 * Discovers chat files in a directory with platform-specific extensions
 */
function discoverChatFiles(directoryPath: string): string[] {
  const chatFiles: string[] = [];
  
  function scanDirectory(dir: string) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        // Recursively scan subdirectories
        scanDirectory(fullPath);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        const basename = path.basename(item.name, ext).toLowerCase();
        
        // Check for chat file patterns
        const isWhatsApp = ext === '.txt' || 
          basename.includes('.whatsapp') || 
          basename.includes('_whatsapp');
        
        const isInstagram = ext === '.json' && (
          basename.includes('.insta') || 
          basename.includes('_insta') || 
          basename.includes('.instagram') || 
          basename.includes('_instagram') ||
          // Also include any .json file that might be Instagram (will be validated later)
          true
        );
        
        const isAndroidMessages = ext === '.xml' && (
          basename.includes('.androidmessages') || 
          basename.includes('_androidmessages') || 
          basename.includes('.android') || 
          basename.includes('_android') ||
          // Also include any .xml file that might be Android Messages (will be validated later)
          true
        );
        
        if (isWhatsApp || isInstagram || isAndroidMessages) {
          chatFiles.push(fullPath);
        }
      }
    }
  }
  
  scanDirectory(directoryPath);
  return chatFiles;
}

/**
 * Processes multiple chat files and merges related conversations
 */
async function processMultipleChats(filePaths: string[]): Promise<ParsedChat[]> {
  const parsedChats: ParsedChat[] = [];
  
  // Parse all files
  for (const filePath of filePaths) {
    try {
      const chat = await parseChatFile(filePath);
      parsedChats.push(chat);
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

/**
 * Platform priority for name normalization (higher priority = preferred name format)
 */
const PLATFORM_PRIORITY = {
  'whatsapp': 1,
  'instagram': 2,
  'android_messages': 3
};

/**
 * Normalizes participant names across platforms to handle different contact names
 */
async function normalizeParticipantNames(parsedChats: ParsedChat[]): Promise<ParsedChat[]> {
  console.error(`\n🔍 Analyzing participant names across platforms...`);
  
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
  
  console.error(`📊 Found ${allNames.size} unique participant names across ${namesByPlatform.size} platforms:`);
  for (const [platform, names] of namesByPlatform) {
    console.error(`   ${platform}: ${Array.from(names).join(', ')}`);
  }
  
  // Check for undefined senders (phone owners) in Android Messages
  const androidMessagesChats = parsedChats.filter(chat => chat.platform === 'android_messages');
  const hasUndefinedSenders = androidMessagesChats.some(chat => 
    chat.messages.some(msg => msg.from === undefined)
  );
  
  if (hasUndefinedSenders) {
    console.error(`\n📱 Detected Android Messages with undefined senders (phone owner)`);
    
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
    
    console.error(`   Android Messages exports don't include the phone owner's name.`);
    const phoneOwnerName = await askQuestion(`   What is the phone owner's name? `);
    
    rl.close();
    
    if (phoneOwnerName) {
      console.error(`   ✅ Phone owner name set to: "${phoneOwnerName}"`);
      
      // Update all undefined senders in Android Messages to use the phone owner name
      const updatedChats = parsedChats.map(chat => {
        if (chat.platform === 'android_messages') {
          return {
            ...chat,
            messages: chat.messages.map(message => ({
              ...message,
              from: message.from === undefined ? phoneOwnerName : message.from
            })),
            participants: new Set([
              ...Array.from(chat.participants),
              phoneOwnerName
            ])
          };
        }
        return chat;
      });
      
      // Re-run the name normalization with updated chats
      return await normalizeParticipantNames(updatedChats);
    }
  }
  
  // Check if we have potential name variations
  const totalParticipants = allNames.size;
  const maxParticipantsPerPlatform = Math.max(...Array.from(namesByPlatform.values()).map(names => names.size));
  
  console.error(`   Total participants: ${totalParticipants}, Max per platform: ${maxParticipantsPerPlatform}`);
  
  // If we have more total participants than the largest single platform,
  // we likely have name variations that need mapping
  if (totalParticipants > maxParticipantsPerPlatform) {
    console.error(`\n⚠️  Detected potential name variations (${totalParticipants} total vs ${maxParticipantsPerPlatform} max per platform)`);
    
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
    
    console.error(`\n🔍 Found ${singlePlatformNames.size} names that appear in only one platform:`);
    for (const [name, platform] of singlePlatformNames) {
      console.error(`   "${name}" (${platform})`);
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
      
      console.error(`\n❓ Is "${originalName}" (from ${platform}) the same person as any of these participants?`);
      const allOtherNames = Array.from(allNames).filter(name => name !== originalName);
      console.error(`   Other participants: ${allOtherNames.join(', ')}`);
      
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
        
        console.error(`   🤖 Suggested match: "${fromName}" → "${toName}" (preferring ${originalPriority < suggestedPriority ? originalPlatform : suggestedPlatform})`);
        const confirm = await askQuestion(`   Accept this mapping? (y/n): `);
        
        if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
          console.error(`   ✅ Confirmed mapping: "${fromName}" → "${toName}"`);
          nameMappings.set(fromName, toName);
          processedNames.add(fromName);
          processedNames.add(toName);
          continue;
        }
      }
      
      // If no auto-match or user rejected, ask for manual input
      console.error(`   Please enter the correct name for "${originalName}" (or press Enter to keep as separate):`);
      const manualInput = await askQuestion(`   Correct name: `);
      
      if (manualInput && manualInput !== originalName) {
        console.error(`   ✅ Manual mapping: "${originalName}" → "${manualInput}"`);
        nameMappings.set(originalName, manualInput);
        processedNames.add(originalName);
        processedNames.add(manualInput);
      } else {
        console.error(`   ⚠️  Keeping "${originalName}" as separate participant`);
        nameMappings.set(originalName, originalName);
        processedNames.add(originalName);
      }
    }
    
    rl.close();
    
    // Apply name mappings to all chats
    console.error(`\n🔄 Applying name normalizations...`);
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
    
    console.error(`✅ Name normalization complete!`);
    return normalizedChats;
  } else {
    console.error(`✅ No name variations detected - all participants appear consistent across platforms`);
    return parsedChats;
  }
}

/**
 * Simple heuristic to find the best name match with platform priority
 */
function findBestMatch(originalName: string, knownNames: string[], namesByPlatform: Map<string, Set<string>>): string | null {
  const originalLower = originalName.toLowerCase().trim();
  
  console.error(`   🔍 Looking for match for "${originalName}" among: ${knownNames.join(', ')}`);
  
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
      console.error(`   ✅ Found substring match: "${originalName}" → "${knownName}"`);
      return knownName;
    }
    
    // Check if they share the same first name
    const originalFirst = originalLower.split(' ')[0];
    const knownFirst = knownLower.split(' ')[0];
    
    if (originalFirst === knownFirst && originalFirst.length > 2) {
      console.error(`   ✅ Found first name match: "${originalName}" → "${knownName}"`);
      return knownName;
    }
    
    // Check if original name is contained in any word of the known name
    const knownWords = knownLower.split(' ');
    for (const word of knownWords) {
      if (word.includes(originalLower) && originalLower.length > 2) {
        console.error(`   ✅ Found word match: "${originalName}" → "${knownName}"`);
        return knownName;
      }
    }
  }
  
  console.error(`   ❌ No match found for "${originalName}"`);
  return null;
}

/**
 * Helper function to find which platform a name belongs to
 */
function getPlatformForName(name: string, namesByPlatform: Map<string, Set<string>>): string {
  for (const [platform, names] of namesByPlatform) {
    if (names.has(name)) {
      return platform;
    }
  }
  return 'unknown';
}

/**
 * Computes hierarchical analysis from multiple parsed chats
 */
async function computeHierarchicalAnalysis(parsedChats: ParsedChat[]): Promise<HierarchicalAnalysis> {
  const allMetrics: Metrics[] = [];
  
  // Compute metrics for each chat
  for (const chat of parsedChats) {
    const metrics = await computeMetrics(chat, {
      gapMs: DEFAULT_ENGAGEMENT_GAP_MS,
      sessionGapMs: DEFAULT_SESSION_GAP_MS,
      countFullGap: true
    }, chat.platform);
    allMetrics.push(metrics);
  }
  
  // Collect all participants across all chats
  const allParticipants = new Set<string>();
  for (const chat of parsedChats) {
    for (const participant of chat.participants) {
      allParticipants.add(participant);
    }
  }
  
  // Group chats by platform
  const chatsByPlatform = new Map<'whatsapp' | 'instagram' | 'android_messages', ParsedChat[]>();
  for (const chat of parsedChats) {
    if (chat.platform === 'mixed') {
      // For mixed chats, we need to analyze each message's platform
      // For now, let's treat mixed chats as separate entries
      continue;
    }
    
    if (!chatsByPlatform.has(chat.platform)) {
      chatsByPlatform.set(chat.platform, []);
    }
    chatsByPlatform.get(chat.platform)!.push(chat);
  }
  
  // Compute overview
  const overview = {
    totalChats: parsedChats.length,
    totalMessages: allMetrics.reduce((sum, m) => sum + m.totals.messages, 0),
    totalWords: allMetrics.reduce((sum, m) => sum + m.totals.words, 0),
    totalCharacters: allMetrics.reduce((sum, m) => sum + m.totals.characters, 0),
    totalEmojis: allMetrics.reduce((sum, m) => sum + m.totals.emojis, 0),
    totalMediaNotices: allMetrics.reduce((sum, m) => sum + m.totals.mediaNotices, 0),
    platforms: Array.from(chatsByPlatform.entries()).map(([platform, chats]) => {
      const platformMetrics = chats.map(chat => 
        allMetrics[parsedChats.indexOf(chat)]
      );
      return {
        platform,
        chats: chats.length,
        messages: platformMetrics.reduce((sum, m) => sum + m.totals.messages, 0),
        words: platformMetrics.reduce((sum, m) => sum + m.totals.words, 0),
        characters: platformMetrics.reduce((sum, m) => sum + m.totals.characters, 0),
        emojis: platformMetrics.reduce((sum, m) => sum + m.totals.emojis, 0)
      };
    }),
    participants: Array.from(allParticipants).map(participant => {
      const participantMetrics = allMetrics.map(metrics => metrics.byUser[participant] || {
        messages: 0, words: 0, characters: 0, emojis: 0
      });
      
      const platforms = new Set<string>();
      for (let i = 0; i < parsedChats.length; i++) {
        if (parsedChats[i].participants.has(participant)) {
          platforms.add(parsedChats[i].platform);
        }
      }
      
      return {
        name: participant,
        totalMessages: participantMetrics.reduce((sum, m) => sum + m.messages, 0),
        totalWords: participantMetrics.reduce((sum, m) => sum + m.words, 0),
        totalCharacters: participantMetrics.reduce((sum, m) => sum + m.characters, 0),
        totalEmojis: participantMetrics.reduce((sum, m) => sum + m.emojis, 0),
        platforms: Array.from(platforms)
      };
    }),
    topEmojis: [] as Array<{ emoji: string; count: number }>, // Will be computed by aggregating all emojis
    topWords: [] as Array<{ word: string; count: number }>, // Will be computed by aggregating all words
    hourlyHistogram: Array(24).fill(0),
    weekdayHistogram: Array(7).fill(0),
    timeSpentMs: allMetrics.reduce((sum, m) => sum + m.timeSpentMs, 0),
    sessions: allMetrics.reduce((sum, m) => sum + m.sessions.length, 0)
  };
  
  // Aggregate emojis and words across all chats
  const emojiCounts = new Map<string, number>();
  const wordCounts = new Map<string, number>();
  
  for (const metrics of allMetrics) {
    // Aggregate emojis
    for (const emoji of metrics.topEmojis) {
      emojiCounts.set(emoji.emoji, (emojiCounts.get(emoji.emoji) || 0) + emoji.count);
    }
    
    // Aggregate words
    for (const word of metrics.topWords) {
      wordCounts.set(word.word, (wordCounts.get(word.word) || 0) + word.count);
    }
    
    // Aggregate histograms
    for (let i = 0; i < 24; i++) {
      overview.hourlyHistogram[i] += metrics.hourlyHistogram[i];
    }
    for (let i = 0; i < 7; i++) {
      overview.weekdayHistogram[i] += metrics.weekdayHistogram[i];
    }
  }
  
  overview.topEmojis = Array.from(emojiCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([emoji, count]) => ({ emoji, count }));
    
  overview.topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word, count]) => ({ word, count }));
  
  // Compute per-platform analysis
  const perPlatform: PlatformAnalysis[] = [];
  for (const [platform, chats] of chatsByPlatform.entries()) {
    const platformMetrics = chats.map(chat => 
      allMetrics[parsedChats.indexOf(chat)]
    );
    
    const platformAnalysis: PlatformAnalysis = {
      platform,
      totalChats: chats.length,
      totalMessages: platformMetrics.reduce((sum, m) => sum + m.totals.messages, 0),
      totalWords: platformMetrics.reduce((sum, m) => sum + m.totals.words, 0),
      totalCharacters: platformMetrics.reduce((sum, m) => sum + m.totals.characters, 0),
      totalEmojis: platformMetrics.reduce((sum, m) => sum + m.totals.emojis, 0),
      totalMediaNotices: platformMetrics.reduce((sum, m) => sum + m.totals.mediaNotices, 0),
      participants: [],
      topEmojis: [],
      topWords: [],
      hourlyHistogram: Array(24).fill(0),
      weekdayHistogram: Array(7).fill(0),
      systemEvents: {},
      linkDomains: []
    };
    
    // Aggregate platform-specific data
    const platformEmojiCounts = new Map<string, number>();
    const platformWordCounts = new Map<string, number>();
    const platformSystemEvents = new Map<string, number>();
    const platformLinkDomains = new Map<string, number>();
    
    for (const metrics of platformMetrics) {
      // Emojis
      for (const emoji of metrics.topEmojis) {
        platformEmojiCounts.set(emoji.emoji, (platformEmojiCounts.get(emoji.emoji) || 0) + emoji.count);
      }
      
      // Words
      for (const word of metrics.topWords) {
        platformWordCounts.set(word.word, (platformWordCounts.get(word.word) || 0) + word.count);
      }
      
      // System events
      for (const [event, count] of Object.entries(metrics.systemEvents)) {
        platformSystemEvents.set(event, (platformSystemEvents.get(event) || 0) + count);
      }
      
      // Link domains
      for (const domain of metrics.linkDomains) {
        platformLinkDomains.set(domain.domain, (platformLinkDomains.get(domain.domain) || 0) + domain.count);
      }
      
      // Histograms
      for (let i = 0; i < 24; i++) {
        platformAnalysis.hourlyHistogram[i] += metrics.hourlyHistogram[i];
      }
      for (let i = 0; i < 7; i++) {
        platformAnalysis.weekdayHistogram[i] += metrics.weekdayHistogram[i];
      }
    }
    
    platformAnalysis.topEmojis = Array.from(platformEmojiCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([emoji, count]) => ({ emoji, count }));
      
    platformAnalysis.topWords = Array.from(platformWordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([word, count]) => ({ word, count }));
    
    platformAnalysis.systemEvents = Object.fromEntries(platformSystemEvents);
    
    platformAnalysis.linkDomains = Array.from(platformLinkDomains.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([domain, count]) => ({ domain, count }));
    
    // Participants for this platform
    const platformParticipants = new Set<string>();
    for (const chat of chats) {
      for (const participant of chat.participants) {
        platformParticipants.add(participant);
      }
    }
    
    platformAnalysis.participants = Array.from(platformParticipants).map(participant => {
      const participantData = platformMetrics.map(metrics => metrics.byUser[participant] || {
        messages: 0, words: 0, characters: 0, emojis: 0, avgMsgLengthChars: 0, topWords: []
      });
      
      const totalMessages = participantData.reduce((sum, p) => sum + p.messages, 0);
      const totalWords = participantData.reduce((sum, p) => sum + p.words, 0);
      const totalCharacters = participantData.reduce((sum, p) => sum + p.characters, 0);
      const totalEmojis = participantData.reduce((sum, p) => sum + p.emojis, 0);
      
      // Aggregate top words for this participant on this platform
      const participantWordCounts = new Map<string, number>();
      for (const data of participantData) {
        for (const word of data.topWords) {
          participantWordCounts.set(word.word, (participantWordCounts.get(word.word) || 0) + word.count);
        }
      }
      
      return {
        name: participant,
        messages: totalMessages,
        words: totalWords,
        characters: totalCharacters,
        emojis: totalEmojis,
        avgMsgLength: totalMessages > 0 ? totalCharacters / totalMessages : 0,
        topWords: Array.from(participantWordCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([word, count]) => ({ word, count }))
      };
    });
    
    perPlatform.push(platformAnalysis);
  }
  
  // Compute per-person analysis
  const perPerson: PersonAnalysis[] = Array.from(allParticipants).map(participant => {
    const personChats = parsedChats.filter(chat => chat.participants.has(participant));
    const personMetrics = personChats.map(chat => 
      allMetrics[parsedChats.indexOf(chat)]
    );
    
    const personData = personMetrics.map(metrics => metrics.byUser[participant] || {
      messages: 0, words: 0, characters: 0, emojis: 0, avgMsgLengthChars: 0,
      questionRate: 0, exclamationRate: 0, medianResponseSec: 0, avgResponseSec: 0, responseCount: 0,
      topWords: [], activityHeatmap: undefined, longestStreak: 0, currentStreak: 0
    });
    
    const platforms = new Set<string>();
    for (const chat of personChats) {
      platforms.add(chat.platform);
    }
    
    const personAnalysis: PersonAnalysis = {
      name: participant,
      totalMessages: personData.reduce((sum, p) => sum + p.messages, 0),
      totalWords: personData.reduce((sum, p) => sum + p.words, 0),
      totalCharacters: personData.reduce((sum, p) => sum + p.characters, 0),
      totalEmojis: personData.reduce((sum, p) => sum + p.emojis, 0),
      platforms: Array.from(platforms).map(platform => {
        const platformChats = personChats.filter(chat => chat.platform === platform);
        const platformMetrics = platformChats.map(chat => 
          allMetrics[parsedChats.indexOf(chat)]
        );
        const platformData = platformMetrics.map(metrics => metrics.byUser[participant] || {
          messages: 0, words: 0, characters: 0, emojis: 0, avgMsgLengthChars: 0,
          topWords: [], activityHeatmap: undefined, longestStreak: 0, currentStreak: 0
        });
        
        const totalMessages = platformData.reduce((sum, p) => sum + p.messages, 0);
        const totalWords = platformData.reduce((sum, p) => sum + p.words, 0);
        const totalCharacters = platformData.reduce((sum, p) => sum + p.characters, 0);
        const totalEmojis = platformData.reduce((sum, p) => sum + p.emojis, 0);
        
        // Aggregate top words for this person on this platform
        const platformWordCounts = new Map<string, number>();
        for (const data of platformData) {
          for (const word of data.topWords) {
            platformWordCounts.set(word.word, (platformWordCounts.get(word.word) || 0) + word.count);
          }
        }
        
        // Use the first available activity heatmap and streaks
        const activityHeatmap = platformData.find(p => p.activityHeatmap)?.activityHeatmap;
        const longestStreak = Math.max(...platformData.map(p => p.longestStreak || 0));
        const currentStreak = Math.max(...platformData.map(p => p.currentStreak || 0));
        
        // Calculate per-platform response time metrics
        const platformResponseTimes: number[] = [];
        const platformResponseBuckets = [0, 0, 0, 0, 0, 0]; // <5m, <15m, <1h, <6h, <24h, >24h
        
        // Get all messages from this platform (from all participants) to understand conversation flow
        const platformMessages = platformChats.flatMap(chat => {
          const chatMetrics = allMetrics[parsedChats.indexOf(chat)];
          return chatMetrics.messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
        }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // Calculate response times within this platform
        for (let i = 1; i < platformMessages.length; i++) {
          const currentMsg = platformMessages[i];
          const prevMsg = platformMessages[i - 1];
          
          // Check if this is a response (current message is from participant, previous was from someone else)
          if (currentMsg.from === participant && prevMsg.from !== participant && !prevMsg.isSystem) {
            const timeDiff = currentMsg.timestamp.getTime() - prevMsg.timestamp.getTime();
            const seconds = Math.floor(timeDiff / 1000);
            
            if (seconds >= 0 && seconds <= 24 * 60 * 60) { // Within 24 hours
              platformResponseTimes.push(seconds);
              
              // Categorize into buckets
              if (seconds < 5 * 60) platformResponseBuckets[0]++;
              else if (seconds < 15 * 60) platformResponseBuckets[1]++;
              else if (seconds < 60 * 60) platformResponseBuckets[2]++;
              else if (seconds < 6 * 60 * 60) platformResponseBuckets[3]++;
              else if (seconds < 24 * 60 * 60) platformResponseBuckets[4]++;
              else platformResponseBuckets[5]++;
            }
          }
        }
        
        const platformResponseMetrics = {
          medianResponseSec: platformResponseTimes.length > 0 ? 
            platformResponseTimes.sort((a, b) => a - b)[Math.floor(platformResponseTimes.length / 2)] : 0,
          avgResponseSec: platformResponseTimes.length > 0 ? 
            platformResponseTimes.reduce((sum, time) => sum + time, 0) / platformResponseTimes.length : 0,
          responseCount: platformResponseTimes.length,
          responseBuckets: platformResponseBuckets
        };
        
        // Calculate per-platform time series data for this participant
        const platformTimeSeriesData = generateTimeSeriesData({
          participants: new Set([participant]),
          messages: platformMessages.filter(msg => msg.from === participant),
          platform: platform as 'whatsapp' | 'instagram',
          title: `${participant} (${platform})`
        });
        
        return {
          platform: platform as 'whatsapp' | 'instagram',
          messages: totalMessages,
          words: totalWords,
          characters: totalCharacters,
          emojis: totalEmojis,
          avgMsgLength: totalMessages > 0 ? totalCharacters / totalMessages : 0,
          topWords: Array.from(platformWordCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([word, count]) => ({ word, count })),
          activityHeatmap,
          longestStreak,
          currentStreak,
          responseMetrics: platformResponseMetrics,
          timeSeriesData: platformTimeSeriesData
        };
      }),
      crossPlatformMetrics: {
        avgMsgLength: personData.reduce((sum, p) => sum + p.avgMsgLengthChars, 0) / personData.length,
        questionRate: personData.reduce((sum, p) => sum + p.questionRate, 0) / personData.length,
        exclamationRate: personData.reduce((sum, p) => sum + p.exclamationRate, 0) / personData.length,
        medianResponseSec: personData.reduce((sum, p) => sum + (p.medianResponseSec || 0), 0) / personData.length,
        avgResponseSec: personData.reduce((sum, p) => sum + (p.avgResponseSec || 0), 0) / personData.length,
        responseCount: personData.reduce((sum, p) => sum + (p.responseCount || 0), 0),
        responseBuckets: personData.reduce((buckets, p) => {
          if (p.responseBuckets && Array.isArray(p.responseBuckets)) {
            return buckets.map((count, i) => count + (p.responseBuckets![i] || 0));
          }
          return buckets;
        }, [0, 0, 0, 0, 0, 0])
      }
    };
    
    return personAnalysis;
  });
  
  // Individual chats data (for HTML generation)
  const individualChats = parsedChats.map((chat, index) => ({
    title: chat.title,
    platform: chat.platform,
    participants: Array.from(chat.participants),
    metrics: allMetrics[index]
  }));
  
  // For JSON output, create a lightweight version without the large message data
  const lightweightIndividualChats = parsedChats.map((chat, index) => ({
    title: chat.title,
    platform: chat.platform,
    participants: Array.from(chat.participants),
    metrics: {
      ...allMetrics[index],
      messages: [] // Remove the large messages array for JSON output
    }
  }));
  
  return {
    overview,
    perPlatform,
    perPerson,
    individualChats, // Full data for HTML generation
    lightweightIndividualChats // Lightweight data for JSON output
  };
}


// ============================================================================
// COMMAND LINE INTERFACE
// ============================================================================

/**
 * Checks if this script is being run directly (not imported as a module)
 */
function isMainModule(): boolean {
    const thisFile = fileURLToPath(import.meta.url);
    return !!process.argv[1] && path.resolve(process.argv[1]) === thisFile;
  }
  
  /**
   * Generates default output path based on input file path
   */
  function getDefaultOutputPath(inputPath: string): string {
      const absolutePath = path.resolve(inputPath);
      const pathInfo = path.parse(absolutePath);
      return path.join(pathInfo.dir, `${pathInfo.name}.json`);
  }
  
  if (isMainModule()) {
    (async () => {
          const inputArg = process.argv[2];
          const outputArg = process.argv[3];

          if (!inputArg) {
        console.error("Usage: tsx index.ts <folder_path> [output.json]");
        console.error("");
        console.error("Examples:");
        console.error("  tsx index.ts ./chats/                    # Analyze all chats in folder");
        console.error("  tsx index.ts ./chats/ analysis.json      # Specify output file");
        console.error("");
        console.error("Supported file patterns:");
        console.error("  - .txt files (WhatsApp exports)");
        console.error("  - .json files with Instagram export structure");
        console.error("  - .xml files with Android Messages export structure");
        console.error("  - Files with .whatsapp, .insta, or .android in filename");
        process.exit(1);
      }

          const inputPath = path.resolve(inputArg);
          const outputPath = outputArg ? path.resolve(outputArg) : path.join(inputPath, 'hierarchical_analysis.json');

          // Check if input is a directory
          if (!fs.statSync(inputPath).isDirectory()) {
            console.error("❌ Input must be a directory containing chat files");
            process.exit(1);
          }

      try {
        // Discover all chat files in the directory
        console.error(`🔍 Scanning directory: ${inputPath}`);
        const chatFiles = discoverChatFiles(inputPath);
        
        if (chatFiles.length === 0) {
          console.error("❌ No chat files found in the directory");
          console.error("   Looking for: .txt files, .json files, .xml files, or files with .whatsapp/.insta/.android in name");
          process.exit(1);
        }
        
        console.error(`📁 Found ${chatFiles.length} chat file(s):`);
        for (const file of chatFiles) {
          const relativePath = path.relative(inputPath, file);
          console.error(`   - ${relativePath}`);
        }
        
        // Parse and merge related chats
        console.error(`\n🔄 Parsing and merging related chats...`);
        const parsedChats = await processMultipleChats(chatFiles);
        
        console.error(`📊 Processed into ${parsedChats.length} conversation(s):`);
        for (let i = 0; i < parsedChats.length; i++) {
          const chat = parsedChats[i];
          const participants = Array.from(chat.participants).join(', ');
          console.error(`   ${i + 1}. ${chat.platform} - ${participants}${chat.title ? ` (${chat.title})` : ''}`);
        }
        
        // Normalize participant names across platforms
        const normalizedChats = await normalizeParticipantNames(parsedChats);
        
        // Compute hierarchical analysis
        console.error(`\n📈 Computing hierarchical analysis...`);
        const hierarchicalAnalysis = await computeHierarchicalAnalysis(normalizedChats);
        
        // Write JSON analysis to file (using lightweight version without large message data)
        const jsonOutput = {
          overview: hierarchicalAnalysis.overview,
          perPlatform: hierarchicalAnalysis.perPlatform,
          perPerson: hierarchicalAnalysis.perPerson,
          individualChats: hierarchicalAnalysis.lightweightIndividualChats.map(chat => ({
            ...chat,
            // Remove large message arrays to reduce file size
            messages: chat.messages ? chat.messages.slice(0, 10) : [], // Keep only first 10 messages as sample
            // Keep sessions but limit to prevent huge files
            sessions: chat.sessions ? chat.sessions.slice(0, 100) : [] // Keep only first 100 sessions
          }))
        };
        fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2), "utf8");
        console.error(`✅ Hierarchical analysis written to: ${outputPath}`);
        
        // Generate HTML report using the updated HTML generator
        const htmlPath = outputPath.replace(/\.json$/, '.html');
        const htmlContent = generateHTMLReport(hierarchicalAnalysis, undefined, normalizedChats);
        fs.writeFileSync(htmlPath, htmlContent, "utf8");
        console.error(`✅ HTML report written to: ${htmlPath}`);
        
        console.error(`\n🎉 Analysis complete!`);
        console.error(`📊 Overview: ${hierarchicalAnalysis.overview.totalChats} chats, ${hierarchicalAnalysis.overview.totalMessages} messages`);
        console.error(`👥 Participants: ${hierarchicalAnalysis.overview.participants.length} people`);
        console.error(`📱 Platforms: ${hierarchicalAnalysis.perPlatform.map(p => p.platform).join(', ')}`);
        console.error(`\nOpen ${htmlPath} in your browser to view the comprehensive report.`);
        
      } catch (error) {
        console.error("❌ Error processing chat files:", error);
        process.exit(1);
      }
      })().catch((error: unknown) => {
          console.error("❌ Unexpected error:", error);
      process.exit(1);
    });
  }
  