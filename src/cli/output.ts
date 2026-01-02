import path from "node:path";

// ============================================================================
// OUTPUT UTILITIES
// ============================================================================

/**
 * Generates default output path based on input file path
 */
export function getDefaultOutputPath(inputPath: string): string {
    const absolutePath = path.resolve(inputPath);
    const pathInfo = path.parse(absolutePath);
    return path.join(pathInfo.dir, `${pathInfo.name}.json`);
}