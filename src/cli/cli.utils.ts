/**
 * CLI Utilities for enhanced user experience
 */

import * as readline from 'readline';

// ============================================================================
// ASCII ART & BRANDING
// ============================================================================

export const ASCII_LOGO = `
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║    ██████╗██╗  ██╗ █████╗ ████████╗  █████╗ ███╗   ██╗     ║
║   ██╔════╝██║  ██║██╔══██╗╚══██╔══╝ ██╔══██╗████╗  ██║     ║
║   ██║     ███████║███████║   ██║    ███████║██╔██╗ ██║     ║
║   ██║     ██╔══██║██╔══██║   ██║    ██╔══██║██║╚██╗██║     ║
║   ╚██████╗██║  ██║██║  ██║   ██║    ██║  ██║██║ ╚████║     ║
║    ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═╝  ╚═╝╚═╝  ╚═══╝     ║
║                                                            ║
║              Chat Analysis & Insights Platform             ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`;

export const SUCCESS_ICON = "✓";
export const ERROR_ICON = "✗";
export const INFO_ICON = "ℹ";
export const WARNING_ICON = "⚠";
export const LOADING_ICON = "⟳";

// ============================================================================
// COLOR UTILITIES
// ============================================================================

export const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m'
};

export function colorize(text: string, color: keyof typeof colors): string {
    return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

export function formatNumber(num: number): string {
    return num.toLocaleString();
}

export function formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

export function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// ============================================================================
// LOADING INDICATORS
// ============================================================================

export class LoadingSpinner {
    private interval: NodeJS.Timeout | null = null;
    private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private currentFrame = 0;
    private message: string;

    constructor(message: string) {
        this.message = message;
    }

    start(): void {
        process.stdout.write('\x1b[?25l'); // Hide cursor
        this.interval = setInterval(() => {
            process.stdout.write(`\r${colorize(this.frames[this.currentFrame], 'cyan')} ${this.message}`);
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 100);
    }

    stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        process.stdout.write('\r' + ' '.repeat(process.stdout.columns) + '\r'); // Clear line
        process.stdout.write('\x1b[?25h'); // Show cursor
    }

    updateMessage(message: string): void {
        this.message = message;
    }
}

export class ProgressBar {
    private total: number;
    private current: number = 0;
    private width: number = 40;
    private message: string;

    constructor(total: number, message: string = '') {
        this.total = total;
        this.message = message;
    }

    update(current: number, message?: string): void {
        this.current = current;
        if (message) this.message = message;
        this.render();
    }

    increment(message?: string): void {
        this.current++;
        if (message) this.message = message;
        this.render();
    }

    private render(): void {
        const percentage = Math.round((this.current / this.total) * 100);
        const filled = Math.round((this.current / this.total) * this.width);
        const bar = '█'.repeat(filled) + '░'.repeat(this.width - filled);
        
        process.stdout.write(`\r${colorize('Progress:', 'blue')} [${bar}] ${percentage}% (${this.current}/${this.total}) ${this.message}`);
        
        if (this.current >= this.total) {
            process.stdout.write('\n');
        }
    }
}

// ============================================================================
// MESSAGE UTILITIES
// ============================================================================

export function logSuccess(message: string): void {
    console.log(`${colorize(SUCCESS_ICON, 'green')} ${colorize(message, 'green')}`);
}

export function logError(message: string): void {
    console.log(`${colorize(ERROR_ICON, 'red')} ${colorize(message, 'red')}`);
}

export function logInfo(message: string): void {
    console.log(`${colorize(INFO_ICON, 'blue')} ${colorize(message, 'blue')}`);
}

export function logWarning(message: string): void {
    console.log(`${colorize(WARNING_ICON, 'yellow')} ${colorize(message, 'yellow')}`);
}

export function logHeader(message: string): void {
    const line = '═'.repeat(message.length + 4);
    console.log(`\n${colorize(line, 'cyan')}`);
    console.log(`${colorize('  ' + message + '  ', 'cyan')}`);
    console.log(`${colorize(line, 'cyan')}\n`);
}

export function logSubHeader(message: string): void {
    console.log(`\n${colorize('▶ ' + message, 'magenta')}`);
}

// ============================================================================
// TABLE UTILITIES
// ============================================================================

export interface TableColumn {
    header: string;
    width: number;
    align?: 'left' | 'right' | 'center';
}

export function createTable(columns: TableColumn[], data: string[][]): void {
    // Create header
    const headerRow = columns.map(col => col.header.padEnd(col.width)).join(' │ ');
    const separator = columns.map(col => '─'.repeat(col.width)).join('─┼─');
    
    console.log(`┌─${separator}─┐`);
    console.log(`│ ${colorize(headerRow, 'bright')} │`);
    console.log(`├─${separator}─┤`);
    
    // Create data rows
    data.forEach(row => {
        const formattedRow = row.map((cell, i) => {
            const col = columns[i];
            const truncated = cell.length > col.width ? cell.substring(0, col.width - 3) + '...' : cell;
            
            switch (col.align) {
                case 'right':
                    return truncated.padStart(col.width);
                case 'center':
                    return truncated.padStart((col.width + truncated.length) / 2).padEnd(col.width);
                default:
                    return truncated.padEnd(col.width);
            }
        }).join(' │ ');
        
        console.log(`│ ${formattedRow} │`);
    });
    
    console.log(`└─${separator}─┘`);
}

// ============================================================================
// USAGE HELPER
// ============================================================================

export function showUsage(): void {
    console.log(ASCII_LOGO);
    
    console.log(`${colorize('USAGE:', 'bright')}`);
    console.log(`  ${colorize('npx tsx index.ts', 'cyan')} ${colorize('[options]', 'yellow')} ${colorize('[folder_path]', 'yellow')} ${colorize('[output.json]', 'dim')}`);
    console.log();
    
    console.log(`${colorize('OPTIONS:', 'bright')}`);
    console.log(`  ${colorize('--interactive, -i', 'cyan')}    Launch interactive mode (default if no arguments)`);
    console.log(`  ${colorize('--help, -h', 'cyan')}           Show this help message`);
    console.log();
    
    console.log(`${colorize('ARGUMENTS:', 'bright')}`);
    console.log(`  ${colorize('folder_path', 'yellow')}    Directory containing chat export files`);
    console.log(`  ${colorize('output.json', 'dim')}       Optional output file path (default: hierarchical_analysis.json)`);
    console.log();
    
    console.log(`${colorize('EXAMPLES:', 'bright')}`);
    console.log(`  ${colorize('npx tsx index.ts', 'cyan')}                              # Launch interactive mode`);
    console.log(`  ${colorize('npx tsx index.ts --interactive', 'cyan')}                # Launch interactive mode`);
    console.log(`  ${colorize('npx tsx index.ts ./chats/', 'cyan')}                     # Analyze all chats in folder`);
    console.log(`  ${colorize('npx tsx index.ts ./chats/ analysis.json', 'cyan')}       # Specify output file`);
    console.log(`  ${colorize('npx tsx index.ts ~/Downloads/chat_exports/', 'cyan')}    # Use absolute path`);
    console.log();
    
    console.log(`${colorize('SUPPORTED PLATFORMS:', 'bright')}`);
    console.log(`  ${colorize('WhatsApp', 'green')}     .txt files (chat exports)`);
    console.log(`  ${colorize('Instagram', 'magenta')}   .json files (message exports)`);
    console.log(`  ${colorize('Android Messages', 'blue')} .xml files (SMS/MMS exports)`);
    console.log();
    
    console.log(`${colorize('FILE PATTERNS:', 'bright')}`);
    console.log(`  Files with platform indicators in filename:`);
    console.log(`    ${colorize('.whatsapp', 'green')}, ${colorize('_whatsapp', 'green')}     → WhatsApp`);
    console.log(`    ${colorize('.insta', 'magenta')}, ${colorize('_insta', 'magenta')}, ${colorize('.instagram', 'magenta')} → Instagram`);
    console.log(`    ${colorize('.android', 'blue')}, ${colorize('_android', 'blue')}, ${colorize('.sms', 'blue')} → Android Messages`);
    console.log();
    
    console.log(`${colorize('OUTPUT:', 'bright')}`);
    console.log(`  ${colorize('JSON Analysis', 'cyan')}    Comprehensive metrics and statistics`);
    console.log(`  ${colorize('HTML Report', 'cyan')}      Interactive dashboard with visualizations`);
    console.log();
    
    console.log(`${colorize('FEATURES:', 'bright')}`);
    console.log(`  • Cross-platform chat analysis and merging`);
    console.log(`  • Participant name normalization`);
    console.log(`  • Hierarchical analysis (overview, per-platform, per-person)`);
    console.log(`  • Activity patterns and engagement metrics`);
    console.log(`  • Emoji and word frequency analysis`);
    console.log(`  • Response time and streak tracking`);
    console.log(`  • Interactive HTML dashboard`);
    console.log();
    
    console.log(`${colorize('For more information, visit:', 'dim')} https://github.com/Bishoy334/ChatAnalyser`);
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export function showError(message: string, details?: string): void {
    console.log();
    logError(message);
    if (details) {
        console.log(`${colorize('Details:', 'dim')} ${details}`);
    }
    console.log();
    console.log(`${colorize('Run with no arguments to see usage information.', 'dim')}`);
    console.log();
}

export function showPlatformInfo(): void {
    console.log(`${colorize('PLATFORM SUPPORT:', 'bright')}`);
    console.log();
    
    const platforms = [
        {
            name: 'WhatsApp',
            color: 'green',
            extensions: ['.txt'],
            description: 'Text-based chat exports',
            example: 'Chat with John.txt'
        },
        {
            name: 'Instagram',
            color: 'magenta',
            extensions: ['.json'],
            description: 'JSON message exports',
            example: 'message_1.insta.json'
        },
        {
            name: 'Android Messages',
            color: 'blue',
            extensions: ['.xml'],
            description: 'SMS/MMS XML exports',
            example: 'sms_backup.xml'
        }
    ];
    
    platforms.forEach(platform => {
        console.log(`${colorize(platform.name, platform.color as keyof typeof colors)}`);
        console.log(`  Extensions: ${platform.extensions.join(', ')}`);
        console.log(`  Description: ${platform.description}`);
        console.log(`  Example: ${colorize(platform.example, 'dim')}`);
        console.log();
    });
}

// ============================================================================
// INTERACTIVE CLI UTILITIES
// ============================================================================

export function createReadlineInterface(): readline.Interface {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

export function askQuestion(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(`${colorize('?', 'cyan')} ${question}`, (answer) => {
            resolve(answer.trim());
        });
    });
}

export function askChoice(rl: readline.Interface, question: string, choices: string[]): Promise<string> {
    return new Promise((resolve) => {
        console.log(`\n${colorize(question, 'bright')}`);
        choices.forEach((choice, index) => {
            console.log(`  ${colorize((index + 1).toString(), 'cyan')}. ${choice}`);
        });
        
        rl.question(`\n${colorize('?', 'cyan')} Enter your choice (1-${choices.length}): `, (answer) => {
            const choiceIndex = parseInt(answer.trim()) - 1;
            if (choiceIndex >= 0 && choiceIndex < choices.length) {
                resolve(choices[choiceIndex]);
            } else {
                console.log(`${colorize('Invalid choice. Please try again.', 'red')}`);
                resolve(askChoice(rl, question, choices));
            }
        });
    });
}

export function showMainMenu(): void {
    console.log(`\n${colorize('MAIN MENU', 'bright')}`);
    console.log(`${colorize('═'.repeat(50), 'cyan')}`);
    console.log(`${colorize('1.', 'cyan')} Analyze chat files from a directory`);
    console.log(`${colorize('2.', 'cyan')} Browse available sample datasets`);
    console.log(`${colorize('3.', 'cyan')} Show platform information`);
    console.log(`${colorize('4.', 'cyan')} Show usage information`);
    console.log(`${colorize('5.', 'cyan')} Exit`);
    console.log(`${colorize('═'.repeat(50), 'cyan')}`);
}

export function showFolderBrowser(folders: string[]): void {
    console.log(`\n${colorize('AVAILABLE DATASETS', 'bright')}`);
    console.log(`${colorize('═'.repeat(50), 'cyan')}`);
    
    if (folders.length === 0) {
        console.log(`${colorize('No sample datasets found in assets directory.', 'yellow')}`);
        console.log(`${colorize('You can still analyze your own chat files using option 1.', 'dim')}`);
    } else {
        folders.forEach((folder, index) => {
            const folderName = folder.split('/').pop() || folder;
            console.log(`${colorize((index + 1).toString(), 'cyan')}. ${colorize(folderName, 'green')}`);
        });
    }
    
    console.log(`${colorize('═'.repeat(50), 'cyan')}`);
}

export function discoverAssetFolders(assetsPath: string): string[] {
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(assetsPath)) {
        return [];
    }
    
    const folders: string[] = [];
    
    function scanDirectory(dir: string) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
            if (item.isDirectory()) {
                const fullPath = path.join(dir, item.name);
                folders.push(fullPath);
                // Don't recurse into subdirectories for now
            }
        }
    }
    
    scanDirectory(assetsPath);
    return folders.sort();
}

export function showAnalysisPreview(folderPath: string): void {
    const fs = require('fs');
    const path = require('path');
    
    console.log(`\n${colorize('ANALYSIS PREVIEW', 'bright')}`);
    console.log(`${colorize('═'.repeat(50), 'cyan')}`);
    console.log(`${colorize('Target Directory:', 'cyan')} ${folderPath}`);
    
    if (!fs.existsSync(folderPath)) {
        console.log(`${colorize('Directory does not exist.', 'red')}`);
        return;
    }
    
    // Count files by type
    const fileCounts = { txt: 0, json: 0, xml: 0, other: 0 };
    let totalSize = 0;
    
    function scanDirectory(dir: string) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            
            if (item.isDirectory()) {
                scanDirectory(fullPath);
            } else if (item.isFile()) {
                const ext = path.extname(item.name).toLowerCase();
                const stats = fs.statSync(fullPath);
                totalSize += stats.size;
                
                if (ext === '.txt') fileCounts.txt++;
                else if (ext === '.json') fileCounts.json++;
                else if (ext === '.xml') fileCounts.xml++;
                else fileCounts.other++;
            }
        }
    }
    
    scanDirectory(folderPath);
    
    console.log(`${colorize('File Summary:', 'cyan')}`);
    if (fileCounts.txt > 0) console.log(`  ${colorize('WhatsApp files:', 'green')} ${fileCounts.txt}`);
    if (fileCounts.json > 0) console.log(`  ${colorize('Instagram files:', 'magenta')} ${fileCounts.json}`);
    if (fileCounts.xml > 0) console.log(`  ${colorize('Android Messages files:', 'blue')} ${fileCounts.xml}`);
    if (fileCounts.other > 0) console.log(`  ${colorize('Other files:', 'yellow')} ${fileCounts.other}`);
    
    console.log(`${colorize('Total Size:', 'cyan')} ${formatBytes(totalSize)}`);
    console.log(`${colorize('═'.repeat(50), 'cyan')}`);
}
