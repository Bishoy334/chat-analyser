/**
 * Chat Analyser - Main Entry Point
 * 
 * A fast, readable chatanalyse that processes chat exports from various platforms
 * and generates detailed infographics and statistics.
 * 
 * Usage:
 *  npx tsx index.ts path/to/chat/
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { runCLI } from './cli';

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Checks if this script is being run directly (not imported as a module)
 */
function isMainModule(): boolean {
    const thisFile = fileURLToPath(import.meta.url);
    return !!process.argv[1] && path.resolve(process.argv[1]) === thisFile;
}

// Run CLI if this is the main module
if (isMainModule()) {
  runCLI(process.argv).catch((error: unknown) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  });
}

// ============================================================================
// LIBRARY EXPORTS
// ============================================================================

// Re-export everything for library usage
export * from './types';
export * from './parsers';
export * from './analysis';
export * from './html';
export * from './utils';
export * from './cli';