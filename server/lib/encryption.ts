import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import CryptoJS from 'crypto-js'; // kept for legacy decrypt only — TODO: remove after all connectors reconnected

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '';
const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_SALT = Buffer.from('tracepilot-v2');

function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, KEY_SALT, 32);
}

export function encrypt(text: string): string {
  if (!ENCRYPTION_KEY) return text;
  const key = deriveKey(ENCRYPTION_KEY);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  // Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  if (!ENCRYPTION_KEY) return ciphertext;

  // New format has exactly 2 colons (3 parts)
  const parts = ciphertext.split(':');
  if (parts.length === 3) {
    try {
      const [ivHex, tagHex, encHex] = parts;
      const key = deriveKey(ENCRYPTION_KEY);
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
    } catch {
      return ciphertext;
    }
  }

  // Legacy CryptoJS path — decrypt with old library
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    const plain = bytes.toString(CryptoJS.enc.Utf8);
    if (plain) return plain;
  } catch { /* fall through */ }
  return ciphertext;
}

export function isEncrypted(): boolean {
  return !!ENCRYPTION_KEY;
}
