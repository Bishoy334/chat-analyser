
// ============================================================================
// HTML REPORT GENERATOR
// ============================================================================
import type { Metrics, ParsedChat, HierarchicalAnalysis } from '../types';
import { formatNumber, formatDuration, formatHourlyHistogram, formatWeekdayHistogram } from './format.utils';
import { generateTimeSeriesData } from '../analysis/time-series.generator';
  
/**
 * Generates a modern, professional HTML dashboard from chat analysis data
 */
export function generateHTMLReport(
  data: { participants: string[]; metrics: Metrics } | HierarchicalAnalysis, 
  parsedChat?: ParsedChat,
  parsedChats?: ParsedChat[]
): string {
    // Check if this is hierarchical analysis or single chat
    const isHierarchical = 'overview' in data;
      
    let participants: string[];
    let metrics: Metrics;
    let hierarchicalData: HierarchicalAnalysis | null = null;
      
    if (isHierarchical) {
        hierarchicalData = data as HierarchicalAnalysis;
        // For hierarchical data, we'll use the overview data and create a combined metrics object
        participants = hierarchicalData.overview.participants.map(p => p.name);
        
        // Use the first individual chat for the base metrics structure
        const firstChat = hierarchicalData.individualChats[0];
        if (firstChat) {
            metrics = firstChat.metrics;
            // Override totals with overview data for cross-platform totals
            metrics.totals = {
                messages: hierarchicalData.overview.totalMessages,
                words: hierarchicalData.overview.totalWords,
                characters: hierarchicalData.overview.totalCharacters,
                emojis: hierarchicalData.overview.totalEmojis,
                links: firstChat.metrics.totals.links || 0,
                mediaNotices: hierarchicalData.overview.totalMediaNotices
            };
            // Override histograms with overview data
            metrics.hourlyHistogram = hierarchicalData.overview.hourlyHistogram;
            metrics.weekdayHistogram = hierarchicalData.overview.weekdayHistogram;
            metrics.timeSpentMs = hierarchicalData.overview.timeSpentMs;
            // Override top emojis and words with overview data
            metrics.topEmojis = hierarchicalData.overview.topEmojis;
            metrics.topWords = hierarchicalData.overview.topWords;
        } else {
            // Fallback if no individual chats
            metrics = {
                totals: {
                messages: hierarchicalData.overview.totalMessages,
                words: hierarchicalData.overview.totalWords,
                characters: hierarchicalData.overview.totalCharacters,
                emojis: hierarchicalData.overview.totalEmojis,
                links: 0,
                mediaNotices: hierarchicalData.overview.totalMediaNotices
                },
                timeSpentMs: hierarchicalData.overview.timeSpentMs,
                sessions: [],
                hourlyHistogram: hierarchicalData.overview.hourlyHistogram,
                weekdayHistogram: hierarchicalData.overview.weekdayHistogram,
                messages: [],
                topEmojis: hierarchicalData.overview.topEmojis,
                topWords: hierarchicalData.overview.topWords,
                linkDomains: [],
                sessionInitiators: [],
                systemEvents: {
                    deleted: 0,
                    missed_call: 0,
                    call: 0,
                    added: 0,
                    left: 0,
                    subject_change: 0,
                    icon_change: 0,
                    poll: 0,
                    system_other: 0
                },
                arabicScriptMessages: 0,
                pairwiseReplyLatency: [],
                byUser: {},
            };
        }
    } else {
        // Single chat analysis
        const singleData = data as { participants: string[]; metrics: Metrics };
        participants = singleData.participants;
        metrics = singleData.metrics;
    }
      
    const duration = formatDuration(metrics.timeSpentMs);
    const hourlyData = formatHourlyHistogram(metrics.hourlyHistogram);
    const weekdayData = formatWeekdayHistogram(metrics.weekdayHistogram);
    let timeSeriesData = [];
      
    if (isHierarchical && hierarchicalData) {
        // For hierarchical data, combine time series data from all platforms for all participants
        const allParticipants = hierarchicalData.overview.participants.map(p => p.name);
        timeSeriesData = allParticipants.map(participant => {
          const personData = hierarchicalData.perPerson.find(p => p.name === participant);
          if (!personData) return null;
          
          // Combine time series data from all platforms for this participant
          const allPlatformData = personData.platforms.flatMap(p => p.timeSeriesData || []);
          const combinedData = new Map<string, number>();
          
          // Combine data from all platforms
          allPlatformData.forEach(series => {
            if (series.participant === participant) {
              series.data.forEach(point => {
                const key = point.month;
                if (!combinedData.has(key)) {
                  combinedData.set(key, 0);
                }
                combinedData.set(key, combinedData.get(key) + point.words);
              });
            }
          });
          
          // Convert back to array format
          const sortedMonths = Array.from(combinedData.keys()).sort();
          return {
            participant: participant,
            data: sortedMonths.map(month => ({
              month,
              words: combinedData.get(month) || 0
            }))
          };
        }).filter(Boolean);
    } else if (parsedChat) {
        timeSeriesData = generateTimeSeriesData(parsedChat);
    }
      
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chat Analysis</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #f5f5f5;
                color: #333;
                line-height: 1.5;
            }
            
            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 40px 20px;
            }
            
            .header {
                background: white;
                padding: 32px;
                margin-bottom: 32px;
                border-bottom: 3px solid #2563eb;
            }
            
            .header h1 {
                font-size: 28px;
                font-weight: 600;
                color: #111;
                margin-bottom: 8px;
            }
            
            .participants {
                color: #666;
                font-size: 16px;
            }
            
            .tabs {
                display: flex;
                gap: 4px;
                margin-bottom: 32px;
                border-bottom: 2px solid #e5e5e5;
                overflow-x: auto;
                overflow-y: hidden;
                white-space: nowrap;
                scrollbar-width: thin;
                scrollbar-color: #ccc #f5f5f5;
            }
            
            .tabs::-webkit-scrollbar {
                height: 6px;
            }
            
            .tabs::-webkit-scrollbar-track {
                background: #f5f5f5;
            }
            
            .tabs::-webkit-scrollbar-thumb {
                background: #ccc;
                border-radius: 3px;
            }
            
            .tabs::-webkit-scrollbar-thumb:hover {
                background: #999;
            }
            
            .tabs button {
                background: none;
                border: none;
                padding: 12px 24px;
                font-size: 15px;
                font-weight: 500;
                color: #666;
                cursor: pointer;
                border-bottom: 2px solid transparent;
                margin-bottom: -2px;
                transition: all 0.2s;
            }
            
            .tabs button:hover {
                color: #2563eb;
            }
            
            .tabs button.active {
                color: #2563eb;
                border-bottom-color: #2563eb;
            }
            
            .page {
                display: none;
            }
            
            .page.active {
                display: block;
            }
            
            .section {
                background: white;
                padding: 28px;
                margin-bottom: 24px;
                border: 1px solid #e5e5e5;
            }
            
            .section-title {
                font-size: 20px;
                font-weight: 600;
                color: #111;
                margin-bottom: 24px;
                padding-bottom: 12px;
                border-bottom: 1px solid #e5e5e5;
            }
            
            .stats-row {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 20px;
                margin-bottom: 24px;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 16px;
                margin-bottom: 20px;
            }
            
            .stat-box {
                padding: 20px;
                background: #fafafa;
                border: 1px solid #e5e5e5;
            }
            
            .stat-value {
                font-size: 32px;
                font-weight: 700;
                color: #2563eb;
                margin-bottom: 4px;
            }
            
            .stat-label {
                font-size: 13px;
                color: #666;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-weight: 500;
            }
            
            .chart-wrapper {
                margin: 24px 0;
            }
            
            .chart-label {
                font-size: 15px;
                font-weight: 600;
                color: #333;
                margin-bottom: 16px;
            }
            
            .bar-chart {
                display: flex;
                align-items: flex-end;
                height: 200px;
                gap: 3px;
                background: #fafafa;
                padding: 16px;
                border: 1px solid #e5e5e5;
            }
            
            .bar-item {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-end;
                position: relative;
                height: 100%;
            }
            
            .bar {
                width: 100%;
                background: #2563eb;
                cursor: pointer;
                position: relative;
                transition: background 0.2s;
                min-height: 3px;
                align-self: flex-end;
            }
            
            .bar:hover {
                background: #1d4ed8;
            }
            
            .bar-count {
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                background: #111;
                color: white;
                padding: 4px 8px;
                font-size: 12px;
                white-space: nowrap;
                opacity: 0;
                pointer-events: none;
                margin-bottom: 4px;
            }
            
            .bar-item:hover .bar-count {
                opacity: 1;
            }
            
            .bar-label {
                margin-top: 8px;
                font-size: 11px;
                color: #666;
                font-weight: 500;
            }
            
            .grid-2 {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                gap: 12px;
            }
            
            .emoji-item {
                background: #fafafa;
                border: 1px solid #e5e5e5;
                padding: 16px;
                text-align: center;
            }
            
            .emoji-item .emoji {
                font-size: 28px;
                display: block;
                margin-bottom: 8px;
            }
            
            .emoji-item .count {
                font-weight: 600;
                color: #2563eb;
                font-size: 14px;
            }
            
            .tags {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            
            .tag {
                background: #2563eb;
                color: white;
                padding: 6px 14px;
                font-size: 13px;
                font-weight: 500;
                border-radius: 3px;
            }
            
            .tag.green {
                background: #059669;
            }
            
            .session-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            
            .session-item {
                background: #fafafa;
                border-left: 3px solid #2563eb;
                padding: 16px;
            }
            
            .session-date {
                font-weight: 600;
                color: #111;
                margin-bottom: 8px;
                font-size: 14px;
            }
            
            .session-meta {
                display: flex;
                gap: 16px;
                font-size: 13px;
                color: #666;
            }
            
            .user-header {
                background: #2563eb;
                color: white;
                padding: 32px;
                margin-bottom: 32px;
                display: flex;
                align-items: center;
                gap: 20px;
            }
            
            .user-avatar {
                width: 64px;
                height: 64px;
                background: rgba(255,255,255,0.2);
                border: 2px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 28px;
                font-weight: 600;
            }
            
            .user-name {
                font-size: 28px;
                font-weight: 600;
            }
            
             .line-chart {
                 background: #fafafa;
                 border: 1px solid #e5e5e5;
                 padding: 40px;
                 position: relative;
                 margin: 16px 0;
                 overflow: visible;
             }
            
             .line-chart svg {
                 width: 100%;
                 height: 400px;
             }
            
            .line {
                fill: none;
                stroke-width: 2.5;
                stroke-linecap: round;
                stroke-linejoin: round;
                transition: stroke-width 0.2s, opacity 0.2s;
            }
            
            .line.faded {
                opacity: 0.15;
            }
            
            .line.hidden {
                display: none;
            }
            
            .data-point {
                opacity: 0;
                transition: opacity 0.2s;
            }
            
            .data-point:hover {
                opacity: 1;
            }
            
            .point-tooltip {
                position: absolute;
                background: #111;
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 13px;
                pointer-events: none;
                white-space: nowrap;
                z-index: 100;
                display: none;
            }
            
             .chart-legend {
                 display: grid;
                 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                 gap: 8px;
                 margin-top: 20px;
                 max-height: 250px;
                 overflow-y: auto;
                 padding: 16px;
                 background: white;
                 border: 1px solid #e5e5e5;
                 border-radius: 4px;
                 box-sizing: border-box;
             }
            
             .legend-item {
                 display: flex;
                 align-items: center;
                 gap: 8px;
                 font-size: 13px;
                 cursor: pointer;
                 padding: 6px 8px;
                 border-radius: 4px;
                 transition: background 0.2s;
                 user-select: none;
                 min-height: 32px;
                 box-sizing: border-box;
             }
            
            .legend-item:hover {
                background: #f5f5f5;
            }
            
            .heatmap-container {
                margin: 16px 0;
                overflow-x: auto;
            }
            
            .heatmap {
                display: inline-block;
                min-width: 600px;
            }
            
            .heatmap-header {
                margin-bottom: 8px;
            }
            
            .heatmap-time-labels {
                display: grid;
                grid-template-columns: 40px repeat(24, 28px);
                gap: 6px;
                margin-left: 40px;
            }
            
            .time-label {
                font-size: 11px;
                text-align: center;
                color: #666;
                white-space: nowrap;
            }
            
            .heatmap-grid {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            
            .heatmap-day {
                display: grid;
                grid-template-columns: 40px repeat(24, 28px);
                gap: 6px;
                align-items: center;
            }
            
            .day-label {
                font-size: 12px;
                font-weight: 500;
                text-align: right;
                padding-right: 8px;
                color: #333;
            }
            
            .heatmap-hours {
                display: grid;
                grid-template-columns: repeat(24, 28px);
                gap: 6px;
            }
            
            .heatmap-cell {
                width: 24px;
                height: 24px;
                background: #2563eb;
                border-radius: 2px;
                cursor: pointer;
                transition: transform 0.1s;
                position: relative;
            }
            
            .heatmap-cell:hover {
                transform: scale(1.2);
            }
  
            .heatmap-cell:hover::after {
                content: attr(data-count);
                position: absolute;
                top: -30px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 4px 6px;
                font-size: 11px;
                border-radius: 4px;
                white-space: nowrap;
                pointer-events: none;
                opacity: 1; /* ensure tooltip is fully opaque */
            }
            
            .legend-item.inactive {
                opacity: 0.4;
            }
            
             .legend-checkbox {
                 width: 16px;
                 height: 16px;
                 border: 2px solid #ccc;
                 border-radius: 3px;
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 flex-shrink: 0;
             }
            
            .legend-item.active .legend-checkbox {
                border-color: currentColor;
                background: currentColor;
            }
            
            .legend-checkbox::after {
                content: '✓';
                color: white;
                font-size: 12px;
                font-weight: bold;
                display: none;
            }
            
            .legend-item.active .legend-checkbox::after {
                display: block;
            }
            
             .legend-color {
                 width: 20px;
                 height: 3px;
                 border-radius: 2px;
                 flex-shrink: 0;
             }
            
            .legend-name {
                flex: 1;
                font-weight: 500;
            }
            
            .chart-grid {
                stroke: #e5e5e5;
                stroke-width: 1;
                opacity: 0.5;
            }
            
            .chart-axis {
                stroke: #666;
                stroke-width: 1;
            }
            
            .chart-label {
                font-size: 12px;
                fill: #666;
            }
            
           .chat-message {
               margin-bottom: 12px;
               padding: 8px 12px;
               border-radius: 8px;
               transition: all 0.2s;
           }
           
           .chat-message:hover {
               background-color: #f8f9fa;
           }
           
           .message-header {
               display: flex;
               justify-content: space-between;
               align-items: center;
               margin-bottom: 4px;
           }
           
           .message-sender {
               font-weight: 600;
           }
           
           .message-time {
               font-size: 12px;
               color: #666;
           }
           
           .message-content {
               margin-left: 8px;
               line-height: 1.4;
               word-wrap: break-word;
           }
           
           @media (max-width: 768px) {
               .container {
                   padding: 20px 12px;
               }
               
               .header {
                   padding: 20px;
               }
               
               .section {
                   padding: 20px;
               }
               
               .tabs {
                   overflow-x: auto;
                   flex-wrap: nowrap;
               }
               
               .stats-row {
                   grid-template-columns: 1fr;
               }
               
               .bar-chart {
                   height: 160px;
               }
               
               .chart-legend {
                   grid-template-columns: 1fr;
                   max-height: 300px;
               }
               
               .line-chart {
                   padding: 20px;
               }
               
               .line-chart svg {
                   height: 300px;
               }
           }
           
           .platform-toggle {
               display: flex;
               gap: 8px;
               margin-bottom: 16px;
               flex-wrap: wrap;
           }
           
           .platform-toggle button {
               background: #e5e5e5;
               border: none;
               padding: 8px 16px;
               border-radius: 20px;
               font-size: 14px;
               font-weight: 500;
               color: #666;
               cursor: pointer;
               transition: all 0.2s;
           }
           
           .platform-toggle button.active {
               background: #2563eb;
               color: white;
           }
           
           .platform-toggle button:hover {
               background: #2563eb;
               color: white;
           }
           
           .platform-breakdown {
               background: #f8f9fa;
               padding: 20px;
               border-radius: 8px;
               margin: 16px 0;
               border-left: 4px solid #2563eb;
           }
           
            .platform-breakdown h4 {
                color: #2563eb;
                margin-bottom: 12px;
                font-size: 16px;
                font-weight: 600;
            }
            
            .platform-table-wrapper {
                overflow-x: auto;
                margin-top: 20px;
            }
            
            .platform-table {
                width: 100%;
                border-collapse: collapse;
                background: white;
                border: 1px solid #e5e5e5;
                border-radius: 8px;
                overflow: hidden;
            }
            
            .platform-table th {
                background: #f8f9fa;
                padding: 16px 20px;
                font-weight: 600;
                color: #333;
                border-bottom: 2px solid #e5e5e5;
                font-size: 14px;
            }
            
            .platform-table th.platform-col {
                text-align: left;
            }
            
            .platform-table th.number-col {
                text-align: right !important;
            }
            
            .platform-table td {
                padding: 16px 20px;
                border-bottom: 1px solid #f0f0f0;
                font-size: 14px;
                color: #333;
            }
            
            .platform-table tr:last-child td {
                border-bottom: none;
            }
            
            .platform-table tr:hover {
                background: #f8f9fa;
            }
            
            .platform-col {
                text-align: left;
                font-weight: 500;
                min-width: 120px;
            }
            
            .number-col {
                text-align: right;
                font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
                min-width: 100px;
            }
            
            .platform-breakdown {
                border-left: none !important;
                margin-top: 20px;
           }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Chat Analysis</h1>
                <div class="participants">
                    ${participants.join(', ')} • ${formatNumber(metrics.totals.messages)} messages • ${duration.formatted}
                    ${hierarchicalData ? ` • ${hierarchicalData.overview.platforms.length} platforms` : ''}
                </div>
            </div>
            
          <div class="tabs">
              <button onclick="showPage('overview')" class="active">Overview</button>
              <button onclick="showPage('chat-simulator')">Message History</button>
              ${participants.map((p, i) => `<button onclick="showPage('user-${i}')">${p}</button>`).join('')}
          </div>
            
            <div id="overview" class="page active">
                ${hierarchicalData ? `
                <div class="section">
                    <div class="section-title">Overview</div>
                    <div class="stats-row">
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(hierarchicalData.overview.totalChats)}</div>
                            <div class="stat-label">Total Chats</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${hierarchicalData.overview.platforms.length}</div>
                        <div class="stat-label">Platforms</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(hierarchicalData.overview.totalMessages)}</div>
                            <div class="stat-label">Total Messages</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(hierarchicalData.overview.totalWords)}</div>
                            <div class="stat-label">Total Words</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(hierarchicalData.overview.totalCharacters)}</div>
                            <div class="stat-label">Total Characters</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(hierarchicalData.overview.totalEmojis)}</div>
                            <div class="stat-label">Total Emojis</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatDuration(hierarchicalData.overview.timeSpentMs).formatted}</div>
                            <div class="stat-label">Time Spent</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                ${hierarchicalData ? `
                <div class="section">
                    <div class="section-title">Platform Breakdown</div>
                    <div class="platform-table-wrapper">
                        <table class="platform-table">
                            <thead>
                                <tr>
                                    <th class="platform-col">Platform</th>
                                    <th class="number-col">Chats</th>
                                    <th class="number-col">Messages</th>
                                    <th class="number-col">Words</th>
                                    <th class="number-col">Characters</th>
                                    <th class="number-col">Emojis</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${hierarchicalData.overview.platforms.map(platform => `
                                    <tr>
                                        <td class="platform-col">${platform.platform.charAt(0).toUpperCase() + platform.platform.slice(1)}</td>
                                        <td class="number-col">${platform.chats}</td>
                                        <td class="number-col">${formatNumber(platform.messages)}</td>
                                        <td class="number-col">${formatNumber(platform.words)}</td>
                                        <td class="number-col">${formatNumber(platform.characters)}</td>
                                        <td class="number-col">${formatNumber(platform.emojis)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                ` : ''}
                
                <div class="section">
                    <div class="section-title">Activity</div>
                    ${hierarchicalData ? `
                    <div class="platform-toggle">
                        <button class="active" onclick="toggleChart('hourly', 'total')">Total</button>
                        ${hierarchicalData.overview.platforms.map(p => `
                            <button onclick="toggleChart('hourly', '${p.platform}')">${p.platform.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ` : ''}
                    
                    <div class="chart-wrapper">
                        <div class="chart-label">By Hour</div>
                        <div class="bar-chart">
                            ${hourlyData.map(item => {
                                const hour = parseInt(item.hour.split(':')[0]);
                                const period = hour >= 12 ? 'PM' : 'AM';
                                const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                return `
                                <div class="bar-item">
                                    <div class="bar" style="height: ${(item.count / Math.max(...hourlyData.map(d => d.count)) * 100)}%">
                                        <div class="bar-count">${formatNumber(item.count)}</div>
                                    </div>
                                    <div class="bar-label">${displayHour}${period}</div>
                                </div>
                            `}).join('')}
                        </div>
                    </div>
                    
                    ${hierarchicalData ? `
                    <div class="platform-toggle">
                        <button class="active" onclick="toggleChart('weekday', 'total')">Total</button>
                        ${hierarchicalData.overview.platforms.map(p => `
                            <button onclick="toggleChart('weekday', '${p.platform}')">${p.platform.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ` : ''}
                    
                    <div class="chart-wrapper">
                        <div class="chart-label">By Day</div>
                        <div class="bar-chart">
                            ${weekdayData.map(item => `
                                <div class="bar-item">
                                    <div class="bar" style="height: ${(item.count / Math.max(...weekdayData.map(d => d.count)) * 100)}%">
                                        <div class="bar-count">${formatNumber(item.count)}</div>
                                    </div>
                                    <div class="bar-label">${item.day.slice(0, 3)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                
                ${timeSeriesData.length > 0 ? `
                <div class="section">
                    <div class="section-title">Words Over Time</div>
                    ${hierarchicalData ? `
                    <div class="platform-toggle">
                        <button onclick="toggleOverviewSection('timeSeriesChart', 'total')" class="active">Total</button>
                        ${hierarchicalData.overview.platforms.map(p => `
                            <button onclick="toggleOverviewSection('timeSeriesChart', '${p.platform}')">${p.platform.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ` : ''}
                    <div class="line-chart" id="timeSeriesChart">
                        <div class="point-tooltip" id="chartTooltip"></div>
                        <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid meet">
                            <defs>
                                ${timeSeriesData.map((_, i) => {
                                    const colors = [
                                        '#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c', '#0891b2', '#be123c', '#15803d', '#4338ca', '#b45309',
                                        '#6b21a8', '#0d9488', '#c2410c', '#1e40af', '#be185d', '#166534', '#7c2d12', '#581c87', '#0f766e', '#92400e',
                                        '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af'
                                    ];
                                    return `<clipPath id="clip${i}"><rect x="0" y="0" width="1000" height="400"/></clipPath>`;
                                }).join('')}
                            </defs>
                            <g id="chartGrid"></g>
                            <g id="chartLines"></g>
                            <g id="chartPoints"></g>
                        </svg>
                        <div class="chart-legend" id="chartLegend"></div>
                    </div>
                    <script>
                        (function() {
                            const data = ${JSON.stringify(timeSeriesData)};
                            const colors = [
                                '#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c', '#0891b2', '#be123c', '#15803d', '#4338ca', '#b45309',
                                '#6b21a8', '#0d9488', '#c2410c', '#1e40af', '#be185d', '#166534', '#7c2d12', '#581c87', '#0f766e', '#92400e',
                                '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af'
                            ];
                            const maxWords = Math.max(...data.flatMap(s => s.data.map(d => d.words)));
                            const padding = 60;
                            const chartWidth = 1000 - padding * 2;
                            const chartHeight = 400 - padding * 2;
                            const dataPoints = data[0]?.data.length || 0;
                            
                            const activeLines = new Set(data.map((_, i) => i));
                            
                            function renderChart() {
                                const gridSvg = document.getElementById('chartGrid');
                                const linesSvg = document.getElementById('chartLines');
                                const pointsSvg = document.getElementById('chartPoints');
                                
                                gridSvg.innerHTML = '';
                                linesSvg.innerHTML = '';
                                pointsSvg.innerHTML = '';
                                
                                // Grid lines
                                for (let i = 0; i <= 5; i++) {
                                    const y = padding + (chartHeight / 5) * i;
                                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                                    line.setAttribute('x1', padding);
                                    line.setAttribute('y1', y);
                                    line.setAttribute('x2', 1000 - padding);
                                    line.setAttribute('y2', y);
                                    line.setAttribute('class', 'chart-grid');
                                    gridSvg.appendChild(line);
                                }
                                
                                // X-axis labels
                                if (dataPoints > 0) {
                                    const skipFactor = Math.ceil(dataPoints / 12);
                                    data[0].data.forEach((point, i) => {
                                        if (i % skipFactor === 0 || i === dataPoints - 1) {
                                            const x = padding + (chartWidth / (dataPoints - 1)) * i;
                                            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                                            const monthLabel = point.month.split('-')[1] + '/' + point.month.split('-')[0].slice(2);
                                            text.setAttribute('x', x);
                                            text.setAttribute('y', 400 - padding + 20);
                                            text.setAttribute('class', 'chart-label');
                                            text.setAttribute('text-anchor', 'middle');
                                            text.textContent = monthLabel;
                                            gridSvg.appendChild(text);
                                        }
                                    });
                                }
                                
                                // Y-axis labels
                                for (let i = 0; i <= 5; i++) {
                                    const y = padding + (chartHeight / 5) * i;
                                    const value = Math.round((maxWords / 5) * (5 - i));
                                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                                    text.setAttribute('x', padding - 10);
                                    text.setAttribute('y', y + 4);
                                    text.setAttribute('class', 'chart-label');
                                    text.setAttribute('text-anchor', 'end');
                                    text.textContent = value.toLocaleString();
                                    gridSvg.appendChild(text);
                                }
                                
                                // Draw lines
                                data.forEach((series, seriesIndex) => {
                                    const color = colors[seriesIndex % colors.length];
                                    let pathData = '';
                                    
                                    series.data.forEach((point, i) => {
                                        const x = padding + (chartWidth / (dataPoints - 1)) * i;
                                        const y = padding + chartHeight - (point.words / maxWords) * chartHeight;
                                        pathData += (i === 0 ? 'M' : 'L') + x + ',' + y;
                                    });
                                    
                                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                                    path.setAttribute('d', pathData);
                                    path.setAttribute('class', 'line');
                                    path.setAttribute('stroke', color);
                                    path.setAttribute('data-series', seriesIndex);
                                    
                                     if (!activeLines.has(seriesIndex)) {
                                         path.classList.add('hidden');
                                     } else {
                                         // Only add hover effects if there are multiple active lines
                                         if (activeLines.size > 1) {
                                             path.addEventListener('mouseenter', () => {
                                                 document.querySelectorAll('.line').forEach(l => {
                                                     const lineSeries = parseInt(l.getAttribute('data-series'));
                                                     if (activeLines.has(lineSeries) && lineSeries !== seriesIndex) {
                                                         l.classList.add('faded');
                                                     }
                                                 });
                                                 path.classList.remove('faded');
                                             });
                                             path.addEventListener('mouseleave', () => {
                                                 document.querySelectorAll('.line').forEach(l => {
                                                     l.classList.remove('faded');
                                                 });
                                             });
                                         }
                                     }
                                    
                                    linesSvg.appendChild(path);
                                    
                                    // Add data points
                                    series.data.forEach((point, i) => {
                                        const x = padding + (chartWidth / (dataPoints - 1)) * i;
                                        const y = padding + chartHeight - (point.words / maxWords) * chartHeight;
                                        
                                        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                                        circle.setAttribute('cx', x);
                                        circle.setAttribute('cy', y);
                                        circle.setAttribute('r', 5);
                                        circle.setAttribute('fill', color);
                                        circle.setAttribute('class', 'data-point');
                                        circle.setAttribute('data-series', seriesIndex);
                                        
                                         if (!activeLines.has(seriesIndex)) {
                                             circle.classList.add('hidden');
                                         }
                                         
                                         circle.addEventListener('mouseenter', (e) => {
                                             // Only show tooltip if the line is active
                                             if (activeLines.has(seriesIndex)) {
                                                 const tooltip = document.getElementById('chartTooltip');
                                                 tooltip.style.display = 'block';
                                                 tooltip.textContent = series.participant + ': ' + point.words.toLocaleString() + ' words (' + point.month + ')';
                                                 const rect = e.target.getBoundingClientRect();
                                                 const chartRect = document.getElementById('timeSeriesChart').getBoundingClientRect();
                                                 tooltip.style.left = (rect.left - chartRect.left) + 'px';
                                                 tooltip.style.top = (rect.top - chartRect.top - 40) + 'px';
                                                 circle.style.opacity = '1';
                                             }
                                         });
                                         
                                         circle.addEventListener('mouseleave', () => {
                                             document.getElementById('chartTooltip').style.display = 'none';
                                             circle.style.opacity = '0';
                                         });
                                        
                                        pointsSvg.appendChild(circle);
                                    });
                                });
                            }
                            
                             function renderLegend() {
                                 const legend = document.getElementById('chartLegend');
                                 legend.innerHTML = '';
                                 
                                 // Add a "Select All" / "Deselect All" button for large groups
                                 if (data.length > 5) {
                                     const controlItem = document.createElement('div');
                                     controlItem.style.gridColumn = '1 / -1';
                                     controlItem.style.display = 'flex';
                                     controlItem.style.gap = '12px';
                                     controlItem.style.marginBottom = '8px';
                                     controlItem.style.paddingBottom = '8px';
                                     controlItem.style.borderBottom = '1px solid #e5e5e5';
                                     
                                     const selectAllBtn = document.createElement('button');
                                     selectAllBtn.textContent = 'Select All';
                                     selectAllBtn.style.padding = '4px 8px';
                                     selectAllBtn.style.fontSize = '12px';
                                     selectAllBtn.style.border = '1px solid #ccc';
                                     selectAllBtn.style.borderRadius = '3px';
                                     selectAllBtn.style.background = 'white';
                                     selectAllBtn.style.cursor = 'pointer';
                                     
                                     const deselectAllBtn = document.createElement('button');
                                     deselectAllBtn.textContent = 'Deselect All';
                                     deselectAllBtn.style.padding = '4px 8px';
                                     deselectAllBtn.style.fontSize = '12px';
                                     deselectAllBtn.style.border = '1px solid #ccc';
                                     deselectAllBtn.style.borderRadius = '3px';
                                     deselectAllBtn.style.background = 'white';
                                     deselectAllBtn.style.cursor = 'pointer';
                                     
                                     selectAllBtn.addEventListener('click', () => {
                                         data.forEach((_, i) => activeLines.add(i));
                                         renderLegend();
                                         renderChart();
                                     });
                                     
                                     deselectAllBtn.addEventListener('click', () => {
                                         activeLines.clear();
                                         renderLegend();
                                         renderChart();
                                     });
                                     
                                     controlItem.appendChild(selectAllBtn);
                                     controlItem.appendChild(deselectAllBtn);
                                     legend.appendChild(controlItem);
                                 }
                                 
                                 data.forEach((series, index) => {
                                     const color = colors[index % colors.length];
                                     const item = document.createElement('div');
                                     item.className = 'legend-item' + (activeLines.has(index) ? ' active' : ' inactive');
                                     item.style.color = color;
                                     
                                     item.innerHTML = 
                                         '<div class="legend-checkbox"></div>' +
                                         '<div class="legend-color" style="background: ' + color + '"></div>' +
                                         '<div class="legend-name">' + series.participant + '</div>';
                                     
                                     item.addEventListener('click', () => {
                                         if (activeLines.has(index)) {
                                             activeLines.delete(index);
                                         } else {
                                             activeLines.add(index);
                                         }
                                         renderLegend();
                                         renderChart();
                                     });
                                     
                                     legend.appendChild(item);
                                 });
                             }
                            
                            renderChart();
                            renderLegend();
                        })();
                    </script>
                </div>
                ` : ''}
                
                <div class="section">
                    <div class="section-title">Top Emojis</div>
                    ${hierarchicalData ? `
                    <div class="platform-toggle">
                        <button class="active" onclick="toggleSection('emojis', 'total')">Total</button>
                        ${hierarchicalData.overview.platforms.map(p => `
                            <button onclick="toggleSection('emojis', '${p.platform}')">${p.platform.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ` : ''}
                    <div class="grid-2" id="emojis-container">
                        ${metrics.topEmojis.slice(0, 24).map(item => `
                            <div class="emoji-item">
                                <span class="emoji">${item.emoji}</span>
                                <span class="count">${formatNumber(item.count)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-title">Common Words</div>
                    ${hierarchicalData ? `
                    <div class="platform-toggle">
                        <button class="active" onclick="toggleSection('words', 'total')">Total</button>
                        ${hierarchicalData.overview.platforms.map(p => `
                            <button onclick="toggleSection('words', '${p.platform}')">${p.platform.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ` : ''}
                    <div class="tags" id="words-container">
                        ${metrics.topWords.slice(0, 50).map(item => `
                            <span class="tag">${item.word} (${formatNumber(item.count)})</span>
                        `).join('')}
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-title">Link Domains</div>
                    ${hierarchicalData ? `
                    <div class="platform-toggle">
                        <button class="active" onclick="toggleSection('links', 'total')">Total</button>
                        ${hierarchicalData.overview.platforms.map(p => `
                            <button onclick="toggleSection('links', '${p.platform}')">${p.platform.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ` : ''}
                    <div class="tags" id="links-container">
                        ${metrics.linkDomains.slice(0, 24).map(item => `
                            <span class="tag green">${item.domain} (${formatNumber(item.count)})</span>
                        `).join('')}
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-title">Sessions</div>
                    
                    <div class="stats-row">
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(metrics.sessions.length)}</div>
                            <div class="stat-label">Total Sessions</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(Math.round(metrics.sessions.reduce((sum, s) => sum + s.messages, 0) / metrics.sessions.length))}</div>
                            <div class="stat-label">Avg Messages per Session</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatDuration(Math.round(metrics.sessions.reduce((sum, s) => sum + s.durationMs, 0) / metrics.sessions.length)).formatted}</div>
                            <div class="stat-label">Avg Duration per Session</div>
                        </div>
                    </div>
                    
                    <div class="stats-row" style="margin-top: 16px;">
                        <div class="stat-box">
                            <div class="stat-value">${formatDuration(Math.max(...metrics.sessions.map(s => s.durationMs))).formatted}</div>
                            <div class="stat-label">Longest Session</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(Math.max(...metrics.sessions.map(s => s.messages)))}</div>
                            <div class="stat-label">Most Messages in Session</div>
                        </div>
                    </div>
                    
                    <div style="margin: 24px 0;">
                        <div class="chart-label">Session Initiators</div>
                        <div class="tags" style="margin-top: 12px;">
                            ${metrics.sessionInitiators.map(item => `
                                <span class="tag">${item.user} (${formatNumber(item.sessionsStarted)})</span>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div style="margin-top: 24px;">
                        <div class="chart-label">All Sessions</div>
                        <div style="margin-bottom: 16px;">
                            <select id="sessionSort" onchange="sortSessions()" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; margin-right: 10px;">
                                <option value="newest">Newest first</option>
                                <option value="oldest">Oldest first</option>
                                <option value="most-messages">Most messages</option>
                                <option value="longest">Longest duration</option>
                                <option value="most-participants">Most participants</option>
                            </select>
                            <input type="text" id="sessionSearch" placeholder="Search sessions..." oninput="filterSessions()" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; width: 300px; margin-right: 10px;">
                            ${hierarchicalData ? `
                            <select id="sessionPlatformFilter" onchange="filterSessions()" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; margin-right: 10px;">
                                <option value="">All platforms</option>
                                ${hierarchicalData.overview.platforms.map(p => `<option value="${p.platform}">${p.platform.toUpperCase()}</option>`).join('')}
                            </select>
                            ` : ''}
                            <button onclick="clearSessionFilters()" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: pointer;">Clear</button>
                        </div>
                        <div id="sessionsContainer" style="max-height: 500px; overflow-y: auto; border: 1px solid #e5e5e5; border-radius: 6px;">
                            <div id="sessionList" class="session-list" style="margin: 0;">
                                <!-- Sessions will be rendered by JavaScript -->
                            </div>
                        </div>
                    </div>
              </div>
          </div>
          
          <div id="chat-simulator" class="page">
              <div class="section">
                  <div class="section-title">Message History</div>
                  <div style="margin-bottom: 20px;">
                      <input type="text" id="chatSearch" placeholder="Search messages..." style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; width: 300px; margin-right: 10px;">
                      <select id="participantFilter" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; margin-right: 10px;">
                          <option value="">All participants</option>
                          ${participants.map(p => `<option value="${p}">${p}</option>`).join('')}
                      </select>
                      ${hierarchicalData ? `
                      <select id="platformFilter" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; margin-right: 10px;">
                          <option value="">All platforms</option>
                          ${hierarchicalData.overview.platforms.map(p => `<option value="${p.platform}">${p.platform.toUpperCase()}</option>`).join('')}
                      </select>
                      ` : ''}
                      <select id="sortOrder" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; margin-right: 10px;">
                          <option value="oldest">Oldest first</option>
                          <option value="newest">Newest first</option>
                      </select>
                      <button onclick="clearFilters()" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: pointer;">Clear Filters</button>
                  </div>
                  <div id="chatContainer" style="height: 600px; overflow-y: auto; border: 1px solid #e5e5e5; padding: 16px; background: #fafafa;">
                      <div id="chatMessages"></div>
                  </div>
                  <div style="margin-top: 16px; text-align: center;">
                      <button id="loadMoreBtn" onclick="loadMoreMessages()" style="padding: 8px 16px; border: 1px solid #2563eb; border-radius: 4px; background: #2563eb; color: white; cursor: pointer;">Load More Messages</button>
                  </div>
              </div>
          </div>
          
          ${participants.map((participant, userIndex) => {
                // For hierarchical data, get user data from the overview
                let userData;
                if (hierarchicalData) {
                    const personData = hierarchicalData.perPerson.find(p => p.name === participant);
                    if (!personData) return '';
                    userData = {
                        messages: personData.totalMessages,
                        words: personData.totalWords,
                        characters: personData.totalCharacters,
                        emojis: personData.totalEmojis,
                        avgMsgLengthChars: personData.totalCharacters / Math.max(personData.totalMessages, 1),
                        questionRate: personData.crossPlatformMetrics?.questionRate || 0,
                        topWords: personData.platforms.flatMap(p => p.topWords).sort((a, b) => b.count - a.count).slice(0, 40),
                        topEmojis: [], // We'll need to get this from individual chats
                        activityHeatmap: personData.platforms[0]?.activityHeatmap || Array(7).fill(null).map(() => Array(24).fill(0)),
                        longestStreak: personData.platforms[0]?.longestStreak || 0,
                        currentStreak: personData.platforms[0]?.currentStreak || 0,
                        medianResponseSec: personData.crossPlatformMetrics?.medianResponseSec || 0,
                        avgResponseSec: personData.crossPlatformMetrics?.avgResponseSec || 0,
                        responseCount: personData.crossPlatformMetrics?.responseCount || 0,
                        topMentions: [],
                        mediaCounts: {},
                        responseBuckets: (personData.crossPlatformMetrics as any)?.responseBuckets || [0, 0, 0, 0, 0, 0]
                    };
                } else {
                    userData = metrics.byUser[participant];
                    if (!userData) return '';
                }
                
                // Generate time series data for this participant
                let participantTimeSeriesData = [];
                if (hierarchicalData) {
                    // For hierarchical data, use the pre-calculated time series data from all platforms
                    const personData = hierarchicalData.perPerson.find(p => p.name === participant);
                    if (personData && personData.platforms) {
                        // Combine time series data from all platforms
                        const allPlatformData = personData.platforms.flatMap(p => p.timeSeriesData || []);
                        const combinedData = new Map<string, number>();
                    
                        // Combine data from all platforms
                        allPlatformData.forEach(series => {
                        if (series.participant === participant) {
                            series.data.forEach(point => {
                            const key = point.month;
                            if (!combinedData.has(key)) {
                                combinedData.set(key, 0);
                            }
                            combinedData.set(key, combinedData.get(key) + point.words);
                            });
                        }
                        });
                    
                        // Convert back to array format
                        const sortedMonths = Array.from(combinedData.keys()).sort();
                        participantTimeSeriesData = sortedMonths.length > 0 ? [{
                        participant: participant,
                        data: sortedMonths.map(month => ({
                            month,
                            words: combinedData.get(month) || 0
                        }))
                        }] : [];
                    }
                } else {
                    // For single chat, use the existing logic
                    participantTimeSeriesData = parsedChat ? generateTimeSeriesData(parsedChat) : [];
                }
                
                // Force the section to show up if we have hierarchical data
                if (hierarchicalData && participantTimeSeriesData.length === 0) {
                    // Create dummy data to show the section
                    participantTimeSeriesData = [{
                        participant: participant,
                        data: [{ month: '2024-01', words: 0 }]
                    }];
                }
                
                return `
            <div id="user-${userIndex}" class="page">
                <div class="user-header">
                    <div class="user-avatar">${participant.charAt(0).toUpperCase()}</div>
                    <div class="user-name">${participant}</div>
                </div>

                
                <div class="section">
                    <div class="stats-row">
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(userData.messages)}</div>
                            <div class="stat-label">Messages</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(userData.words)}</div>
                            <div class="stat-label">Words</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(userData.characters)}</div>
                            <div class="stat-label">Characters</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(userData.emojis)}</div>
                            <div class="stat-label">Emojis</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(Math.round(userData.avgMsgLengthChars))}</div>
                            <div class="stat-label">Avg. Message Length</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${(userData.questionRate * 100).toFixed(1)}%</div>
                          <div class="stat-label">Question Rate</div>
                      </div>
                  </div>
                  
                  ${hierarchicalData ? `
                  <div class="platform-breakdown">
                      <h4>Platform Breakdown</h4>
                      ${(() => {
                          const personData = hierarchicalData.perPerson.find(p => p.name === participant);
                          if (!personData) return '';
                          return `
                              <div class="stats-row">
                                  ${personData.platforms.map(p => `
                                      <div class="stat-box">
                                          <div class="stat-value">${p.messages.toLocaleString()}</div>
                                          <div class="stat-label">${p.platform.charAt(0).toUpperCase() + p.platform.slice(1)} Messages</div>
                                      </div>
                                  `).join('')}
                              </div>
                          `;
                      })()}
                  </div>
                  ` : ''}
              </div>
              
              <div class="section">
                  <div class="section-title">Most Used Words</div>
                  ${hierarchicalData ? `
                  <div class="platform-toggle">
                      <button onclick="toggleUserSection('words-${userIndex}', 'total')" class="active">Total</button>
                      ${hierarchicalData.overview.platforms.map(p => `
                          <button onclick="toggleUserSection('words-${userIndex}', '${p.platform}')">${p.platform.toUpperCase()}</button>
                      `).join('')}
                  </div>
                  ` : ''}
                  <div class="tags" id="words-${userIndex}">
                      ${userData.topWords.slice(0, 40).map(item => `
                          <span class="tag">${item.word} (${formatNumber(item.count)})</span>
                      `).join('')}
                  </div>
              </div>
  
              ${Array.isArray(userData.topMentions) && userData.topMentions.length > 0 ? `
              <div class="section">
                  <div class="section-title">Most Used Mentions</div>
                  <div class="tags">
                      ${userData.topMentions.slice(0, 30).map(item => `
                          <span class="tag">@${item.mention} (${formatNumber(item.count)})</span>
                      `).join('')}
                  </div>
              </div>
              ` : ''}
              
              ${userData.mediaCounts && Object.keys(userData.mediaCounts).length > 0 ? `
              <div class="section">
                  <div class="section-title">Media Shared</div>
                  <div class="tags">
                      ${Object.entries(userData.mediaCounts as Record<string, number>)
                          .sort((a, b) => b[1] - a[1])
                          .map(([mediaType, count]) => `
                          <span class="tag">${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} (${formatNumber(count)})</span>
                      `).join('')}
                  </div>
              </div>
              ` : ''}
  
                <div class="section">
                    <div class="section-title">Response Time</div>
                    ${hierarchicalData ? `
                    <div class="platform-toggle">
                        <button onclick="toggleUserSection('response-${userIndex}', 'total')" class="active">Total</button>
                        ${hierarchicalData.overview.platforms.map(p => `
                            <button onclick="toggleUserSection('response-${userIndex}', '${p.platform}')">${p.platform.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ` : ''}
                    <div style="color:#666; font-size:13px; margin:4px 0 12px;">
                        Replies are measured when this person sends a message within 24 hours of the previous message from someone else in the chat (system messages excluded). The histogram shows how many of their replies fall into each bucket. This count is replies only and may be lower than their total messages (not every message is a reply).
                    </div>
                    <div class="stats-row">
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(Math.round(userData.medianResponseSec ?? 0))}s</div>
                            <div class="stat-label">Median</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(Math.round(userData.avgResponseSec ?? 0))}s</div>
                            <div class="stat-label">Average</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(userData.responseCount ?? 0)}</div>
                            <div class="stat-label">Replies Counted</div>
                        </div>
                    </div>
                    ${Array.isArray(userData.responseBuckets) ? `
                    <div class="chart-wrapper" id="response-${userIndex}">
                        <div class="bar-chart" style="height:160px">
                            ${['<5m','<15m','<1h','<6h','<24h','>24h'].map((label, i) => {
                                const buckets = userData.responseBuckets || [0,0,0,0,0,0];
                                const max = Math.max(1, ...buckets);
                                const count = buckets[i] ?? 0;
                                return `
                                <div class="bar-item">
                                    <div class="bar" style="height:${(count / max) * 100}%">
                                        <div class="bar-count">${formatNumber(count)}</div>
                                    </div>
                                    <div class="bar-label">${label}</div>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>` : ''}
                </div>
                
                <div class="section">
                    <div class="section-title">Activity Heatmap</div>
                    ${hierarchicalData ? `
                    <div class="platform-toggle">
                        <button onclick="toggleUserSection('heatmap-${userIndex}', 'total')" class="active">Total</button>
                        ${hierarchicalData.overview.platforms.map(p => `
                            <button onclick="toggleUserSection('heatmap-${userIndex}', '${p.platform}')">${p.platform.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ` : ''}
                    <div style="color:#666; font-size:13px; margin:4px 0 12px;">
                        Shows when this person is most active throughout the week. Darker colors indicate more messages.
                    </div>
                    ${Array.isArray(userData.activityHeatmap) ? `
                    <div class="heatmap-container" id="heatmap-${userIndex}">
                        <div class="heatmap">
                            <div class="heatmap-header">
                                <div class="heatmap-time-labels">
                                    ${Array.from({ length: 24 }, (_, i) => {
                                        const period = i >= 12 ? 'PM' : 'AM';
                                        const hour12 = (i % 12) === 0 ? 12 : (i % 12);
                                        return `<div class=\"time-label\">${hour12}${period}</div>`;
                                    }).join('')}
                                </div>
                            </div>
                            <div class="heatmap-grid">
                                ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, dayIdx) => `
                                    <div class="heatmap-day">
                                        <div class="day-label">${day}</div>
                                        <div class="heatmap-hours">
                                            ${(userData.activityHeatmap || Array(7).fill(null).map(() => Array(24).fill(0)))[dayIdx].map((count, hourIdx) => {
                                                const heatmap = userData.activityHeatmap || Array(7).fill(null).map(() => Array(24).fill(0));
                                                const maxCount = Math.max(...heatmap.flat());
                                                const intensity = maxCount > 0 ? count / maxCount : 0;
                                                const opacity = Math.max(0.1, intensity);
                                                return `<div class="heatmap-cell" style="background-color: rgba(37,99,235, ${opacity})" data-count="${count}"></div>`;
                                            }).join('')}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>` : ''}
                </div>
                
                <div class="section">
                    <div class="section-title">Daily Streaks</div>
                    ${hierarchicalData ? `
                    <div class="platform-toggle">
                        <button onclick="toggleUserSection('streaks-${userIndex}', 'total')" class="active">Total</button>
                        ${hierarchicalData.overview.platforms.map(p => `
                            <button onclick="toggleUserSection('streaks-${userIndex}', '${p.platform}')">${p.platform.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ` : ''}
                    <div class="stats-row" id="streaks-${userIndex}">
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(userData.longestStreak ?? 0)}</div>
                            <div class="stat-label">Longest Streak</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${formatNumber(userData.currentStreak ?? 0)}</div>
                            <div class="stat-label">Current Streak</div>
                        </div>
                    </div>
                </div>
  
              ${participantTimeSeriesData.length > 0 ? `
              <div class="section">
                  <div class="section-title">Monthly Change in Words</div>
                  ${hierarchicalData ? `
                  <div class="platform-toggle">
                      <button onclick="toggleUserSection('delta-${userIndex}', 'total')" class="active">Total</button>
                      ${hierarchicalData.overview.platforms.map(p => `
                          <button onclick="toggleUserSection('delta-${userIndex}', '${p.platform}')">${p.platform.toUpperCase()}</button>
                      `).join('')}
                  </div>
                  ` : ''}
                  <div class="line-chart" id="userDelta-${userIndex}">
                      <svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid meet">
                          <g id="user-delta-grid-${userIndex}"></g>
                          <g id="user-delta-bars-${userIndex}"></g>
                      </svg>
                  </div>
                  <script>(function(){
                      const allSeries = ${JSON.stringify(participantTimeSeriesData)};
                      const series = allSeries.find(s => s.participant === ${JSON.stringify(participant)});
                      if (!series) return;
                      const months = series.data.map(d => d.month);
                      const deltas = series.data.map((d,i) => i===0 ? 0 : d.words - series.data[i-1].words);
                      const padding = 70;
                      const width = 1200 - padding * 2;
                      const height = 420 - padding * 2;
                      const ox = padding, oy = padding;
                      const maxAbs = Math.max(1, ...deltas.map(v => Math.abs(v)));
  
                      const svg = document.querySelector('#userDelta-${userIndex} svg');
                      const grid = document.getElementById('user-delta-grid-${userIndex}');
                      const bars = document.getElementById('user-delta-bars-${userIndex}');
  
                      // Create tooltip
                      const tooltip = document.createElement('div');
                      tooltip.id = 'deltaTooltip-${userIndex}';
                      tooltip.style.cssText = 'position: absolute; background: rgba(0,0,0,0.8); color: white; padding: 8px; border-radius: 4px; font-size: 12px; pointer-events: none; z-index: 1000; display: none;';
                      document.querySelector('#userDelta-${userIndex}').appendChild(tooltip);
  
                      // Calculate bar positions - one bar per month
                      const barWidth = (width / months.length) * 0.8;
                      const barSpacing = width / months.length;
                      
                      function sx(i){ return ox + (i * barSpacing) + (barSpacing - barWidth) / 2; }
                      function sy(v){ return oy + height/2 - (v / (maxAbs*1.1)) * (height/2); }
  
                      // zero line
                      const zeroY = sy(0);
                      const zl = document.createElementNS('http://www.w3.org/2000/svg','line');
                      zl.setAttribute('x1', String(ox)); zl.setAttribute('x2', String(ox + width));
                      zl.setAttribute('y1', String(zeroY)); zl.setAttribute('y2', String(zeroY));
                      zl.setAttribute('class','grid-line'); zl.setAttribute('stroke-width','2');
                      grid.appendChild(zl);
  
                      // horizontal grid lines and labels
                      for (let i=1;i<=4;i++){
                          const yPos = sy(maxAbs*i/4);
                          const nPos = sy(-maxAbs*i/4);
                          
                          // Grid lines
                          const gl1 = document.createElementNS('http://www.w3.org/2000/svg','line');
                          gl1.setAttribute('x1', String(ox)); gl1.setAttribute('x2', String(ox + width));
                          gl1.setAttribute('y1', String(yPos)); gl1.setAttribute('y2', String(yPos));
                          gl1.setAttribute('class','grid-line'); gl1.setAttribute('opacity','0.3');
                          grid.appendChild(gl1);
                          
                          const gl2 = document.createElementNS('http://www.w3.org/2000/svg','line');
                          gl2.setAttribute('x1', String(ox)); gl2.setAttribute('x2', String(ox + width));
                          gl2.setAttribute('y1', String(nPos)); gl2.setAttribute('y2', String(nPos));
                          gl2.setAttribute('class','grid-line'); gl2.setAttribute('opacity','0.3');
                          grid.appendChild(gl2);
                          
                          // Labels
                          const t1 = document.createElementNS('http://www.w3.org/2000/svg','text');
                          t1.setAttribute('x', String(ox-8)); t1.setAttribute('y', String(yPos+4));
                          t1.setAttribute('text-anchor','end'); t1.setAttribute('class','chart-label');
                          t1.textContent = Math.round(maxAbs*i/4).toLocaleString(); 
                          grid.appendChild(t1);
                          
                          const t2 = document.createElementNS('http://www.w3.org/2000/svg','text');
                          t2.setAttribute('x', String(ox-8)); t2.setAttribute('y', String(nPos+4));
                          t2.setAttribute('text-anchor','end'); t2.setAttribute('class','chart-label');
                          t2.textContent = ('-' + Math.round(maxAbs*i/4).toLocaleString()); 
                          grid.appendChild(t2);
                      }
  
                      // vertical grid lines and x labels
                      const step = Math.max(1, Math.ceil(months.length / 12));
                      months.forEach((m, idx) => {
                          const x = ox + (idx * barSpacing) + barSpacing/2;
                          
                          // Vertical grid line
                          const vl = document.createElementNS('http://www.w3.org/2000/svg','line');
                          vl.setAttribute('x1', String(x)); vl.setAttribute('x2', String(x));
                          vl.setAttribute('y1', String(oy)); vl.setAttribute('y2', String(oy + height));
                          vl.setAttribute('class','grid-line'); vl.setAttribute('opacity','0.2');
                          grid.appendChild(vl);
                          
                          // X-axis labels (sparse)
                          if (idx % step === 0) {
                              const lbl = document.createElementNS('http://www.w3.org/2000/svg','text');
                              lbl.setAttribute('x', String(x)); lbl.setAttribute('y', String(oy + height + 24));
                              lbl.setAttribute('text-anchor','middle'); lbl.setAttribute('class','chart-label');
                              lbl.textContent = m; 
                              grid.appendChild(lbl);
                          }
                      });
  
                      // bars with hover
                      deltas.forEach((v, idx) => {
                          const x = sx(idx);
                          const y0 = sy(0);
                          const y1 = sy(v);
                          const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
                          rect.setAttribute('x', String(x));
                          rect.setAttribute('width', String(barWidth));
                          rect.setAttribute('y', String(Math.min(y0, y1)));
                          rect.setAttribute('height', String(Math.abs(y1 - y0)));
                          rect.setAttribute('fill', v>=0 ? '#059669' : '#dc2626');
                          rect.setAttribute('opacity','0.85');
                          rect.setAttribute('cursor','pointer');
                          
                          // Hover events
                          rect.addEventListener('mouseenter', (e) => {
                              tooltip.style.display = 'block';
                              tooltip.textContent = months[idx] + ': ' + (v>=0 ? '+' : '') + v.toLocaleString() + ' words';
                              const rectBounds = e.target.getBoundingClientRect();
                              const containerBounds = document.querySelector('#userDelta-${userIndex}').getBoundingClientRect();
                              tooltip.style.left = (rectBounds.left - containerBounds.left + rectBounds.width/2) + 'px';
                              tooltip.style.top = (rectBounds.top - containerBounds.top - 40) + 'px';
                          });
                          
                          rect.addEventListener('mouseleave', () => {
                              tooltip.style.display = 'none';
                          });
                          
                          bars.appendChild(rect);
                      });
                  })();</script>
              </div>
              ` : ''}
          </div>
              `;
          }).join('')}
      </div>
      
    <script>
        // Message History data
        let chatData = ${JSON.stringify(metrics.messages)};
        let sessionsData = ${JSON.stringify(metrics.sessions)};
        
        ${hierarchicalData ? `
        // For hierarchical data, combine messages and sessions from all individual chats
        const hierarchicalData = ${JSON.stringify(hierarchicalData)};
        const parsedChatsData = ${JSON.stringify(parsedChats || [])};
        
        console.log('Hierarchical data:', hierarchicalData);
        console.log('Individual chats length:', hierarchicalData.individualChats ? hierarchicalData.individualChats.length : 'undefined');
        
        if (hierarchicalData && hierarchicalData.individualChats) {
            // Combine all messages and sessions from all platforms
            const allMessages = [];
            const allSessions = [];
            
            hierarchicalData.individualChats.forEach((chat, chatIndex) => {
                console.log('Processing chat', chatIndex, ':', chat.platform);
                console.log('Chat has metrics?', chat.metrics ? 'YES' : 'NO');
                console.log('Chat has sessions?', chat.metrics && chat.metrics.sessions ? 'YES' : 'NO');
                
                if (chat.metrics && chat.metrics.sessions) {
                    console.log('Found sessions for chat', chatIndex, ':', chat.metrics.sessions.length);
                    // Add platform info to each session if it doesn't already have it
                    const sessionsWithPlatform = chat.metrics.sessions.map(session => ({
                        ...session,
                        platform: session.platform || chat.platform
                    }));
                    console.log('First session structure:', sessionsWithPlatform[0]);
                    allSessions.push(...sessionsWithPlatform);
                } else {
                    console.log('No sessions found for chat', chatIndex);
                }
                
                // Get the original parsed chat data for messages
                const originalChat = parsedChatsData[chatIndex];
                if (originalChat && originalChat.messages) {
                    // Add platform info to each message
                    const messagesWithPlatform = originalChat.messages.map(msg => ({
                        ...msg,
                        platform: chat.platform
                    }));
                    allMessages.push(...messagesWithPlatform);
                }
            });
            
            // Sort all messages by timestamp
            allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            // Sort all sessions by start time
            allSessions.sort((a, b) => new Date(a.start) - new Date(b.start));
            
            console.log('Combined sessions:', allSessions.length);
            console.log('First few sessions:', allSessions.slice(0, 3));
            
            chatData = allMessages;
            sessionsData = allSessions;
            
            // Update the global session variables
            window.allSessions = allSessions;
            window.filteredSessions = allSessions;
        }
        ` : ''}
        let currentMessageIndex = 0;
        const messagesPerLoad = 200;
        let filteredMessages = chatData;
        let sortOrder = 'oldest';
        let isLoading = false;
        
        function showPage(pageId) {
            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            document.querySelectorAll('.tabs button').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById(pageId).classList.add('active');
            event.target.classList.add('active');
            
            // Initialize message history when switching to it
            if (pageId === 'chat-simulator') {
                initializeMessageHistory();
            }
        }
        
        function initializeMessageHistory() {
            currentMessageIndex = 0;
            filteredMessages = chatData;
            document.getElementById('chatMessages').innerHTML = '';
            loadMoreMessages();
            
            // Add event listeners
            document.getElementById('chatSearch').addEventListener('input', filterMessages);
            document.getElementById('participantFilter').addEventListener('change', filterMessages);
            const platformFilterElement = document.getElementById('platformFilter');
            if (platformFilterElement) {
                platformFilterElement.addEventListener('change', filterMessages);
            }
            document.getElementById('sortOrder').addEventListener('change', function() {
                sortOrder = this.value;
                filterMessages();
            });
            
            // Add scroll listener for auto-loading
            const chatContainer = document.getElementById('chatContainer');
            chatContainer.addEventListener('scroll', function() {
                if (this.scrollTop + this.clientHeight >= this.scrollHeight - 100 && !isLoading) {
                    loadMoreMessages();
                }
            });
        }
        
        function loadMoreMessages() {
            if (isLoading || currentMessageIndex >= filteredMessages.length) return;
            
            isLoading = true;
            const container = document.getElementById('chatMessages');
            const endIndex = Math.min(currentMessageIndex + messagesPerLoad, filteredMessages.length);
            
            for (let i = currentMessageIndex; i < endIndex; i++) {
                const message = filteredMessages[i];
                const messageElement = createMessageElement(message, i);
                container.appendChild(messageElement);
            }
            
            currentMessageIndex = endIndex;
            isLoading = false;
            
            // Hide load more button if all messages are loaded
            const loadMoreBtn = document.getElementById('loadMoreBtn');
            if (currentMessageIndex >= filteredMessages.length) {
                loadMoreBtn.style.display = 'none';
            } else {
                loadMoreBtn.style.display = 'inline-block';
            }
        }
        
        function createMessageElement(message, index) {
            const div = document.createElement('div');
            div.className = 'chat-message';
            div.dataset.sessionIndex = message.sessionIndex;
            div.dataset.messageIndex = index;
            
            const timestamp = new Date(message.timestamp).toLocaleString();
            const sender = message.from || 'System';
            const isSystem = message.isSystem;
            const isMedia = message.isMediaNotice;
            
            // Highlight search terms in message content
            const searchTerm = document.getElementById('chatSearch').value;
            let displayText = isMedia ? '<em>Media message</em>' : message.text;
            
            if (searchTerm && !isMedia) {
                const lowerText = message.text.toLowerCase();
                const lowerSearch = searchTerm.toLowerCase();
                const index = lowerText.indexOf(lowerSearch);
                if (index !== -1) {
                    const before = message.text.substring(0, index);
                    const match = message.text.substring(index, index + searchTerm.length);
                    const after = message.text.substring(index + searchTerm.length);
                    displayText = \`\${before}<mark style="background-color: #ffeb3b; padding: 1px 2px; border-radius: 2px;">\${match}</mark>\${after}\`;
                }
            }
            
            const platformInfo = message.platform ? \`<span style="font-size: 10px; background: #e3f2fd; color: #1976d2; padding: 2px 6px; border-radius: 3px; margin-left: 8px;">\${message.platform.toUpperCase()}</span>\` : '';
            
            div.innerHTML = \`
                <div class="message-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="display: flex; align-items: center;">
                        <span class="message-sender" style="font-weight: 600; color: \${isSystem ? '#666' : '#2563eb'};">\${sender}</span>
                        \${platformInfo}
                    </div>
                    <span class="message-time" style="font-size: 12px; color: #666;">\${timestamp}</span>
                </div>
                <div class="message-content" style="margin-left: 8px; color: \${isSystem ? '#666' : '#333'};">
                    \${displayText}
                </div>
            \`;
            
            return div;
        }
        
        function filterMessages() {
            const searchTerm = document.getElementById('chatSearch').value.toLowerCase();
            const participantFilter = document.getElementById('participantFilter').value;
            const platformFilterElement = document.getElementById('platformFilter');
            const platformFilter = platformFilterElement ? platformFilterElement.value : '';
            
            filteredMessages = chatData.filter(message => {
                // Search only in message content, not participant names
                const matchesSearch = !searchTerm || 
                    message.text.toLowerCase().includes(searchTerm);
                
                const matchesParticipant = !participantFilter || 
                    message.from === participantFilter;
                
                const matchesPlatform = !platformFilter || 
                    message.platform === platformFilter;
                
                return matchesSearch && matchesParticipant && matchesPlatform;
            });
            
            // Sort messages based on selected order
            if (sortOrder === 'oldest') {
                filteredMessages = filteredMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            } else {
                filteredMessages = filteredMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }
            
            // Reset and reload
            currentMessageIndex = 0;
            document.getElementById('chatMessages').innerHTML = '';
            loadMoreMessages();
        }
        
        function clearFilters() {
            document.getElementById('chatSearch').value = '';
            document.getElementById('participantFilter').value = '';
            const platformFilterElement = document.getElementById('platformFilter');
            if (platformFilterElement) {
                platformFilterElement.value = '';
            }
            document.getElementById('sortOrder').value = 'oldest';
            sortOrder = 'oldest';
            filterMessages();
        }
        
        function highlightSession(sessionIndex) {
            // Get session data from the filtered sessions (since we're using filteredSessions for display)
            const session = window.filteredSessions ? window.filteredSessions[sessionIndex] : sessionsData[sessionIndex];
            if (!session) return;
            
            // Get messages for this session by matching timestamp range
            const sessionStart = new Date(session.start);
            const sessionEnd = new Date(session.end);
            const sessionMessages = chatData.filter(msg => {
                const msgTime = new Date(msg.timestamp);
                return msgTime >= sessionStart && msgTime <= sessionEnd;
            });
            
            // Create modal
            const modal = document.createElement('div');
            modal.id = 'sessionModal';
            modal.style.cssText = \`
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            \`;
            
            modal.innerHTML = \`
                <div style="
                    background: white;
                    border-radius: 8px;
                    max-width: 800px;
                    max-height: 80vh;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                ">
                    <div style="
                        padding: 20px;
                        border-bottom: 1px solid #e5e5e5;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <div>
                            <h3 style="margin: 0; color: #111;">Session Details</h3>
                            <p style="margin: 4px 0 0 0; color: #666; font-size: 14px;">
                                \${new Date(session.start).toLocaleString()} - \${new Date(session.end).toLocaleString()}
                            </p>
                        </div>
                        <button onclick="closeSessionModal()" style="
                            background: none;
                            border: none;
                            font-size: 24px;
                            cursor: pointer;
                            color: #666;
                            padding: 0;
                            width: 30px;
                            height: 30px;
                        ">×</button>
                    </div>
                    <div style="
                        padding: 20px;
                        flex: 1;
                        overflow-y: auto;
                        background: #fafafa;
                    ">
                        <div style="
                            display: flex;
                            gap: 16px;
                            margin-bottom: 16px;
                            flex-wrap: wrap;
                        ">
                            <div style="
                                background: white;
                                padding: 12px;
                                border-radius: 6px;
                                border: 1px solid #e5e5e5;
                                min-width: 120px;
                            ">
                                <div style="font-weight: 600; color: #111;">\${formatNumber(session.messages)}</div>
                                <div style="font-size: 12px; color: #666;">Messages</div>
                            </div>
                            <div style="
                                background: white;
                                padding: 12px;
                                border-radius: 6px;
                                border: 1px solid #e5e5e5;
                                min-width: 120px;
                            ">
                                <div style="font-weight: 600; color: #111;">\${formatDuration(session.durationMs).formatted}</div>
                                <div style="font-size: 12px; color: #666;">Duration</div>
                            </div>
                            <div style="
                                background: white;
                                padding: 12px;
                                border-radius: 6px;
                                border: 1px solid #e5e5e5;
                                min-width: 120px;
                            ">
                                <div style="font-weight: 600; color: #111;">\${session.participants.length}</div>
                                <div style="font-size: 12px; color: #666;">Participants</div>
                            </div>
                        </div>
                        <div style="
                            background: white;
                            border-radius: 6px;
                            border: 1px solid #e5e5e5;
                            max-height: 400px;
                            overflow-y: auto;
                        ">
                            \${sessionMessages.map(msg => \`
                                <div style="
                                    padding: 12px 16px;
                                    border-bottom: 1px solid #f0f0f0;
                                    display: flex;
                                    justify-content: space-between;
                                    align-items: flex-start;
                                ">
                                    <div style="flex: 1;">
                                        <div style="
                                            display: flex;
                                            align-items: center;
                                            gap: 8px;
                                            margin-bottom: 4px;
                                        ">
                                            <span style="
                                                font-weight: 600;
                                                color: \${msg.isSystem ? '#666' : '#2563eb'};
                                            ">\${msg.from || 'System'}</span>
                                            <span style="
                                                font-size: 12px;
                                                color: #666;
                                            ">\${new Date(msg.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        <div style="
                                            color: \${msg.isSystem ? '#666' : '#333'};
                                            line-height: 1.4;
                                        ">
                                            \${msg.isMediaNotice ? \`<em>\${msg.text}</em>\` : msg.text}
                                        </div>
                                    </div>
                                </div>
                            \`).join('')}
                        </div>
                    </div>
                </div>
            \`;
            
            document.body.appendChild(modal);
            
            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeSessionModal();
                }
            });
        }
        
        function closeSessionModal() {
            const modal = document.getElementById('sessionModal');
            if (modal) {
                modal.remove();
            }
        }
        
        // Utility functions for the modal
        function formatNumber(num) {
            return num.toLocaleString();
        }
        
        function formatDuration(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (days > 0) {
                return { formatted: \`\${days}d \${hours % 24}h \${minutes % 60}m\` };
            } else if (hours > 0) {
                return { formatted: \`\${hours}h \${minutes % 60}m\` };
            } else if (minutes > 0) {
                return { formatted: \`\${minutes}m \${seconds % 60}s\` };
            } else {
                return { formatted: \`\${seconds}s\` };
            }
        }
        
        // Page navigation
        function showPage(pageId) {
            // Hide all pages
            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            
            // Remove active class from all tab buttons
            document.querySelectorAll('.tabs button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Show the selected page
            const targetPage = document.getElementById(pageId);
            if (targetPage) {
                targetPage.classList.add('active');
            }
            
            // Add active class to the clicked tab button
            event.target.classList.add('active');
        }
        
         // Session management
         let allSessions = sessionsData;
         let filteredSessions = allSessions;
         
         console.log('Sessions data loaded:', allSessions.length, 'sessions');
         console.log('First few sessions:', allSessions.slice(0, 3));
        
        // Chart data for platform toggles
        window.chartData = {
            hourly: {
                total: ${JSON.stringify(hourlyData)}
                ${hierarchicalData ? ',' + hierarchicalData.perPlatform.map(platform => `
                ${platform.platform}: ${JSON.stringify(formatHourlyHistogram(platform.hourlyHistogram))}`).join(',') : ''}
            },
            weekday: {
                total: ${JSON.stringify(weekdayData)}
                ${hierarchicalData ? ',' + hierarchicalData.perPlatform.map(platform => `
                ${platform.platform}: ${JSON.stringify(formatWeekdayHistogram(platform.weekdayHistogram))}`).join(',') : ''}
            },
            emojis: {
                total: ${JSON.stringify(metrics.topEmojis.slice(0, 24))}
                ${hierarchicalData ? ',' + hierarchicalData.perPlatform.map(platform => `
                ${platform.platform}: ${JSON.stringify(platform.topEmojis.slice(0, 24))}`).join(',') : ''}
            },
            words: {
                total: ${JSON.stringify(metrics.topWords.slice(0, 50))}
                ${hierarchicalData ? ',' + hierarchicalData.perPlatform.map(platform => `
                ${platform.platform}: ${JSON.stringify(platform.topWords.slice(0, 50))}`).join(',') : ''}
            },
            links: {
                total: ${JSON.stringify(metrics.linkDomains.slice(0, 24))}
                ${hierarchicalData ? ',' + hierarchicalData.perPlatform.map(platform => `
                ${platform.platform}: ${JSON.stringify(platform.linkDomains.slice(0, 24))}`).join(',') : ''}
            }
        };
        
        function sortSessions() {
            const sortBy = document.getElementById('sessionSort').value;
            
            // Get the current filtered sessions
            const currentFilteredSessions = window.filteredSessions || sessionsData;
            
            // Sort the filtered sessions
            const sortedSessions = [...currentFilteredSessions].sort((a, b) => {
                switch (sortBy) {
                    case 'newest':
                        return new Date(b.start) - new Date(a.start);
                    case 'oldest':
                        return new Date(a.start) - new Date(b.start);
                    case 'most-messages':
                        return b.messages - a.messages;
                    case 'longest':
                        return b.durationMs - a.durationMs;
                    case 'most-participants':
                        return b.participants.length - a.participants.length;
                    default:
                        return 0;
                }
            });
            
            // Update the filtered sessions with sorted results
            window.filteredSessions = sortedSessions;
            
            console.log('Sorted sessions:', sortedSessions.length, 'sessions');
            console.log('First few sorted sessions:', sortedSessions.slice(0, 3).map(s => ({ 
                start: s.start, 
                messages: s.messages, 
                platform: s.platform 
            })));
            
            renderSessions();
        }
        
        function filterSessions() {
            const searchTerm = document.getElementById('sessionSearch').value.toLowerCase();
            const platformFilterElement = document.getElementById('sessionPlatformFilter');
            const platformFilter = platformFilterElement ? platformFilterElement.value : '';
            
            const allSessions = window.allSessions || sessionsData;
            
            console.log('Filtering sessions with platform filter:', platformFilter);
            console.log('Total sessions before filter:', allSessions.length);
            console.log('Sample session platforms:', allSessions.slice(0, 5).map(s => s.platform));
            
            window.filteredSessions = allSessions.filter(session => {
                const dateStr = new Date(session.start).toLocaleDateString() + ' ' + new Date(session.end).toLocaleDateString();
                const participantsStr = session.participants.join(' ').toLowerCase();
                
                const matchesSearch = !searchTerm || 
                    dateStr.toLowerCase().includes(searchTerm) || 
                    participantsStr.includes(searchTerm) ||
                    session.messages.toString().includes(searchTerm);
                
                const matchesPlatform = !platformFilter || 
                    session.platform === platformFilter;
                
                if (platformFilter && !matchesPlatform) {
                    console.log('Session filtered out - platform mismatch:', session.platform, 'vs', platformFilter);
                }
                
                return matchesSearch && matchesPlatform;
            });
            
            console.log('Sessions after filter:', window.filteredSessions.length);
            
            sortSessions();
            renderSessions();
        }
        
        function clearSessionFilters() {
            document.getElementById('sessionSort').value = 'newest';
            document.getElementById('sessionSearch').value = '';
            const platformFilterElement = document.getElementById('sessionPlatformFilter');
            if (platformFilterElement) {
                platformFilterElement.value = '';
            }
            window.filteredSessions = window.allSessions || sessionsData;
            renderSessions();
        }
        
         function renderSessions() {
             const container = document.getElementById('sessionList');
             if (!container) {
                 console.error('Session list container not found');
                 return;
             }
             
             const filteredSessions = window.filteredSessions || sessionsData;
             const allSessions = window.allSessions || sessionsData;
             
             console.log('Rendering sessions:', filteredSessions.length, 'sessions');
             
             if (filteredSessions.length === 0) {
                 container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No sessions found</div>';
                 return;
             }
             
             container.innerHTML = filteredSessions.map((session, index) => {
                 const platformTag = session.platform ? \`<span style="font-size: 10px; background: #e3f2fd; color: #1976d2; padding: 2px 6px; border-radius: 3px; margin-left: 8px;">\${session.platform.toUpperCase()}</span>\` : '';
                 
                 return \`
                     <div class="session-item" onclick="highlightSession(\${index})" style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='#fafafa'">
                         <div class="session-date" style="display: flex; align-items: center;">
                             \${new Date(session.start).toLocaleDateString()} - \${new Date(session.end).toLocaleDateString()}
                             \${platformTag}
                         </div>
                         <div class="session-meta">
                             <span>\${formatNumber(session.messages)} messages</span>
                             <span>\${formatDuration(session.durationMs).formatted}</span>
                             <span>\${session.participants.length} participants</span>
                         </div>
                         <div class="session-participants" style="margin-top: 8px; font-size: 12px; color: #666;">
                             \${session.participants.slice(0, 3).join(', ')}\${session.participants.length > 3 ? \` +\${session.participants.length - 3} more\` : ''}
                         </div>
                     </div>
                 \`;
             }).join('');
         }
        
        // Make functions globally available
        window.highlightSession = highlightSession;
        window.closeSessionModal = closeSessionModal;
        window.sortSessions = sortSessions;
        window.filterSessions = filterSessions;
        window.clearSessionFilters = clearSessionFilters;
        
        // Platform toggle functionality
        function toggleChart(chartType, platform) {
            // Remove active class from all buttons in the same toggle group
            const toggleGroup = event.target.parentElement;
            toggleGroup.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            event.target.classList.add('active');
            
            // Update the chart data based on platform
            if (chartType === 'hourly') {
                updateHourlyChart(platform);
            } else if (chartType === 'weekday') {
                updateWeekdayChart(platform);
            }
        }
        
        function toggleSection(sectionType, platform) {
            // Remove active class from all buttons in the same toggle group
            const toggleGroup = event.target.parentElement;
            toggleGroup.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            event.target.classList.add('active');
            
            // Update the section data based on platform
            if (sectionType === 'emojis') {
                updateEmojisSection(platform);
            } else if (sectionType === 'words') {
                updateWordsSection(platform);
            } else if (sectionType === 'links') {
                updateLinksSection(platform);
            }
        }
        
        function updateHourlyChart(platform) {
            const chartContainer = document.querySelector('.chart-wrapper .bar-chart');
            if (!chartContainer) return;
            
            let data;
            if (platform === 'total') {
                data = window.chartData.hourly.total;
            } else {
                data = window.chartData.hourly[platform] || window.chartData.hourly.total;
            }
            
            const maxCount = Math.max(...data.map(d => d.count));
            
            chartContainer.innerHTML = data.map(item => {
                const hour = parseInt(item.hour.split(':')[0]);
                const period = hour >= 12 ? 'PM' : 'AM';
                const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                return \`
                <div class="bar-item">
                    <div class="bar" style="height: \${(item.count / maxCount * 100)}%">
                        <div class="bar-count">\${formatNumber(item.count)}</div>
                    </div>
                    <div class="bar-label">\${displayHour}\${period}</div>
                </div>
                \`;
            }).join('');
        }
        
        function updateWeekdayChart(platform) {
            const chartContainers = document.querySelectorAll('.chart-wrapper .bar-chart');
            const weekdayContainer = chartContainers[1]; // Second chart is weekday
            if (!weekdayContainer) return;
            
            let data;
            if (platform === 'total') {
                data = window.chartData.weekday.total;
            } else {
                data = window.chartData.weekday[platform] || window.chartData.weekday.total;
            }
            
            const maxCount = Math.max(...data.map(d => d.count));
            
            weekdayContainer.innerHTML = data.map(item => \`
                <div class="bar-item">
                    <div class="bar" style="height: \${(item.count / maxCount * 100)}%">
                        <div class="bar-count">\${formatNumber(item.count)}</div>
                    </div>
                    <div class="bar-label">\${item.day.slice(0, 3)}</div>
                </div>
            \`).join('');
        }
        
        function updateEmojisSection(platform) {
            const container = document.getElementById('emojis-container');
            if (!container) return;
            
            let data;
            if (platform === 'total') {
                data = window.chartData.emojis.total;
            } else {
                data = window.chartData.emojis[platform] || window.chartData.emojis.total;
            }
            
            container.innerHTML = data.map(item => \`
                <div class="emoji-item">
                    <span class="emoji">\${item.emoji}</span>
                    <span class="count">\${formatNumber(item.count)}</span>
                </div>
            \`).join('');
        }
        
        function updateWordsSection(platform) {
            const container = document.getElementById('words-container');
            if (!container) return;
            
            let data;
            if (platform === 'total') {
                data = window.chartData.words.total;
            } else {
                data = window.chartData.words[platform] || window.chartData.words.total;
            }
            
            container.innerHTML = data.map(item => \`
                <span class="tag">\${item.word} (\${formatNumber(item.count)})</span>
            \`).join('');
        }
        
        function updateLinksSection(platform) {
            const container = document.getElementById('links-container');
            if (!container) return;
            
            let data;
            if (platform === 'total') {
                data = window.chartData.links.total;
            } else {
                data = window.chartData.links[platform] || window.chartData.links.total;
            }
            
            container.innerHTML = data.map(item => \`
                <span class="tag green">\${item.domain} (\${formatNumber(item.count)})</span>
            \`).join('');
        }
        
        window.showPage = showPage;
        function toggleUserSection(sectionId, platform) {
            // Remove active class from all buttons in the same toggle group
            const toggleGroup = event.target.parentElement;
            toggleGroup.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            event.target.classList.add('active');
            
            // Update the section content based on platform
            const container = document.getElementById(sectionId);
            if (!container) return;
            
            if (sectionId.startsWith('words-')) {
                updateUserWordsSection(sectionId, platform);
            } else if (sectionId.startsWith('heatmap-')) {
                updateUserHeatmapSection(sectionId, platform);
            } else if (sectionId.startsWith('response-')) {
                updateUserResponseSection(sectionId, platform);
            } else if (sectionId.startsWith('streaks-')) {
                updateUserStreaksSection(sectionId, platform);
            } else if (sectionId.startsWith('delta-')) {
                updateUserDeltaSection(sectionId, platform);
            }
        }
        
        function updateUserWordsSection(sectionId, platform) {
            const container = document.getElementById(sectionId);
            if (!container) return;
            
            // Get user data from the hierarchical data
            const userIndex = sectionId.split('-')[1];
            const participant = ${JSON.stringify(participants)}[userIndex];
            const personData = ${JSON.stringify(hierarchicalData?.perPerson || [])}.find(p => p.name === participant);
            
            if (!personData) return;
            
            let words;
            if (platform === 'total') {
                words = personData.platforms.flatMap(p => p.topWords).sort((a, b) => b.count - a.count).slice(0, 40);
            } else {
                const platformData = personData.platforms.find(p => p.platform === platform);
                words = platformData ? platformData.topWords.slice(0, 40) : [];
            }
            
            container.innerHTML = words.map(item => \`
                <span class="tag">\${item.word} (\${formatNumber(item.count)})</span>
            \`).join('');
        }
        
        function updateUserHeatmapSection(sectionId, platform) {
            const container = document.getElementById(sectionId);
            if (!container) return;
            
            // Get user data from the hierarchical data
            const userIndex = sectionId.split('-')[1];
            const participant = ${JSON.stringify(participants)}[userIndex];
            const personData = ${JSON.stringify(hierarchicalData?.perPerson || [])}.find(p => p.name === participant);
            
            if (!personData) return;
            
            let heatmapData;
            if (platform === 'total') {
                // Use the first available heatmap for total
                heatmapData = personData.platforms.find(p => p.activityHeatmap)?.activityHeatmap;
            } else {
                const platformData = personData.platforms.find(p => p.platform === platform);
                heatmapData = platformData ? platformData.activityHeatmap : null;
            }
            
            if (!heatmapData) return;
            
            // Update the heatmap content
            const heatmapContainer = container.querySelector('.heatmap');
            if (heatmapContainer) {
                // Clear existing heatmap grid
                const existingGrid = heatmapContainer.querySelector('.heatmap-grid');
                if (existingGrid) {
                    existingGrid.remove();
                }
                
                // Create new heatmap grid with proper structure
                const grid = document.createElement('div');
                grid.className = 'heatmap-grid';
                
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const maxValue = Math.max(1, ...heatmapData.flat());
                
                // Create the heatmap structure matching the original
                days.forEach((day, dayIdx) => {
                    const dayDiv = document.createElement('div');
                    dayDiv.className = 'heatmap-day';
                    
                    const dayLabel = document.createElement('div');
                    dayLabel.className = 'day-label';
                    dayLabel.textContent = day;
                    dayDiv.appendChild(dayLabel);
                    
                    const hoursDiv = document.createElement('div');
                    hoursDiv.className = 'heatmap-hours';
                    
                    heatmapData[dayIdx].forEach((count, hourIdx) => {
                        const cell = document.createElement('div');
                        cell.className = 'heatmap-cell';
                        
                        const intensity = count / maxValue;
                        const opacity = Math.max(0.1, intensity);
                        cell.style.backgroundColor = \`rgba(37, 99, 235, \${opacity})\`;
                        cell.style.cursor = 'pointer';
                        cell.setAttribute('data-count', count);
                        cell.title = \`\${day} \${hourIdx}:00 - \${count} messages\`;
                        
                        hoursDiv.appendChild(cell);
                    });
                    
                    dayDiv.appendChild(hoursDiv);
                    grid.appendChild(dayDiv);
                });
                
                heatmapContainer.appendChild(grid);
            }
        }
        
        function updateUserResponseSection(sectionId, platform) {
            const container = document.getElementById(sectionId);
            if (!container) return;
            
            // Get user data from the hierarchical data
            const userIndex = sectionId.split('-')[1];
            const participant = ${JSON.stringify(participants)}[userIndex];
            const personData = ${JSON.stringify(hierarchicalData?.perPerson || [])}.find(p => p.name === participant);
            
            if (!personData) return;
            
            let responseData;
            if (platform === 'total') {
                responseData = personData.crossPlatformMetrics;
            } else {
                // Get per-platform response data
                const platformData = personData.platforms.find(p => p.platform === platform);
                responseData = platformData ? platformData.responseMetrics : personData.crossPlatformMetrics;
            }
            
            if (!responseData) return;
            
            // Update the response time chart
            const barChart = container.querySelector('.bar-chart');
            if (barChart && responseData.responseBuckets) {
                const buckets = responseData.responseBuckets;
                const max = Math.max(1, ...buckets);
                
                barChart.innerHTML = ['<5m','<15m','<1h','<6h','<24h','>24h'].map((label, i) => {
                    const count = buckets[i] || 0;
                    return \`
                    <div class="bar-item">
                        <div class="bar" style="height:\${(count / max) * 100}%">
                            <div class="bar-count">\${formatNumber(count)}</div>
                        </div>
                        <div class="bar-label">\${label}</div>
                    </div>\`;
                }).join('');
            }
            
            // Update the stats boxes
            const statsRow = container.parentElement.querySelector('.stats-row');
            if (statsRow) {
                const medianBox = statsRow.querySelector('.stat-box:nth-child(1) .stat-value');
                const avgBox = statsRow.querySelector('.stat-box:nth-child(2) .stat-value');
                const countBox = statsRow.querySelector('.stat-box:nth-child(3) .stat-value');
                
                if (medianBox) medianBox.textContent = \`\${formatNumber(Math.round(responseData.medianResponseSec || 0))}s\`;
                if (avgBox) avgBox.textContent = \`\${formatNumber(Math.round(responseData.avgResponseSec || 0))}s\`;
                if (countBox) countBox.textContent = \`\${formatNumber(responseData.responseCount || 0)}\`;
            }
        }
        
        function updateUserStreaksSection(sectionId, platform) {
            const container = document.getElementById(sectionId);
            if (!container) return;
            
            // Get user data from the hierarchical data
            const userIndex = sectionId.split('-')[1];
            const participant = ${JSON.stringify(participants)}[userIndex];
            const personData = ${JSON.stringify(hierarchicalData?.perPerson || [])}.find(p => p.name === participant);
            
            if (!personData) return;
            
            let streaksData;
            if (platform === 'total') {
                // For total, use the maximum values across all platforms
                const longestStreak = Math.max(...personData.platforms.map(p => p.longestStreak || 0));
                const currentStreak = Math.max(...personData.platforms.map(p => p.currentStreak || 0));
                streaksData = { longestStreak, currentStreak };
            } else {
                // Get per-platform streak data
                const platformData = personData.platforms.find(p => p.platform === platform);
                streaksData = platformData ? {
                    longestStreak: platformData.longestStreak || 0,
                    currentStreak: platformData.currentStreak || 0
                } : { longestStreak: 0, currentStreak: 0 };
            }
            
            // Update the streak values
            const longestBox = container.querySelector('.stat-box:nth-child(1) .stat-value');
            const currentBox = container.querySelector('.stat-box:nth-child(2) .stat-value');
            
            if (longestBox) longestBox.textContent = formatNumber(streaksData.longestStreak);
            if (currentBox) currentBox.textContent = formatNumber(streaksData.currentStreak);
        }
        
        function updateUserDeltaSection(sectionId, platform) {
            const userIndex = sectionId.split('-')[1];
            const participant = ${JSON.stringify(participants)}[userIndex];
            const personData = ${JSON.stringify(hierarchicalData?.perPerson || [])}.find(p => p.name === participant);
            
            if (!personData) return;
            
            let timeSeriesData;
            if (platform === 'total') {
                // For total, combine time series data from all platforms
                const allPlatformData = personData.platforms.flatMap(p => p.timeSeriesData || []);
                const combinedData = new Map();
                
                // Combine data from all platforms
                allPlatformData.forEach(series => {
                    if (series.participant === participant) {
                        series.data.forEach(point => {
                            const key = point.month;
                            if (!combinedData.has(key)) {
                                combinedData.set(key, 0);
                            }
                            combinedData.set(key, combinedData.get(key) + point.words);
                        });
                    }
                });
                
                // Convert back to array format
                const sortedMonths = Array.from(combinedData.keys()).sort();
                timeSeriesData = [{
                    participant: participant,
                    data: sortedMonths.map(month => ({
                        month,
                        words: combinedData.get(month) || 0
                    }))
                }];
            } else {
                // For specific platform, use the pre-calculated time series data
                const platformData = personData.platforms.find(p => p.platform === platform);
                if (platformData && platformData.timeSeriesData) {
                    // Filter the time series data for this specific participant
                    const participantSeries = platformData.timeSeriesData.find(s => s.participant === participant);
                    timeSeriesData = participantSeries ? [participantSeries] : [];
                } else {
                    // Fallback: return empty data if not available
                    timeSeriesData = [];
                }
            }
            
            // Update the chart with new data
            const allSeries = timeSeriesData;
            const series = allSeries.find(s => s.participant === participant);
            if (!series) return;
            
            const months = series.data.map(d => d.month);
            const deltas = series.data.map((d,i) => i===0 ? 0 : d.words - series.data[i-1].words);
            const padding = 70;
            const width = 1200 - padding * 2;
            const height = 420 - padding * 2;
            const ox = padding, oy = padding;
            const maxAbs = Math.max(1, ...deltas.map(v => Math.abs(v)));

            const svg = document.querySelector(\`#userDelta-\${userIndex} svg\`);
            const grid = document.getElementById(\`user-delta-grid-\${userIndex}\`);
            const bars = document.getElementById(\`user-delta-bars-\${userIndex}\`);

            // Clear existing content
            grid.innerHTML = '';
            bars.innerHTML = '';

            // Create tooltip if it doesn't exist
            let tooltip = document.getElementById(\`deltaTooltip-\${userIndex}\`);
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = \`deltaTooltip-\${userIndex}\`;
                tooltip.style.cssText = 'position: absolute; background: rgba(0,0,0,0.8); color: white; padding: 8px; border-radius: 4px; font-size: 12px; pointer-events: none; z-index: 1000; display: none;';
                document.querySelector(\`#userDelta-\${userIndex}\`).appendChild(tooltip);
            }

            // Calculate bar positions - one bar per month
            const barWidth = Math.max(20, width / months.length - 2);
            const barSpacing = width / months.length;

            // Draw grid lines
            for (let i = 0; i <= 10; i++) {
                const y = oy + (height * i / 10);
                const value = maxAbs * (1 - i / 10);
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', ox);
                line.setAttribute('y1', y);
                line.setAttribute('x2', ox + width);
                line.setAttribute('y2', y);
                line.setAttribute('stroke', '#e0e0e0');
                line.setAttribute('stroke-width', '1');
                grid.appendChild(line);

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', ox - 10);
                text.setAttribute('y', y + 4);
                text.setAttribute('text-anchor', 'end');
                text.setAttribute('font-size', '12');
                text.setAttribute('fill', '#666');
                text.textContent = Math.round(value).toLocaleString();
                grid.appendChild(text);
            }

            // Draw bars
            deltas.forEach((delta, i) => {
                const x = ox + i * barSpacing + (barSpacing - barWidth) / 2;
                const barHeight = Math.abs(delta) / maxAbs * height;
                const y = delta >= 0 ? oy + height - barHeight : oy + height;
                
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', x);
                rect.setAttribute('y', y);
                rect.setAttribute('width', barWidth);
                rect.setAttribute('height', barHeight);
                rect.setAttribute('fill', delta >= 0 ? '#4CAF50' : '#F44336');
                rect.setAttribute('opacity', '0.8');
                rect.setAttribute('data-month', months[i]);
                rect.setAttribute('data-delta', delta);
                rect.setAttribute('data-words', series.data[i].words);
                
                // Add hover events
                rect.addEventListener('mouseenter', (e) => {
                    tooltip.style.display = 'block';
                    tooltip.innerHTML = \`
                        <strong>\${months[i]}</strong><br/>
                        Change: \${delta >= 0 ? '+' : ''}\${delta.toLocaleString()} words<br/>
                        Total: \${series.data[i].words.toLocaleString()} words
                    \`;
                });
                
                rect.addEventListener('mousemove', (e) => {
                    tooltip.style.left = (e.pageX + 10) + 'px';
                    tooltip.style.top = (e.pageY - 10) + 'px';
                });
                
                rect.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
                
                bars.appendChild(rect);
            });
        }
        
        function toggleOverviewSection(sectionId, platform) {
            // Remove active class from all buttons in the same toggle group
            const toggleGroup = event.target.parentElement;
            toggleGroup.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            event.target.classList.add('active');
            
            // Update the section content based on platform
            if (sectionId === 'timeSeriesChart') {
                updateOverviewTimeSeriesSection(platform);
            }
        }
        
        function updateOverviewTimeSeriesSection(platform) {
            const hierarchicalData = ${JSON.stringify(hierarchicalData)};
            if (!hierarchicalData) return;
            
            let timeSeriesData = [];
            
            if (platform === 'total') {
                // For total, combine time series data from all platforms for all participants
                const allParticipants = hierarchicalData.overview.participants.map(p => p.name);
                timeSeriesData = allParticipants.map(participant => {
                    const personData = hierarchicalData.perPerson.find(p => p.name === participant);
                    if (!personData) return null;
                    
                    // Combine time series data from all platforms for this participant
                    const allPlatformData = personData.platforms.flatMap(p => p.timeSeriesData || []);
                    const combinedData = new Map();
                    
                    // Combine data from all platforms
                    allPlatformData.forEach(series => {
                        if (series.participant === participant) {
                            series.data.forEach(point => {
                                const key = point.month;
                                if (!combinedData.has(key)) {
                                    combinedData.set(key, 0);
                                }
                                combinedData.set(key, combinedData.get(key) + point.words);
                            });
                        }
                    });
                    
                    // Convert back to array format
                    const sortedMonths = Array.from(combinedData.keys()).sort();
                    return {
                        participant: participant,
                        data: sortedMonths.map(month => ({
                            month,
                            words: combinedData.get(month) || 0
                        }))
                    };
                }).filter(Boolean);
            } else {
                // For specific platform, get time series data for that platform only
                const allParticipants = hierarchicalData.overview.participants.map(p => p.name);
                timeSeriesData = allParticipants.map(participant => {
                    const personData = hierarchicalData.perPerson.find(p => p.name === participant);
                    if (!personData) return null;
                    
                    const platformData = personData.platforms.find(p => p.platform === platform);
                    if (!platformData || !platformData.timeSeriesData) return null;
                    
                    const participantSeries = platformData.timeSeriesData.find(s => s.participant === participant);
                    return participantSeries || null;
                }).filter(Boolean);
            }
            
            // Update the chart with new data
            updateTimeSeriesChart(timeSeriesData);
        }
        
        function updateTimeSeriesChart(data) {
            const colors = [
                '#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c', '#0891b2', '#be123c', '#15803d', '#4338ca', '#b45309',
                '#6b21a8', '#0d9488', '#c2410c', '#1e40af', '#be185d', '#166534', '#7c2d12', '#581c87', '#0f766e', '#92400e',
                '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af'
            ];
            const maxWords = Math.max(...data.flatMap(s => s.data.map(d => d.words)));
            const padding = 60;
            const chartWidth = 1000 - padding * 2;
            const chartHeight = 400 - padding * 2;
            const dataPoints = data[0]?.data.length || 0;
            
            const activeLines = new Set(data.map((_, i) => i));
            
            function renderChart() {
                const gridSvg = document.getElementById('chartGrid');
                const linesSvg = document.getElementById('chartLines');
                const pointsSvg = document.getElementById('chartPoints');
                
                gridSvg.innerHTML = '';
                linesSvg.innerHTML = '';
                pointsSvg.innerHTML = '';
                
                // Grid lines
                for (let i = 0; i <= 5; i++) {
                    const y = padding + (chartHeight / 5) * i;
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', padding);
                    line.setAttribute('y1', y);
                    line.setAttribute('x2', 1000 - padding);
                    line.setAttribute('y2', y);
                    line.setAttribute('class', 'chart-grid');
                    gridSvg.appendChild(line);
                }
                
                // X-axis labels
                if (dataPoints > 0) {
                    const skipFactor = Math.ceil(dataPoints / 12);
                    data[0].data.forEach((point, i) => {
                        if (i % skipFactor === 0 || i === dataPoints - 1) {
                            const x = padding + (chartWidth / (dataPoints - 1)) * i;
                            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                            const monthLabel = point.month.split('-')[1] + '/' + point.month.split('-')[0].slice(2);
                            text.setAttribute('x', x);
                            text.setAttribute('y', 400 - padding + 20);
                            text.setAttribute('class', 'chart-label');
                            text.setAttribute('text-anchor', 'middle');
                            text.textContent = monthLabel;
                            gridSvg.appendChild(text);
                        }
                    });
                }
                
                // Y-axis labels
                for (let i = 0; i <= 5; i++) {
                    const y = padding + (chartHeight / 5) * i;
                    const value = Math.round((maxWords / 5) * (5 - i));
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', padding - 10);
                    text.setAttribute('y', y + 4);
                    text.setAttribute('class', 'chart-label');
                    text.setAttribute('text-anchor', 'end');
                    text.textContent = value.toLocaleString();
                    gridSvg.appendChild(text);
                }
                
                // Draw lines
                data.forEach((series, seriesIndex) => {
                    const color = colors[seriesIndex % colors.length];
                    let pathData = '';
                    
                    series.data.forEach((point, i) => {
                        const x = padding + (chartWidth / (dataPoints - 1)) * i;
                        const y = padding + chartHeight - (point.words / maxWords) * chartHeight;
                        pathData += (i === 0 ? 'M' : 'L') + x + ',' + y;
                    });
                    
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', pathData);
                    path.setAttribute('class', 'line');
                    path.setAttribute('stroke', color);
                    path.setAttribute('data-series', seriesIndex);
                    
                    if (!activeLines.has(seriesIndex)) {
                        path.classList.add('hidden');
                    } else {
                        // Only add hover effects if there are multiple active lines
                        if (activeLines.size > 1) {
                            path.addEventListener('mouseenter', () => {
                                document.querySelectorAll('.line').forEach(l => {
                                    const lineSeries = parseInt(l.getAttribute('data-series'));
                                    if (activeLines.has(lineSeries) && lineSeries !== seriesIndex) {
                                        l.classList.add('faded');
                                    }
                                });
                                path.classList.remove('faded');
                            });
                            path.addEventListener('mouseleave', () => {
                                document.querySelectorAll('.line').forEach(l => {
                                    l.classList.remove('faded');
                                });
                            });
                        }
                    }
                    
                    linesSvg.appendChild(path);
                    
                    // Add data points
                    series.data.forEach((point, i) => {
                        const x = padding + (chartWidth / (dataPoints - 1)) * i;
                        const y = padding + chartHeight - (point.words / maxWords) * chartHeight;
                        
                        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        circle.setAttribute('cx', x);
                        circle.setAttribute('cy', y);
                        circle.setAttribute('r', 5);
                        circle.setAttribute('fill', color);
                        circle.setAttribute('class', 'data-point');
                        circle.setAttribute('data-series', seriesIndex);
                        
                        if (!activeLines.has(seriesIndex)) {
                            circle.classList.add('hidden');
                        }
                        
                        circle.addEventListener('mouseenter', (e) => {
                            // Only show tooltip if the line is active
                            if (activeLines.has(seriesIndex)) {
                                const tooltip = document.getElementById('chartTooltip');
                                tooltip.style.display = 'block';
                                tooltip.textContent = series.participant + ': ' + point.words.toLocaleString() + ' words (' + point.month + ')';
                                const rect = e.target.getBoundingClientRect();
                                const chartRect = document.getElementById('timeSeriesChart').getBoundingClientRect();
                                tooltip.style.left = (rect.left - chartRect.left) + 'px';
                                tooltip.style.top = (rect.top - chartRect.top - 40) + 'px';
                                circle.style.opacity = '1';
                            }
                        });
                        
                        circle.addEventListener('mouseleave', () => {
                            document.getElementById('chartTooltip').style.display = 'none';
                            circle.style.opacity = '0';
                        });
                        
                        pointsSvg.appendChild(circle);
                    });
                });
            }
            
            function renderLegend() {
                const legend = document.getElementById('chartLegend');
                legend.innerHTML = '';
                
                // Add a "Select All" / "Deselect All" button for large groups
                if (data.length > 5) {
                    const controlItem = document.createElement('div');
                    controlItem.style.gridColumn = '1 / -1';
                    controlItem.style.display = 'flex';
                    controlItem.style.gap = '12px';
                    controlItem.style.marginBottom = '8px';
                    controlItem.style.paddingBottom = '8px';
                    controlItem.style.borderBottom = '1px solid #e5e5e5';
                    
                    const selectAllBtn = document.createElement('button');
                    selectAllBtn.textContent = 'Select All';
                    selectAllBtn.style.padding = '4px 8px';
                    selectAllBtn.style.fontSize = '12px';
                    selectAllBtn.style.border = '1px solid #ccc';
                    selectAllBtn.style.borderRadius = '3px';
                    selectAllBtn.style.background = 'white';
                    selectAllBtn.style.cursor = 'pointer';
                    
                    const deselectAllBtn = document.createElement('button');
                    deselectAllBtn.textContent = 'Deselect All';
                    deselectAllBtn.style.padding = '4px 8px';
                    deselectAllBtn.style.fontSize = '12px';
                    deselectAllBtn.style.border = '1px solid #ccc';
                    deselectAllBtn.style.borderRadius = '3px';
                    deselectAllBtn.style.background = 'white';
                    deselectAllBtn.style.cursor = 'pointer';
                    
                    selectAllBtn.addEventListener('click', () => {
                        data.forEach((_, i) => activeLines.add(i));
                        renderLegend();
                        renderChart();
                    });
                    
                    deselectAllBtn.addEventListener('click', () => {
                        activeLines.clear();
                        renderLegend();
                        renderChart();
                    });
                    
                    controlItem.appendChild(selectAllBtn);
                    controlItem.appendChild(deselectAllBtn);
                    legend.appendChild(controlItem);
                }
                
                data.forEach((series, index) => {
                    const color = colors[index % colors.length];
                    const item = document.createElement('div');
                    item.className = 'legend-item' + (activeLines.has(index) ? ' active' : ' inactive');
                    item.style.color = color;
                    
                    item.innerHTML = 
                        '<div class="legend-checkbox"></div>' +
                        '<div class="legend-color" style="background: ' + color + '"></div>' +
                        '<div class="legend-name">' + series.participant + '</div>';
                    
                    item.addEventListener('click', () => {
                        if (activeLines.has(index)) {
                            activeLines.delete(index);
                        } else {
                            activeLines.add(index);
                        }
                        renderLegend();
                        renderChart();
                    });
                    
                    legend.appendChild(item);
                });
            }
            
            renderChart();
            renderLegend();
        }
        
        window.toggleChart = toggleChart;
        window.toggleSection = toggleSection;
        window.toggleUserSection = toggleUserSection;
        window.toggleOverviewSection = toggleOverviewSection;
        
         // Initialize message history and sessions on page load
         document.addEventListener('DOMContentLoaded', function() {
             initializeMessageHistory();
             renderSessions();
         });
         
         // Also render sessions immediately (in case DOMContentLoaded already fired)
         if (document.readyState === 'loading') {
             document.addEventListener('DOMContentLoaded', renderSessions);
         } else {
             renderSessions();
         }
    </script>
  </body>
  </html>`;
  }
