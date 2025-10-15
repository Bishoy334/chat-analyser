/**
 * File Utilities
 */

import fs from "fs";
import path from "path";

// ============================================================================
// FILE DETECTION & DISCOVERY
// ============================================================================

/**
 * Detects the platform type based on file extension and content
 */
export function detectPlatform(filePath: string, content: string): 'whatsapp' | 'instagram' {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath, ext).toLowerCase();
  
    // Check for explicit platform indicators in filename
    if (basename.includes('.whatsapp') || basename.includes('_whatsapp')) {
      return 'whatsapp';
    }
    if (basename.includes('.insta') || basename.includes('_insta') || basename.includes('.instagram') || basename.includes('_instagram')) {
      return 'instagram';
    }
  
    // Fallback to content detection
    if (ext === '.json') {
      try {
        const data = JSON.parse(content);
        // Check if it has Instagram export structure
        if (data.participants && Array.isArray(data.participants) && 
          data.messages && Array.isArray(data.messages) &&
          data.messages.length > 0 && data.messages[0].timestamp_ms) {
        return 'instagram';
        }
      } catch {
        // Not valid JSON, treat as WhatsApp
      }
    }
    return 'whatsapp';
}

/**
 * Discovers chat files in a directory with platform-specific extensions
 */
export function discoverChatFiles(directoryPath: string): string[] {
    const chatFiles: string[] = [];
  
    function scanDirectory(dir: string) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        
        if (item.isDirectory()) {
          // Recursively scan subdirectories
          scanDirectory(fullPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          const basename = path.basename(item.name, ext).toLowerCase();
          
          // Check for chat file patterns
          const isWhatsApp = ext === '.txt' || 
            basename.includes('.whatsapp') || 
            basename.includes('_whatsapp');
          
          const isInstagram = ext === '.json' && (
            basename.includes('.insta') || 
            basename.includes('_insta') || 
            basename.includes('.instagram') || 
            basename.includes('_instagram') ||
            // Also include any .json file that might be Instagram (will be validated later)
            true
          );
          
          if (isWhatsApp || isInstagram) {
            chatFiles.push(fullPath);
          }
        }
      }
    }
  
    scanDirectory(directoryPath);
    return chatFiles;
}