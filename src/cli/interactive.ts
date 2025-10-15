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
    showPlatformInfo,
    formatNumber,
    formatBytes,
    formatDuration,
    createReadlineInterface,
    askQuestion,
    askChoice,
    showMainMenu,
    showFolderBrowser,
    discoverAssetFolders,
    showAnalysisPreview
} from './cli.utils';

// ============================================================================
// INTERACTIVE CLI MAIN LOGIC
// ============================================================================

/**
 * Interactive CLI execution function
 */
export async function runInteractiveCLI(): Promise<void> {
    const rl = createReadlineInterface();
    
    try {
        // Show ASCII logo
        console.log(ASCII_LOGO);
        
        logInfo("Welcome to the Chat Analyzer Interactive Mode!");
        logInfo("This tool will help you analyze chat exports from WhatsApp, Instagram, and Android Messages.");
        
        while (true) {
            showMainMenu();
            
            const choice = await askQuestion(rl, "Enter your choice (1-5): ");
            
            let shouldExit = false;
            
            switch (choice) {
                case '1':
                    const customResult = await handleCustomDirectory(rl);
                    if (customResult === false) {
                        shouldExit = true;
                    }
                    break;
                case '2':
                    const sampleResult = await handleSampleDatasets(rl);
                    if (sampleResult === false) {
                        shouldExit = true;
                    }
                    break;
                case '3':
                    showPlatformInfo();
                    break;
                case '4':
                    showUsage();
                    break;
                case '5':
                    console.log(`\n${colorize('Thank you for using Chat Analyzer!', 'green')}`);
                    shouldExit = true;
                    break;
                default:
                    logError("Invalid choice. Please enter a number between 1 and 5.");
            }
            
            if (shouldExit) {
                rl.close();
                return;
            }
            
            if (choice !== '1' && choice !== '2') {
                await askQuestion(rl, "\nPress Enter to continue...");
            }
        }
        
    } catch (error) {
        logError("An unexpected error occurred");
        console.log(`${colorize('Details:', 'dim')} ${error instanceof Error ? error.message : String(error)}`);
        rl.close();
        process.exit(1);
    }
}

/**
 * Handle custom directory analysis
 */
async function handleCustomDirectory(rl: any): Promise<boolean | void> {
    logHeader("CUSTOM DIRECTORY ANALYSIS");
    
    const directoryPath = await askQuestion(rl, "Enter the path to your chat files directory: ");
    
    if (!directoryPath) {
        logError("No directory path provided.");
        return true;
    }
    
    const resolvedPath = path.resolve(directoryPath);
    
    if (!fs.existsSync(resolvedPath)) {
        logError(`Directory does not exist: ${resolvedPath}`);
        return true;
    }
    
    if (!fs.statSync(resolvedPath).isDirectory()) {
        logError(`Path is not a directory: ${resolvedPath}`);
        return true;
    }
    
    showAnalysisPreview(resolvedPath);
    
    const confirm = await askQuestion(rl, "Do you want to proceed with the analysis? (y/N): ");
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
        logInfo("Analysis cancelled.");
        return true;
    }
    
    const shouldContinue = await runAnalysis(resolvedPath, rl);
    return shouldContinue;
}

/**
 * Handle sample datasets analysis
 */
async function handleSampleDatasets(rl: any): Promise<boolean | void> {
    logHeader("SAMPLE DATASETS");
    
    const assetsPath = path.join(process.cwd(), 'assets');
    const folders = discoverAssetFolders(assetsPath);
    
    showFolderBrowser(folders);
    
    if (folders.length === 0) {
        logInfo("No sample datasets available. You can add your own chat files to the assets directory.");
        return true;
    }
    
    const folderNames = folders.map(folder => folder.split('/').pop() || folder);
    const selectedFolder = await askChoice(rl, "Select a dataset to analyze:", folderNames);
    
    const selectedPath = folders.find(folder => folder.split('/').pop() === selectedFolder);
    
    if (!selectedPath) {
        logError("Selected folder not found.");
        return true;
    }
    
    showAnalysisPreview(selectedPath);
    
    const confirm = await askQuestion(rl, "Do you want to proceed with the analysis? (y/N): ");
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
        logInfo("Analysis cancelled.");
        return true;
    }
    
    const shouldContinue = await runAnalysis(selectedPath, rl);
    return shouldContinue;
}

/**
 * Run the actual analysis
 */
async function runAnalysis(inputPath: string, rl: any): Promise<boolean> {
    const outputPath = path.join(inputPath, 'hierarchical_analysis.json');
    
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
            return true; // Return to main menu
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
        
        // Ask if user wants to run another analysis
        console.log();
        const continueChoice = await askQuestion(rl, "Would you like to run another analysis? (y/N): ");
        
        if (continueChoice.toLowerCase() === 'y' || continueChoice.toLowerCase() === 'yes') {
            console.log();
            logInfo("Returning to main menu...");
            return true; // Indicate we should continue the main loop
        } else {
            console.log();
            logInfo("Thank you for using Chat Analyzer!");
            return false; // Indicate we should exit
        }
        
    } catch (error) {
        logError("Error processing chat files");
        console.log(`${colorize('Details:', 'dim')} ${error instanceof Error ? error.message : String(error)}`);
        
        // Ask if user wants to try again
        console.log();
        const retryChoice = await askQuestion(rl, "Would you like to try again? (y/N): ");
        
        if (retryChoice.toLowerCase() === 'y' || retryChoice.toLowerCase() === 'yes') {
            console.log();
            logInfo("Returning to main menu...");
            return true; // Indicate we should continue the main loop
        } else {
            console.log();
            logInfo("Thank you for using Chat Analyzer!");
            return false; // Indicate we should exit
        }
    }
}
