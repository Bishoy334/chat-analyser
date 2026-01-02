// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

/**
 * Formats a number with commas for better readability
 */
export function formatNumber(num: number): string {
    return num.toLocaleString();
}

/**
 * Formats time duration in milliseconds to human-readable format
 */
export function formatDuration(ms: number): { seconds: number; hours: number; days: number; formatted: string } {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const days = Math.floor(hours / 24);
  
    let formatted = '';
    if (days > 0) {
        formatted += `${days} day${days !== 1 ? 's' : ''}`;
        const remainingHours = hours % 24;
        if (remainingHours > 0) {
           formatted += `, ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
        }
    } else if (hours > 0) {
        formatted += `${hours} hour${hours !== 1 ? 's' : ''}`;
        const remainingMinutes = Math.floor((seconds % 3600) / 60);
        if (remainingMinutes > 0) {
            formatted += `, ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
        }
    } else {
        const minutes = Math.floor(seconds / 60);
        if (minutes > 0) {
            formatted += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else {
            formatted += `${seconds} second${seconds !== 1 ? 's' : ''}`;
        }
    }
    
    return { seconds, hours, days, formatted };
}

/**
 * Formats hourly histogram with actual hour labels
 */
export function formatHourlyHistogram(histogram: number[]): Array<{ hour: string; count: number; percentage: number }> {
    const total = histogram.reduce((sum, count) => sum + count, 0);
    return histogram.map((count, index) => ({
        hour: `${index.toString().padStart(2, '0')}:00`,
        count,
        percentage: total > 0 ? (count / total * 100) : 0
    }));
}

/**
 * Formats weekday histogram with actual day names
 */
export function formatWeekdayHistogram(histogram: number[]): Array<{ day: string; count: number; percentage: number }> {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const total = histogram.reduce((sum, count) => sum + count, 0);
    return histogram.map((count, index) => ({
        day: dayNames[index],
        count,
        percentage: total > 0 ? (count / total * 100) : 0
    }));
}