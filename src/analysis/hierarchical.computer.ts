import type { ParsedChat, Metrics, HierarchicalAnalysis, PlatformAnalysis, PersonAnalysis } from '../types';
import { computeMetrics } from './metrics.computer';
import { generateTimeSeriesData } from './time-series.generator';
import { DEFAULT_ENGAGEMENT_GAP_MS, DEFAULT_SESSION_GAP_MS } from '../utils/constants';

/**
 * Computes hierarchical analysis from multiple parsed chats
 */
export async function computeHierarchicalAnalysis(parsedChats: ParsedChat[]): Promise<HierarchicalAnalysis> {
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
    const chatsByPlatform = new Map<'whatsapp' | 'instagram', ParsedChat[]>();
    for (const chat of parsedChats) {
        if (chat.platform === 'mixed') {
            // For mixed chats, we need to analyse each message's platform
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
        topEmojis: [] as Array<{ emoji: string; count: number }>,
        topWords: [] as Array<{ word: string; count: number }>,
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
                return chatMetrics.messages;
                }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            
                // Calculate response times within this platform
                for (let i = 1; i < platformMessages.length; i++) {
                    const currentMsg = platformMessages[i];
                    const prevMsg = platformMessages[i - 1];
                
                    // Check if this is a response (current message is from participant, previous was from someone else)
                    if (currentMsg.from === participant && prevMsg.from !== participant && !prevMsg.isSystem) {
                        const timeDiff = new Date(currentMsg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime();
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
                    return buckets.map((count, i) => count + (p.responseBuckets[i] || 0));
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
    } as any;
}