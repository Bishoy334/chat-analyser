/**
 * Metrics Computation
 */

import type { ParsedChat, TimeSpentOptions, Metrics, SystemEvent, Message } from '../types';
import {
  DEFAULT_ENGAGEMENT_GAP_MS,
  DEFAULT_SESSION_GAP_MS,
  DEFAULT_ONE_MINUTE_MS,
  MAX_TOP_EMOJIS,
  MAX_TOP_WORDS,
  MAX_TOP_WORDS_PER_USER,
  MIN_WORD_LENGTH,
  EMOJI_REGEX,
  LINK_REGEX,
  ARABIC_CHAR_REGEX,
  LATIN_WORD_REGEX,
  STOPWORDS,
  EGYPTIAN_ARABIZI_ALLOW
} from '../utils/constants';
import {
  stripControlMarks,
  normaliseParticipantName,
  tokeniseWords,
  countEmojis,
  classifySystemEvent
} from '../utils/text.utils';

// ============================================================================
// METRICS COMPUTATION
// ============================================================================

/**
 * Computes comprehensive chat analysis metrics
 * Fast implementation without spell checking for performance
 */
export async function computeMetrics(
    parsedChat: ParsedChat,
    options: TimeSpentOptions = {},
    platform?: string
): Promise<Metrics> {
    // WhatsApp exports are chronologically sorted; keep as-is for speed
    const messages = parsedChat.messages;

    const engagementGapMs = options.gapMs ?? DEFAULT_ENGAGEMENT_GAP_MS;
    const sessionGapMs = options.sessionGapMs ?? DEFAULT_SESSION_GAP_MS;
    const countFullGap = options.countFullGap ?? true;

  const totals = {
    messages: 0,
    words: 0,
    characters: 0,
    emojis: 0,
    mediaNotices: 0,
    links: 0
  };

  const byUser: Metrics["byUser"] = {};
  const emojiCounts = new Map<string, number>();
  const wordCounts = new Map<string, number>();
  const hourly = Array(24).fill(0);
  const weekday = Array(7).fill(0);

  const systemEvents: Record<SystemEvent, number> = {
    deleted: 0, missed_call: 0, call: 0,
    added: 0, left: 0, subject_change: 0, icon_change: 0, poll: 0,
    system_other: 0
  };

  const domainCounts = new Map<string, number>();
  const normalisedParticipants = new Set<string>(Array.from(parsedChat.participants).map(normaliseParticipantName));

  // Pairwise reply latency: A -> B
  const lastByUser = new Map<string, Date>();
  const pairLatencies = new Map<string, number[]>(); // "A|B" => seconds[]
  const responseSamplesByUser = new Map<string, number[]>(); // user => seconds[] (response time when they reply)

  let arabicScriptMsgs = 0;
  let timeSpentMs = 0;

  // Sessions
  type Session = { start: Date; end: Date; count: number; participants: Set<string>; initiator?: string; platform?: string };
  const sessions: Session[] = [];
  let curSession: Session | null = null;
  
  // Message data for chat simulator
  const messageData: Array<{
    timestamp: string;
    from?: string;
    text: string;
    isSystem: boolean;
    isMediaNotice: boolean;
    sessionIndex: number;
    platform: 'whatsapp' | 'instagram';
  }> = [];

  // Per-user word counts
  const perUserWords = new Map<string, Map<string, number>>();
  const perUserMentions = new Map<string, Map<string, number>>();
  const perUserMediaCounts = new Map<string, Map<string, number>>();
  
  // Per-user activity tracking
  const perUserActivity = new Map<string, number[][]>(); // 7x24 grid
  const perUserDailyActivity = new Map<string, Set<string>>(); // user -> Set of "YYYY-MM-DD"

  let prev: Message | null = null;

  for (const m of messages) {
    totals.messages += 1;

    // Mentions: extract from RAW text before stripping control marks,
    // then remove the spans and finally strip control marks for analysis.
    let visibleText: string;
    const mentionsFound: string[] = [];
    if (m.isMediaNotice) {
      visibleText = "";
    } else {
      const rawText = m.text;
      
      // Extract unicode mentions: @​Name​
      const unicodeMentionRegex = /\u2068([\s\S]*?)\u2069/g;
      let mm: RegExpExecArray | null;
      while ((mm = unicodeMentionRegex.exec(rawText)) !== null) {
        const norm = normaliseParticipantName(mm[1]);
        if (normalisedParticipants.has(norm)) mentionsFound.push(norm);
      }
      
      // Extract @mentions: @Name (where Name matches a participant)
      const atMentionRegex = /@([A-Za-z\u00C0-\u017F\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u200E\u200F\u202A-\u202E\u2066-\u2069\s]+)/g;
      let am: RegExpExecArray | null;
      while ((am = atMentionRegex.exec(rawText)) !== null) {
        const mentionText = am[1].trim();
        const norm = normaliseParticipantName(mentionText);
        if (normalisedParticipants.has(norm)) {
          mentionsFound.push(norm);
        }
      }
      
      // Remove both types of mentions from text
      let textWithoutMentionsRaw = rawText.replace(unicodeMentionRegex, "");
      textWithoutMentionsRaw = textWithoutMentionsRaw.replace(atMentionRegex, "");
      visibleText = stripControlMarks(textWithoutMentionsRaw);
    }

    // characters: count only visible content (not literal "image omitted")
    totals.characters += visibleText.length;

    if (m.isMediaNotice) {
      totals.mediaNotices += 1;
    }

    const emojiCount = countEmojis(visibleText);
    totals.emojis += emojiCount;

    const links = visibleText.match(LINK_REGEX) || [];
    totals.links += links.length;

    const hour = m.timestamp.getHours();
    hourly[hour] += 1;

    const day = m.timestamp.getDay();
    weekday[day] += 1;

        if (ARABIC_CHAR_REGEX.test(visibleText)) {
      arabicScriptMsgs += 1;
    }

    // Sessions by gap
    if (!curSession) {
      curSession = { start: m.timestamp, end: m.timestamp, count: 1, participants: new Set(m.from ? [m.from] : []), platform };
      curSession.initiator = m.from;
      sessions.push(curSession);
    } else {
      const deltaSinceSessionEnd = m.timestamp.getTime() - curSession.end.getTime();

            if (deltaSinceSessionEnd <= sessionGapMs) {
        curSession.end = m.timestamp;
        curSession.count += 1;
        if (m.from) curSession.participants.add(m.from);
      } else {
        curSession = { start: m.timestamp, end: m.timestamp, count: 1, participants: new Set(m.from ? [m.from] : []), platform };
        curSession.initiator = m.from;
        sessions.push(curSession);
      }
    }
    
    // Store message data for chat simulator
    const currentSessionIndex = sessions.length - 1;
    messageData.push({
      timestamp: m.timestamp.toISOString(),
      from: m.from,
      text: m.text,
      isSystem: m.isSystem,
      isMediaNotice: m.isMediaNotice,
      sessionIndex: currentSessionIndex,
      platform: m.platform
    });

    // Words (no spellcheck)
    const tokens = tokeniseWords(visibleText, m.isSystem);
    totals.words += tokens.length;

    // Count top words (filter stopwords, numbers, short tokens, keep Arabizi allow list)
    const filtered = tokens.filter(tok => {
      if (!LATIN_WORD_REGEX.test(tok)) return false;  // "top words" considers Latin-only
      if (tok.length < MIN_WORD_LENGTH) return false;
      if (/\d/.test(tok)) return false;
      if (EGYPTIAN_ARABIZI_ALLOW.has(tok)) return true; // force-allow important colloquial words
      if (STOPWORDS.has(tok)) return false;
      // exclude self name tokens (first/last) from top words for that user
      if (m.from) {
        const name = normaliseParticipantName(m.from).toLowerCase();
        const nameParts = name.split(' ');
        if (nameParts.includes(tok)) return false;
      }
      // exclude common system words regardless (belt & braces)
      const SYSTEM_EXCLUDES = new Set(['omitted','image','video','audio','sticker','gif','document','edited','https','http','www','com','org','net','co','uk','ca','au','de','fr','es','it','ru','jp','cn','in','br','mx','ar','cl','pe','ve','ec','bo','py','uy','io','me','ly','tv','cc','tk','ml','ga','cf','cd','cm','ci','sn','mg','bf','ne','td','tg','bj','gn','gw','lr','sl','gm','gh','ng','bi','rw','ug','ke','tz','zm','mw','sz','ls','bw','na','za','zw','ao','mz','mg','mu','sc','km','yt','re','dj','so','et','er','sd','ss','eg','ly','tn','dz','ma','eh','mr']);
      if (SYSTEM_EXCLUDES.has(tok)) return false;
      return true;
    });

    for (const w of filtered) {
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }

    // Per-user word counts
    const userKey = m.from ? normaliseParticipantName(m.from) : "__system__";
    if (!perUserWords.has(userKey)) perUserWords.set(userKey, new Map());
    
    // Per-user activity tracking
    if (m.from) {
      m.from = normaliseParticipantName(m.from);
      // Initialize activity grid if needed
      if (!perUserActivity.has(m.from)) {
        perUserActivity.set(m.from, Array(7).fill(null).map(() => Array(24).fill(0)));
      }
      
      // Track hourly activity
      const dayOfWeek = m.timestamp.getDay();
      const hourOfDay = m.timestamp.getHours();
      const activityGrid = perUserActivity.get(m.from)!;
      activityGrid[dayOfWeek][hourOfDay]++;
      
      // Track daily activity for streaks
      if (!perUserDailyActivity.has(m.from)) {
        perUserDailyActivity.set(m.from, new Set());
      }
      const dateKey = m.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
      perUserDailyActivity.get(m.from)!.add(dateKey);
    }
    const wmap = perUserWords.get(userKey)!;
    for (const w of filtered) {
      wmap.set(w, (wmap.get(w) ?? 0) + 1);
    }

    // Track mentions per user (only participants) and normalised
    if (m.from && mentionsFound.length > 0) {
      const fromNorm = normaliseParticipantName(m.from);
      if (!perUserMentions.has(fromNorm)) perUserMentions.set(fromNorm, new Map());
      const mmap = perUserMentions.get(fromNorm)!;
      for (const mn of mentionsFound) {
        mmap.set(mn, (mmap.get(mn) ?? 0) + 1);
      }
    }

    // Track media counts per user
    if (m.from && m.mediaType) {
      const fromNorm = normaliseParticipantName(m.from);
      if (!perUserMediaCounts.has(fromNorm)) perUserMediaCounts.set(fromNorm, new Map());
      const mediaMap = perUserMediaCounts.get(fromNorm)!;
      mediaMap.set(m.mediaType, (mediaMap.get(m.mediaType) ?? 0) + 1);
    }

    // Track top emojis (from visibleText only)
    const emojiMatches = visibleText.match(EMOJI_REGEX);
    if (emojiMatches) {
      for (const em of emojiMatches) {
        emojiCounts.set(em, (emojiCounts.get(em) ?? 0) + 1);
      }
    }

    // Per-user aggregations (content uses visibleText)
    if (!byUser[userKey]) {
      byUser[userKey] = {
        messages: 0,
        words: 0,
        characters: 0,
        emojis: 0,
        avgMsgLengthChars: 0,
        mediaNotices: 0,
        links: 0,
        questionRate: 0,
        exclamationRate: 0,
        topWords: []
      };
    }

    const bu = byUser[userKey];
    bu.messages += 1;
    bu.mediaNotices += m.isMediaNotice ? 1 : 0;
    bu.characters += visibleText.length;
    bu.words += tokens.length;
    bu.emojis += emojiCount;
    bu.links += links.length;

    if (visibleText.includes("?")) {
      bu.questionRate += 1;
    }
    if (visibleText.includes("!")) {
      bu.exclamationRate += 1;
    }

    // System events
    if (m.isSystem) {
            const kind = classifySystemEvent(m.text);
      systemEvents[kind] += 1;
    }

    // Domains
    for (const href of links) {
      try {
        const host = new URL(href).host.replace(/^www\./, "");
        domainCounts.set(host, (domainCounts.get(host) ?? 0) + 1);
      } catch {
        // ignore parsing errors
      }
    }

    // Pairwise reply latency: reply to the immediately previous message
    // Conditions: different senders, not system, within 24h.
    if (m.from && prev && prev.from && !m.isSystem && !prev.isSystem && prev.from !== m.from) {
      const secs = (m.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
      if (secs >= 0 && secs <= 86400) {
        const key = `${prev.from}|${m.from}`;
        const arr = pairLatencies.get(key) ?? [];
        arr.push(secs);
        pairLatencies.set(key, arr);
        const mine = responseSamplesByUser.get(m.from) ?? [];
        mine.push(secs);
        responseSamplesByUser.set(m.from, mine);
      }
    }

    // Engagement time by gap (based on timestamps only)
    if (prev) {
      const delta = m.timestamp.getTime() - prev.timestamp.getTime();
            if (delta > 0 && delta <= engagementGapMs) {
        if (countFullGap) {
                    timeSpentMs += Math.min(delta, engagementGapMs);
        } else {
                    timeSpentMs += DEFAULT_ONE_MINUTE_MS; // 1 minute per hop
        }
      }
    }

    prev = m;
  }

  // Per-user averages and rates
  for (const [user, bu] of Object.entries(byUser)) {
    if (bu.messages > 0) {
      bu.avgMsgLengthChars = bu.characters / bu.messages;
      bu.questionRate = bu.questionRate / bu.messages;
      bu.exclamationRate = bu.exclamationRate / bu.messages;
    } else {
      bu.avgMsgLengthChars = 0;
      bu.questionRate = 0;
      bu.exclamationRate = 0;
    }

    // Response time summary
    const samples = responseSamplesByUser.get(user) ?? [];
    if (samples.length > 0) {
      samples.sort((a,b)=>a-b);
      const mid = Math.floor(samples.length/2);
      const median = (samples.length % 2 === 1) ? samples[mid] : (samples[mid-1]+samples[mid])/2;
      const avg = samples.reduce((s,x)=>s+x,0)/samples.length;
      bu.medianResponseSec = median;
      bu.avgResponseSec = avg;
      bu.responseCount = samples.length;
      // buckets: <5m, <15m, <1h, <6h, <24h, >24h
      const buckets = [0,0,0,0,0,0];
      for (const s of samples) {
        if (s < 300) buckets[0]++; else if (s < 900) buckets[1]++; else if (s < 3600) buckets[2]++; else if (s < 21600) buckets[3]++; else if (s < 86400) buckets[4]++; else buckets[5]++;
      }
      bu.responseBuckets = buckets;
    } else {
      bu.medianResponseSec = 0;
      bu.avgResponseSec = 0;
      bu.responseCount = 0;
      bu.responseBuckets = [0,0,0,0,0,0];
    }
    
    // Activity heatmap and streaks
    const activityGrid = perUserActivity.get(user) || Array(7).fill(null).map(() => Array(24).fill(0));
    bu.activityHeatmap = activityGrid;
    
    const dailyActivity = perUserDailyActivity.get(user) || new Set();
    const sortedDates = Array.from(dailyActivity).sort();
    
    if (sortedDates.length > 0) {
      // Calculate streaks
      let longestStreak = 0;
      let currentStreak = 0;
      let tempStreak = 1;
      
      for (let i = 1; i < sortedDates.length; i++) {
        const prevDate = new Date(sortedDates[i-1]);
        const currDate = new Date(sortedDates[i]);
        const dayDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (dayDiff === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);
      
      // Current streak (from most recent date)
      const today = new Date().toISOString().split('T')[0];
      const mostRecentDate = sortedDates[sortedDates.length - 1];
      const daysSinceLastActivity = Math.floor((new Date(today).getTime() - new Date(mostRecentDate).getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceLastActivity <= 1) {
        // Calculate current streak backwards from most recent
        currentStreak = 1;
        for (let i = sortedDates.length - 2; i >= 0; i--) {
          const prevDate = new Date(sortedDates[i]);
          const currDate = new Date(sortedDates[i+1]);
          const dayDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
          if (dayDiff === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
      
      bu.longestStreak = longestStreak;
      bu.currentStreak = currentStreak;
    } else {
      bu.longestStreak = 0;
      bu.currentStreak = 0;
    }
  }

  // Top emojis
  const topEmojis = Array.from(emojiCounts.entries())
    .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOP_EMOJIS)
    .map(([emoji, count]) => ({ emoji, count }));

  // Top words (overall)
  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOP_WORDS)
    .map(([word, count]) => ({ word, count }));

  // Top words per user
  for (const [user, wmap] of perUserWords.entries()) {
    const list = Array.from(wmap.entries())
      .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOP_WORDS_PER_USER)
      .map(([word, count]) => ({ word, count }));

    byUser[user].topWords = list;

    // Top mentions per user
    const mmap = perUserMentions.get(user);
    if (mmap) {
      const mentionsList = Array.from(mmap.entries())
        .sort((a,b)=> b[1]-a[1])
        .slice(0, 30)
        .map(([mention,count])=>({ mention, count }));
      byUser[user].topMentions = mentionsList;
    } else {
      byUser[user].topMentions = [];
    }

    // Media counts per user
    const mediaMap = perUserMediaCounts.get(user);
    if (mediaMap) {
      const mediaCounts: Record<string, number> = {};
      for (const [mediaType, count] of mediaMap.entries()) {
        mediaCounts[mediaType] = count;
      }
      byUser[user].mediaCounts = mediaCounts;
    } else {
      byUser[user].mediaCounts = {};
    }
  }

  // Sessions output formatting + initiators
  const sessionsOut = sessions.map(s => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    durationMs: s.end.getTime() - s.start.getTime(),
    messages: s.count,
    participants: Array.from(s.participants),
    platform: s.platform
  }));

  // Session initiators count
  const sessionInitiatorCounts = new Map<string, number>();
  for (const s of sessions) {
    if (s.initiator) {
      sessionInitiatorCounts.set(s.initiator, (sessionInitiatorCounts.get(s.initiator) ?? 0) + 1);
    }
  }
  const sessionInitiators = Array.from(sessionInitiatorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([user, sessionsStarted]) => ({ user, sessionsStarted }));

  // Pairwise reply latency summary
  const pairwiseReplyLatency = Array.from(pairLatencies.entries()).map(([key, arr]) => {
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    const median = (arr.length % 2 === 1) ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
    const [from, to] = key.split("|");
    return { from, to, medianSec: median, avgSec: avg, samples: arr.length };
  }).sort((a, b) => b.samples - a.samples);

  // Link domains
  const linkDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({ domain, count }));

  return {
    totals,
    topEmojis,
    topWords,
    byUser,
    hourlyHistogram: hourly,
    weekdayHistogram: weekday,
    timeSpentMs,
    sessions: sessionsOut,
    systemEvents,
    linkDomains,
    arabicScriptMessages: arabicScriptMsgs,
    pairwiseReplyLatency,
    sessionInitiators,
    messages: messageData
  };
}