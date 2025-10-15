import fs from "node:fs";
import path from "node:path";
import { discoverChatFiles } from '../utils/file.utils';
import { processMultipleChats } from './file-processor';
import { normalizeParticipantNames } from '../analysis/name-normaliser';
import { computeHierarchicalAnalysis } from '../analysis/hierarchical.computer';
import { generateHTMLReport } from '../html/html-generator';
import { 
    ASCII_LOGO, 
    colorize, 
    LoadingSpinner, 
    ProgressBar,
    logSuccess, 
    logError, 
    logInfo, 
    logWarning, 
    logHeader, 
    logSubHeader,
    createTable,
    showUsage,
    showError,
    formatNumber,
    formatBytes,
    formatDuration
} from './cli.utils';
import { runInteractiveCLI } from './interactive';

// ============================================================================
// CLI MAIN LOGIC
// ============================================================================

/**
 * Main CLI execution function
 */
export async function runCLI(args: string[]): Promise<void> {
    const inputArg = args[2];
    const outputArg = args[3];

    // Check for interactive mode
    if (inputArg === '--interactive' || inputArg === '-i' || !inputArg) {
        await runInteractiveCLI();
        return;
    }

    // Show usage if help requested
    if (inputArg === '--help' || inputArg === '-h') {
        showUsage();
        process.exit(0);
    }

    // Show ASCII logo
    console.log(ASCII_LOGO);

    const inputPath = path.resolve(inputArg);
    const outputPath = outputArg ? path.resolve(outputArg) : path.join(inputPath, 'hierarchical_analysis.json');

    // Validate input directory
    if (!fs.existsSync(inputPath)) {
        showError("Input directory does not exist", `Path: ${inputPath}`);
        process.exit(1);
    }

    if (!fs.statSync(inputPath).isDirectory()) {
        showError("Input must be a directory containing chat files", `Path: ${inputPath}`);
        process.exit(1);
    }

    try {
        // Step 1: Discover chat files
        logHeader("DISCOVERING CHAT FILES");
        const spinner = new LoadingSpinner("Scanning directory for chat files...");
        spinner.start();
        
        const chatFiles = discoverChatFiles(inputPath);
        spinner.stop();
        
        if (chatFiles.length === 0) {
            logError("No chat files found in the directory");
            logInfo("Looking for: .txt files (WhatsApp), .json files (Instagram), .xml files (Android Messages)");
            logInfo("Or files with platform indicators: .whatsapp, .insta, .android, .sms");
            process.exit(1);
        }
        
        logSuccess(`Found ${formatNumber(chatFiles.length)} chat file(s)`);
        
        // Display discovered files in a table
        const fileTableData = chatFiles.map((file, index) => {
            const relativePath = path.relative(inputPath, file);
            const ext = path.extname(file);
            const size = formatBytes(fs.statSync(file).size);
            const platform = ext === '.txt' ? 'WhatsApp' : ext === '.json' ? 'Instagram' : ext === '.xml' ? 'Android Messages' : 'Unknown';
            return [
                (index + 1).toString(),
                relativePath,
                platform,
                size
            ];
        });
        
        createTable(
            [
                { header: '#', width: 3, align: 'right' },
                { header: 'File', width: 40, align: 'left' },
                { header: 'Platform', width: 15, align: 'left' },
                { header: 'Size', width: 8, align: 'right' }
            ],
            fileTableData
        );
        
        // Step 2: Parse and merge chats
        logHeader("PARSING CHAT FILES");
        const parseSpinner = new LoadingSpinner("Parsing and merging related chats...");
        parseSpinner.start();
        
        const parsedChats = await processMultipleChats(chatFiles);
        parseSpinner.stop();
        
        logSuccess(`Processed into ${formatNumber(parsedChats.length)} conversation(s)`);
        
        // Display parsed conversations
        const conversationTableData = parsedChats.map((chat, index) => {
            const participants = Array.from(chat.participants).join(', ');
            const messageCount = formatNumber(chat.messages.length);
            const platform = chat.platform.charAt(0).toUpperCase() + chat.platform.slice(1);
            return [
                (index + 1).toString(),
                platform,
                participants,
                messageCount,
                chat.title || 'Untitled'
            ];
        });
        
        createTable(
            [
                { header: '#', width: 3, align: 'right' },
                { header: 'Platform', width: 12, align: 'left' },
                { header: 'Participants', width: 30, align: 'left' },
                { header: 'Messages', width: 10, align: 'right' },
                { header: 'Title', width: 20, align: 'left' }
            ],
            conversationTableData
        );
        
        // Step 3: Normalize participant names
        logHeader("NORMALIZING PARTICIPANT NAMES");
        
        const normalizedChats = await normalizeParticipantNames(parsedChats);
        
        logSuccess("Participant names normalized");
        
        // Step 4: Compute hierarchical analysis
        logHeader("COMPUTING ANALYSIS");
        const analysisSpinner = new LoadingSpinner("Computing hierarchical analysis and metrics...");
        analysisSpinner.start();
        
        const hierarchicalAnalysis = await computeHierarchicalAnalysis(normalizedChats);
        analysisSpinner.stop();
        
        logSuccess("Analysis computation complete");
        
        // Step 5: Generate outputs
        logHeader("GENERATING OUTPUTS");
        
        // Write JSON analysis
        const jsonSpinner = new LoadingSpinner("Writing JSON analysis file...");
        jsonSpinner.start();
        
        const jsonOutput = {
            overview: hierarchicalAnalysis.overview,
            perPlatform: hierarchicalAnalysis.perPlatform,
            perPerson: hierarchicalAnalysis.perPerson,
            individualChats: (hierarchicalAnalysis as any).lightweightIndividualChats.map((chat: any) => ({
                ...chat,
                messages: chat.messages ? chat.messages.slice(0, 10) : [],
                sessions: chat.sessions ? chat.sessions.slice(0, 100) : []
            }))
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2), "utf8");
        jsonSpinner.stop();
        
        const jsonSize = formatBytes(fs.statSync(outputPath).size);
        logSuccess(`JSON analysis written: ${path.basename(outputPath)} (${jsonSize})`);
        
        // Generate HTML report
        const htmlSpinner = new LoadingSpinner("Generating interactive HTML report...");
        htmlSpinner.start();
        
        const htmlPath = outputPath.replace(/\.json$/, '.html');
        const htmlContent = generateHTMLReport(hierarchicalAnalysis, undefined, normalizedChats);
        fs.writeFileSync(htmlPath, htmlContent, "utf8");
        htmlSpinner.stop();
        
        const htmlSize = formatBytes(fs.statSync(htmlPath).size);
        logSuccess(`HTML report generated: ${path.basename(htmlPath)} (${htmlSize})`);
        
        // Final summary
        logHeader("ANALYSIS COMPLETE");
        
        console.log(`${colorize('Summary:', 'bright')}`);
        console.log(`  ${colorize('Chats Analyzed:', 'cyan')} ${formatNumber(hierarchicalAnalysis.overview.totalChats)}`);
        console.log(`  ${colorize('Total Messages:', 'cyan')} ${formatNumber(hierarchicalAnalysis.overview.totalMessages)}`);
        console.log(`  ${colorize('Total Words:', 'cyan')} ${formatNumber(hierarchicalAnalysis.overview.totalWords)}`);
        console.log(`  ${colorize('Total Characters:', 'cyan')} ${formatNumber(hierarchicalAnalysis.overview.totalCharacters)}`);
        console.log(`  ${colorize('Total Emojis:', 'cyan')} ${formatNumber(hierarchicalAnalysis.overview.totalEmojis)}`);
        console.log(`  ${colorize('Participants:', 'cyan')} ${formatNumber(hierarchicalAnalysis.overview.participants.length)}`);
        console.log(`  ${colorize('Platforms:', 'cyan')} ${hierarchicalAnalysis.perPlatform.map(p => p.platform).join(', ')}`);
        console.log(`  ${colorize('Time Spent:', 'cyan')} ${formatDuration(hierarchicalAnalysis.overview.timeSpentMs)}`);
        
        console.log();
        console.log(`${colorize('Output Files:', 'bright')}`);
        console.log(`  ${colorize('JSON Analysis:', 'green')} ${outputPath}`);
        console.log(`  ${colorize('HTML Report:', 'green')} ${htmlPath}`);
        
        console.log();
        logSuccess("Analysis completed successfully!");
        console.log(`${colorize('Open the HTML report in your browser to explore the interactive dashboard.', 'dim')}`);
        
    } catch (error) {
        logError("Error processing chat files");
        console.log(`${colorize('Details:', 'dim')} ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}