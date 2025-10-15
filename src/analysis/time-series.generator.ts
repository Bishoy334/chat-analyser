import type { ParsedChat } from '../types';

// ============================================================================
// TIME SERIES GENERATION
// ============================================================================

/**
 * Generates time series data for each participant (words per month)
 */
export function generateTimeSeriesData(parsedChat: ParsedChat): Array<{ participant: string; data: Array<{ month: string; words: number }> }> {
    const monthlyData = new Map<string, Map<string, number>>();
  
    // Initialize monthly data for each participant
    parsedChat.participants.forEach(participant => {
        monthlyData.set(participant, new Map());
    });
  
    // Process messages to count words per month per participant
    parsedChat.messages.forEach(message => {
        if (message.from && !message.isMediaNotice) {
            const date = new Date(message.timestamp);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const wordCount = message.text.split(/\s+/).filter(word => word.length > 0).length;
            
            const participantData = monthlyData.get(message.from);
            if (participantData) {
                const currentCount = participantData.get(monthKey) || 0;
                participantData.set(monthKey, currentCount + wordCount);
            }
        }
    });
  
    // Convert to array format and fill missing months with 0
    const allMonths = new Set<string>();
    monthlyData.forEach(participantData => {
        participantData.forEach((_, month) => allMonths.add(month));
    });
  
    const sortedMonths = Array.from(allMonths).sort();
  
    return Array.from(parsedChat.participants).map(participant => {
        const participantData = monthlyData.get(participant) || new Map();
        const data = sortedMonths.map(month => ({
        month,
        words: participantData.get(month) || 0
        }));
    
        return { participant, data };
    });
}