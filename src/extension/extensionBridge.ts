/**
 * Extension Bridge
 * Handles authentication and validation of extension requests
 */

import crypto from 'crypto-js';

export interface ExtensionRequest {
  extensionId: string;
  timestamp: number;
  signature: string;
}

export class ExtensionBridge {
  private extensionSecret: string;
  private allowedExtensions: Set<string>;
  private requestTimestampWindow: number = 300; // 5 minutes

  constructor(secret: string = '', allowedExtensions: string = '') {
    this.extensionSecret = secret || process.env.EXTENSION_SECRET || '';
    
    const extensionsStr = allowedExtensions || process.env.ALLOWED_EXTENSIONS || '';
    this.allowedExtensions = new Set(
      extensionsStr.split(',').map(e => e.trim()).filter(Boolean)
    );

    if (!this.extensionSecret) {
      console.warn('[ExtensionBridge] WARNING: No EXTENSION_SECRET configured');
    }

    if (this.allowedExtensions.size === 0) {
      console.warn('[ExtensionBridge] WARNING: No ALLOWED_EXTENSIONS configured');
    }
  }

  /**
   * Validate extension request
   */
  validateRequest(
    headers: Record<string, string | string[] | undefined>,
    body: any
  ): { valid: boolean; error?: string; extensionId?: string } {
    try {
      // Get secret from header
      const secretHeader = headers['x-extension-secret'];
      if (!secretHeader) {
        return { valid: false, error: 'Missing x-extension-secret header' };
      }

      const headerSecret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;

      // Verify secret matches
      if (headerSecret !== this.extensionSecret) {
        return { valid: false, error: 'Invalid extension secret' };
      }

      // Validate timestamp is recent (prevent replay attacks)
      const timestamp = body.timestamp || Date.now() / 1000;
      const now = Date.now() / 1000;

      if (Math.abs(now - timestamp) > this.requestTimestampWindow) {
        return {
          valid: false,
          error: 'Request timestamp too old (potential replay attack)'
        };
      }

      // Validate extension ID is whitelisted
      const extensionId = body.extensionId || 'unknown';
      if (this.allowedExtensions.size > 0 && !this.allowedExtensions.has(extensionId)) {
        return {
          valid: false,
          error: `Extension ID '${extensionId}' is not whitelisted`
        };
      }

      return { valid: true, extensionId };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation error'
      };
    }
  }

  /**
   * Generate signature for extension
   * (Extension uses this to create valid signatures)
   */
  generateSignature(payload: any): string {
    const message = JSON.stringify(payload);
    return crypto.HmacSHA256(message, this.extensionSecret).toString();
  }

  /**
   * Verify signature from extension
   */
  verifySignature(payload: any, signature: string): boolean {
    const expectedSignature = this.generateSignature(payload);
    return expectedSignature === signature;
  }

  /**
   * Get extension info
   */
  getExtensionInfo(): {
    secretConfigured: boolean;
    extensionsWhitelisted: number;
    allowedExtensions: string[];
  } {
    return {
      secretConfigured: !!this.extensionSecret,
      extensionsWhitelisted: this.allowedExtensions.size,
      allowedExtensions: Array.from(this.allowedExtensions)
    };
  }
}

// Singleton instance
let extensionBridgeInstance: ExtensionBridge | null = null;

export function getExtensionBridge(): ExtensionBridge {
  if (!extensionBridgeInstance) {
    extensionBridgeInstance = new ExtensionBridge();
  }
  return extensionBridgeInstance;
}
