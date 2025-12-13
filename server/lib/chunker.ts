export interface TextChunk {
  text: string;
  charStart: number;
  charEnd: number;
  chunkIndex: number;
}

const TARGET_SIZE = 1000;
const MIN_SIZE = 800;
const MAX_SIZE = 1200;
const OVERLAP = 150;

export function chunkText(text: string): TextChunk[] {
  if (!text || text.length === 0) return [];
  
  const chunks: TextChunk[] = [];
  let position = 0;
  let chunkIndex = 0;
  
  while (position < text.length) {
    let end = Math.min(position + TARGET_SIZE, text.length);
    
    // If we're not at the end, try to find a good break point
    if (end < text.length) {
      // Look for paragraph break first
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      if (paragraphBreak > position + MIN_SIZE) {
        end = paragraphBreak + 2;
      } else {
        // Look for sentence break
        const sentenceEnd = findSentenceBreak(text, position + MIN_SIZE, end);
        if (sentenceEnd > 0) {
          end = sentenceEnd;
        } else {
          // Look for word break
          const wordBreak = text.lastIndexOf(" ", end);
          if (wordBreak > position + MIN_SIZE) {
            end = wordBreak + 1;
          }
        }
      }
    }
    
    // Ensure we don't exceed max size
    if (end - position > MAX_SIZE) {
      const wordBreak = text.lastIndexOf(" ", position + MAX_SIZE);
      if (wordBreak > position) {
        end = wordBreak + 1;
      } else {
        end = position + MAX_SIZE;
      }
    }
    
    const chunkText = text.slice(position, end).trim();
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        charStart: position,
        charEnd: end,
        chunkIndex,
      });
      chunkIndex++;
    }
    
    // Move position with overlap (unless this is the last chunk)
    if (end >= text.length) {
      break;
    }
    position = Math.max(position + 1, end - OVERLAP);
  }
  
  return chunks;
}

function findSentenceBreak(text: string, minPos: number, maxPos: number): number {
  const sentenceEnders = [". ", "! ", "? ", ".\n", "!\n", "?\n"];
  let bestPos = -1;
  
  for (const ender of sentenceEnders) {
    let pos = text.lastIndexOf(ender, maxPos);
    if (pos >= minPos && pos > bestPos) {
      bestPos = pos + ender.length;
    }
  }
  
  return bestPos;
}

export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}
