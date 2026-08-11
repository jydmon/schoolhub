import { authenticator } from "otplib";

// TOTP-based multi-factor authentication (RFC 6238), compatible with Google
// Authenticator, Authy, 1Password, etc.

authenticator.options = { window: 1 }; // tolerate 1 step of clock drift

export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

/** Build the otpauth:// URI a user scans into their authenticator app. */
export function buildOtpAuthUrl(secret: string, email: string, issuer = "SchoolHub"): string {
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s/g, ""), secret });
  } catch {
    return false;
  }
}
