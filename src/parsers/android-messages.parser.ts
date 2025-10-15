import * as xml2js from 'xml2js';
import type { ParsedChat, Message } from '../types';
import { 
  stripControlMarks, 
  normaliseParticipantName, 
  getMediaType 
} from '../utils/text.utils';

// ============================================================================
// ANDROID MESSAGES PARSER
// ============================================================================

/**
 * Android Messages XML SMS message structure
 */
type AndroidSMS = {
  protocol: string;
  address: string;
  date: string;
  type: string;
  subject?: string;
  body: string;
  toa?: string;
  sc_toa?: string;
  service_center?: string;
  read: string;
  status: string;
  locked: string;
  date_sent: string;
  sub_id: string;
  readable_date: string;
  contact_name: string;
};

/**
 * Android Messages XML MMS message structure
 */
type AndroidMMS = {
  date: string;
  rr?: string;
  sub?: string;
  ct_t?: string;
  read_status?: string;
  seen: string;
  msg_box: string;
  address: string;
  sub_cs?: string;
  resp_st?: string;
  retr_st?: string;
  d_tm?: string;
  text_only: string;
  exp?: string;
  locked: string;
  m_id?: string;
  st?: string;
  retr_txt_cs?: string;
  retr_txt?: string;
  creator: string;
  date_sent: string;
  read: string;
  m_size?: string;
  rpt_a?: string;
  ct_cls?: string;
  pri?: string;
  sub_id: string;
  tr_id?: string;
  resp_txt?: string;
  ct_l?: string;
  m_cls?: string;
  d_rpt?: string;
  v?: string;
  _id: string;
  m_type: string;
  readable_date: string;
  contact_name: string;
  parts?: {
    part: Array<{
      seq: string;
      ct: string;
      name?: string;
      chset: string;
      cd?: string;
      fn?: string;
      cid?: string;
      cl?: string;
      ctt_s?: string;
      ctt_t?: string;
      text?: string;
      sub_id: string;
    }>;
  };
  addrs?: {
    addr: Array<{
      address: string;
      type: string;
      charset: string;
    }>;
  };
};

/**
 * Processes a single SMS message
 */
function processSMSMessage(sms: AndroidSMS): Message | null {
  // Parse timestamp (Android uses milliseconds since epoch)
  const timestamp = new Date(parseInt(sms.date, 10));
  
  // Determine sender based on message type
  // type="1" = received (incoming from contact), type="2" = sent (outgoing from phone owner)
  let sender: string | undefined;
  if (sms.type === '1') {
    // Received message - sender is the contact
    sender = sms.contact_name ? normaliseParticipantName(sms.contact_name) : undefined;
  } else if (sms.type === '2') {
    // Sent message - sender is unknown (phone owner), will be resolved during name normalization
    sender = undefined; // Let the CLI handle name normalization
  }
  
  // Clean up message body
  let messageText = sms.body || '';
  
  // Decode HTML entities (like &#128557; for emojis)
  messageText = messageText.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });
  
  // Check if this is a media message
  const mediaType = getMediaType(messageText);
  const isMediaMessage = mediaType !== null;
  
  return {
    timestamp,
    from: sender,
    text: stripControlMarks(messageText),
    isSystem: false,
    isMediaNotice: isMediaMessage,
    mediaType: mediaType || undefined,
    platform: 'android_messages'
  };
}

/**
 * Processes a single MMS message
 */
function processMMSMessage(mms: AndroidMMS): Message | null {
  // Parse timestamp (Android uses milliseconds since epoch)
  const timestamp = new Date(parseInt(mms.date, 10));
  
  // Determine sender based on message box
  // msg_box="1" = received (incoming from contact), msg_box="2" = sent (outgoing from phone owner)
  let sender: string | undefined;
  if (mms.msg_box === '1') {
    // Received message - sender is the contact
    sender = mms.contact_name ? normaliseParticipantName(mms.contact_name) : undefined;
  } else if (mms.msg_box === '2') {
    // Sent message - sender is unknown (phone owner), will be resolved during name normalization
    sender = undefined; // Let the CLI handle name normalization
  }
  
  // Extract text content from parts
  let messageText = '';
  if (mms.parts && mms.parts.part) {
    const parts = Array.isArray(mms.parts.part) ? mms.parts.part : [mms.parts.part];
    
    for (const part of parts) {
      if (part.ct === 'text/plain' && part.text) {
        let partText = part.text;
        
        // Handle different character sets
        const charset = parseInt(part.chset, 10);
        if (charset === 106) {
          // UTF-8 encoding - decode HTML entities
          partText = partText.replace(/&#(\d+);/g, (match, dec) => {
            return String.fromCharCode(parseInt(dec, 10));
          });
        } else if (charset === 3) {
          // ISO-8859-1 encoding - might need special handling
          // For now, treat as regular text
        }
        
        messageText += partText;
      }
    }
  }
  
  // If no text content found, check if it's a media-only message
  if (!messageText.trim()) {
    if (mms.parts && mms.parts.part) {
      const parts = Array.isArray(mms.parts.part) ? mms.parts.part : [mms.parts.part];
      const mediaParts = parts.filter(part => part.ct && part.ct !== 'text/plain');
      
      if (mediaParts.length > 0) {
        // This is a media message
        const mediaTypes = mediaParts.map(part => {
          if (part.ct?.includes('image')) return 'image';
          if (part.ct?.includes('video')) return 'video';
          if (part.ct?.includes('audio')) return 'audio';
          return 'media';
        });
        
        messageText = `${sender || 'Unknown'} sent ${mediaTypes.join(', ')}`;
        
        return {
          timestamp,
          from: sender,
          text: messageText,
          isSystem: false,
          isMediaNotice: true,
          mediaType: mediaTypes[0],
          platform: 'android_messages'
        };
      }
    }
    
    // If we still have no content, skip this message
    return null;
  }
  
  // Check if this is a media message
  const mediaType = getMediaType(messageText);
  const isMediaMessage = mediaType !== null;
  
  return {
    timestamp,
    from: sender,
    text: stripControlMarks(messageText),
    isSystem: false,
    isMediaNotice: isMediaMessage,
    mediaType: mediaType || undefined,
    platform: 'android_messages'
  };
}

/**
 * Parses Android Messages XML export into structured message data
 */
export async function parseAndroidMessages(xmlContent: string, title?: string): Promise<ParsedChat> {
  const messages: Message[] = [];
  const participants = new Set<string>();
  
  // Parse XML content using xml2js
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true
  });
  
  const result = await parser.parseStringPromise(xmlContent);
  
  // Check if we have the expected structure
  if (!result.smses) {
    throw new Error('Invalid Android Messages XML format: missing smses element');
  }
  
  // Process SMS messages
  if (result.smses.sms) {
    const smsArray = Array.isArray(result.smses.sms) ? result.smses.sms : [result.smses.sms];
    
    for (const sms of smsArray) {
      const message = processSMSMessage(sms);
      if (message) {
        messages.push(message);
        // Only add named participants (contacts), not undefined senders (phone owner)
        if (message.from) {
          participants.add(message.from);
        }
      }
    }
  }
  
  // Process MMS messages
  if (result.smses.mms) {
    const mmsArray = Array.isArray(result.smses.mms) ? result.smses.mms : [result.smses.mms];
    
    for (const mms of mmsArray) {
      const message = processMMSMessage(mms);
      if (message) {
        messages.push(message);
        // Only add named participants (contacts), not undefined senders (phone owner)
        if (message.from) {
          participants.add(message.from);
        }
      }
    }
  }
  
  // Sort messages by timestamp
  messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  return {
    messages,
    participants,
    platform: 'android_messages' as const,
    title
  };
}
