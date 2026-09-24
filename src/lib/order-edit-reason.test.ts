import { describe, expect, it } from 'vitest';
import {
  MIN_REASON,
  REASON_REQUIRED_AR,
  REASON_TOO_SHORT_AR,
  needsReason,
  reasonRefusal,
  substantiveFields,
} from './order-edit-reason';

/**
 * THE GUARD IS THAT AN EDIT ON COMPANY-WIDE AUTHORITY CANNOT BE SILENT.
 *
 * Every test below is the negative: the case where the edit is refused, or
 * the case where asking would be noise. A guard with only the happy path is
 * a comment.
 */

const wide = { companyWideAuthority: true, viaChangeRequest: false };
const scoped = { companyWideAuthority: false, viaChangeRequest: false };

describe('an edit that must say why', () => {
  it.each([
    ['sellingPrice'], ['quantity'], ['discountAmount'], ['shippingCost'], ['items'],
    ['productId'], ['customerName'], ['customerPhone'], ['customerAltPhone'],
    ['customerAddress'], ['regionId'], ['status'], ['confirmationStatus'], ['shippingStatus'],
  ])('%s changed on company-wide authority is refused without one', (field) => {
    const check = { ...wide, changedFields: [field] };
    expect(needsReason(check), field).toBe(true);
    expect(reasonRefusal(check, undefined), field).toBe(REASON_REQUIRED_AR);
    expect(reasonRefusal(check, '   '), field).toBe(REASON_REQUIRED_AR);
  });

  it('refuses a reason too short to mean anything', () => {
    const check = { ...wide, changedFields: ['discountAmount'] };
    expect(reasonRefusal(check, 'ok')).toBe(REASON_TOO_SHORT_AR);
    expect('اتفاق'.length).toBeGreaterThanOrEqual(MIN_REASON);
    expect(reasonRefusal(check, 'اتفاق مع العميل على الهاتف')).toBeNull();
  });

  it('is the owner too, on an order of his own', () => {
    // The document names both: the owner editing what he entered, and the
    // super admin editing anyone's. Neither is exempt.
    expect(needsReason({ ...wide, changedFields: ['discountAmount'] })).toBe(true);
  });
});

describe('an edit that must not be interrogated', () => {
  it('an approved change request carries its own reason', () => {
    const check = { companyWideAuthority: true, viaChangeRequest: true, changedFields: ['quantity'] };
    expect(needsReason(check)).toBe(false);
    expect(reasonRefusal(check, undefined)).toBeNull();
  });

  it('an agent or moderator working within their scope is never asked', () => {
    // ASSIGNED and OWN scopes are the ordinary flow; asking there would put
    // a dialog in front of every call the confirmation desk makes.
    const check = { ...scoped, changedFields: ['customerPhone', 'discountAmount'] };
    expect(needsReason(check)).toBe(false);
    expect(reasonRefusal(check, undefined)).toBeNull();
  });

  it.each([['internalNotes'], ['customerNotes'], ['trackingCode'], ['postponedUntil'], ['moderatorId'], ['channelId']])(
    '%s alone is not substantive, so no reason is demanded',
    (field) => {
      const check = { ...wide, changedFields: [field] };
      expect(needsReason(check), field).toBe(false);
      expect(reasonRefusal(check, undefined), field).toBeNull();
    }
  );

  it('an empty edit asks nothing', () => {
    expect(needsReason({ ...wide, changedFields: [] })).toBe(false);
  });
});

describe('which fields count', () => {
  it('keeps the substantive ones and drops the rest, in the order given', () => {
    expect(substantiveFields(['internalNotes', 'discountAmount', 'trackingCode', 'status'])).toEqual([
      'discountAmount',
      'status',
    ]);
  });

  it('one substantive field among many quiet ones is enough', () => {
    expect(needsReason({ ...wide, changedFields: ['internalNotes', 'trackingCode', 'customerAddress'] })).toBe(true);
  });
});
