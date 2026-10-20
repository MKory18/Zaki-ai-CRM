import { PrismaClient } from '@prisma/client';
import { missingDelegates } from './lib/safety-rules.mjs';

// The exact wipe list from run.mjs — verified against the REAL generated client.
const WIPE_MODELS = [
  'orderItem', 'orderActivity', 'orderNote', 'orderStatusLog',
  'orderContactAttempt', 'orderClaimHistory', 'orderChangeRequest',
  'orderIssue', 'orderAddOn', 'deliveryAttempt',
  'returnReceipt', 'callLog', 'financialTransaction',
  'commissionEntry', 'settlementMatch', 'conversionDelivery',
  'walletMovement', 'walletTransfer', 'dailyClosing',
  'walletOpeningCount', 'wallet',
  'statementLine', 'statementReceipt', 'courierStatement',
  'penalty', 'payslip', 'commissionPayout',
  'commissionPeriod', 'commissionRule', 'penaltyRule',
  'attendanceMark', 'aiDailySummary', 'notification',
  'productReview', 'productImage',
  'landingPageView', 'landingPageRecommendation',
  'customConversion', 'trackingPixel', 'adAccount', 'campaign',
  'storeFont', 'storePage', 'storeMenu', 'storeRedirect',
  'telegramMessage', 'telegramSource',
  'whatsAppMessage', 'whatsAppConversation', 'whatsAppConnection',
  'appDelivery', 'appInstall', 'app',
  'idempotencyRecord', 'systemToken',
];

const p = new PrismaClient();
const missing = missingDelegates(WIPE_MODELS, p);
console.log(missing.length ? 'MISSING: ' + missing.join(', ') : `ALL ${WIPE_MODELS.length} delegates present`);
await p.$disconnect();
process.exit(missing.length ? 1 : 0);
