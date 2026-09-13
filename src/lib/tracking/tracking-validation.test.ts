import { describe, expect, it } from 'vitest';
import {
  validateMetaPixelId,
  validateSnapchatPixelId,
  validateTikTokPixelId,
  validateTrackingPixelId,
} from '@/lib/tracking/tracking-validation';
import { validatePixelId } from '@/lib/landing-tracking';

describe('Meta Pixel ID validation', () => {
  it('accepts valid 15-16 digit IDs', () => {
    expect(validateMetaPixelId('123456789012345')).toBe('123456789012345');
    expect(validateMetaPixelId('1234567890123456')).toBe('1234567890123456');
    expect(validateMetaPixelId(' 123456789012345 ')).toBe('123456789012345');
  });

  it('rejects invalid Meta IDs (fail closed)', () => {
    expect(validateMetaPixelId('12345')).toBeNull();
    expect(validateMetaPixelId('12345678901234567')).toBeNull();
    expect(validateMetaPixelId('abcdefgh')).toBeNull();
    expect(validateMetaPixelId('')).toBeNull();
    expect(validateMetaPixelId(null)).toBeNull();
    expect(validateMetaPixelId(undefined)).toBeNull();
  });

  it('rejects injection attempts', () => {
    expect(validateMetaPixelId('javascript:alert(1)')).toBeNull();
    expect(validateMetaPixelId('<script>alert(1)</script>')).toBeNull();
    expect(validateMetaPixelId('123456789012345;fbq(1)')).toBeNull();
    expect(validateMetaPixelId('data:text/html,<b>x</b>')).toBeNull();
  });

  it('legacy validatePixelId stays compatible', () => {
    expect(validatePixelId('123456789012345')).toBe('123456789012345');
    expect(validatePixelId('<script>')).toBeNull();
  });
});

describe('TikTok Pixel ID validation', () => {
  it('accepts valid alphanumeric IDs', () => {
    expect(validateTikTokPixelId('C4ABCD1234567890')).toBe('C4ABCD1234567890');
    expect(validateTikTokPixelId('ABCDEFGH')).toBe('ABCDEFGH');
  });

  it('rejects invalid TikTok IDs', () => {
    expect(validateTikTokPixelId('AB1')).toBeNull();
    expect(validateTikTokPixelId('ABCD1234-')).toBeNull();
    expect(validateTikTokPixelId('<img src=x onerror=alert(1)>')).toBeNull();
    expect(validateTikTokPixelId('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeNull();
  });
});

describe('Snapchat Pixel ID validation', () => {
  const uuid = '110ec58a-a0f2-4ac4-8393-c866d813b8d1';

  it('accepts valid UUIDs', () => {
    expect(validateSnapchatPixelId(uuid)).toBe(uuid);
    expect(validateSnapchatPixelId(uuid.toUpperCase())).toBe(uuid.toUpperCase());
  });

  it('rejects invalid Snapchat IDs', () => {
    expect(validateSnapchatPixelId('not-a-uuid')).toBeNull();
    expect(validateSnapchatPixelId('110ec58aa0f24ac48393c866d813b8d1')).toBeNull();
    expect(validateSnapchatPixelId('110ec58a-a0f2-4ac4-8393-c866d813b8d!')).toBeNull();
  });
});

describe('platform dispatch validation (fail closed)', () => {
  it('unknown platform is always rejected', () => {
    expect(validateTrackingPixelId('GOOGLE', '123456789012345')).toBeNull();
    expect(validateTrackingPixelId('FAKE;fbq', '123456789012345')).toBeNull();
  });

  it('IDs are only valid for their own platform shape', () => {
    expect(validateTrackingPixelId('META', 'C4ABCD1234567890')).toBeNull();
    expect(validateTrackingPixelId('TIKTOK', '123456789012345')).toBe('123456789012345');
  });
});
