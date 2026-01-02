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
export function detectPlatform(filePath: string, content: string): 'whatsapp' | 'instagram' | 'android_messages' {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath, ext).toLowerCase();
  
    // Check for explicit platform indicators in filename
    if (basename.includes('.whatsapp') || basename.includes('_whatsapp')) {
      return 'whatsapp';
    }
    if (basename.includes('.insta') || basename.includes('_insta') || basename.includes('.instagram') || basename.includes('_instagram')) {
      return 'instagram';
    }
    if (basename.includes('.android') || basename.includes('_android') || basename.includes('.sms') || basename.includes('_sms')) {
      return 'android_messages';
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
    
    // Check for Android Messages XML structure
    if (ext === '.xml' && content.includes('<smses>')) {
      return 'android_messages';
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
        
        if (item.isDirectory() && !item.name.startsWith('_')) {
          // Recursively scan subdirectories (skip directories starting with _)
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
          
          const isAndroidMessages = ext === '.xml' && (
            basename.includes('.android') || 
            basename.includes('_android') || 
            basename.includes('.sms') || 
            basename.includes('_sms') ||
            // Also include any .xml file that might be Android Messages (will be validated later)
            true
          );
          
          if (isWhatsApp || isInstagram || isAndroidMessages) {
            chatFiles.push(fullPath);
          }
        }
      }
    }
  
    scanDirectory(directoryPath);
    return chatFiles;
}