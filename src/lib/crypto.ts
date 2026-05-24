// Client-side encryption utility using browser Web Crypto API (AES-GCM)
export const ENCRYPTION_PREFIX = 'ENC:';

// Helper to convert string to BufferSource
const getBytes = (text: string): BufferSource => new TextEncoder().encode(text) as unknown as BufferSource;

// Helper to convert ArrayBuffer to string
const getString = (bytes: ArrayBuffer): string => new TextDecoder().decode(bytes);

// Convert ArrayBuffer or Uint8Array to Base64
const bufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
};

// Convert Base64 to Uint8Array
const base64ToBuffer = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Derive a CryptoKey from a passphrase and salt using PBKDF2
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    getBytes(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts cleartext using AES-GCM with a key derived from the password.
 * Format: ENC:<Base64(salt + iv + ciphertext)>
 */
export async function encryptContent(text: string, secret: string): Promise<string> {
  if (!text) return '';
  if (!secret) throw new Error('Encryption secret is required');

  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(secret, salt);

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as any,
      },
      key,
      getBytes(text)
    );

    const combined = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);

    return ENCRYPTION_PREFIX + bufferToBase64(combined);
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Could not encrypt content.');
  }
}

/**
 * Decrypts encrypted text using the password.
 * If the input doesn't start with ENCRYPTION_PREFIX, it is returned as-is (legacy fallback).
 */
export async function decryptContent(encryptedText: string, secret: string): Promise<string> {
  if (!encryptedText) return '';
  if (!encryptedText.startsWith(ENCRYPTION_PREFIX)) {
    // Return unmodified if not encrypted
    return encryptedText;
  }

  if (!secret) {
    return '[Locked - Set Sanctuary Password]';
  }

  try {
    const rawBase64 = encryptedText.substring(ENCRYPTION_PREFIX.length);
    const combined = base64ToBuffer(rawBase64);

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const key = await deriveKey(secret, salt);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as any,
      },
      key,
      ciphertext as any
    );

    return getString(decryptedBuffer);
  } catch (error) {
    console.error('Decryption failed:', error);
    return '[Encrypted - Decryption Failed (Incorrect password?)]';
  }
}
