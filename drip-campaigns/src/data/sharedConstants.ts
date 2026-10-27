// Ported from journeysnudgesemi/emi-conversions-prototype.html (2026-09-25)
// as a one-time fork, not a live shared source — there's no backend
// behind either app, so future edits to these constants in the plain-HTML
// prototype will NOT automatically propagate here. See CLAUDE.md if this
// ever needs re-syncing.
//
// Only the constants Drip Campaigns' own code actually reads are ported —
// confirmed against the real Drip Campaigns source (dcDrawerFormFor,
// dcCondRowsHtml, dcRecomputeLabelMeta, etc.), not assumed from adjacency.
// CHANNEL_LABELS (a near-duplicate of CHANNEL_CONFIG_LABELS with only one
// use site in the original) was deliberately dropped — this port uses
// CHANNEL_CONFIG_LABELS consistently instead.

export type Channel = 'SMS' | 'EMAIL' | 'RCS' | 'WHATSAPP';

export const CHANNEL_CONFIG_LABELS: Record<Channel, string> = {
  SMS: 'SMS',
  EMAIL: 'E-mail',
  RCS: 'RCS',
  WHATSAPP: 'WhatsApp',
};

export interface CommsTemplate {
  id: string;
  name: string;
  channelType: Channel;
  partnerName: string;
  vendorName: string;
  accountName: string;
  createdOn: string;
  message?: string;
  body?: string;
}

export const COMMS_TEMPLATES: CommsTemplate[] = [
  { id: 'CT-3301', name: 'EMI Conversion SMS', channelType: 'SMS', partnerName: 'IndusInd Bank (IBL)', vendorName: 'Karix', accountName: 'IBL-Karix-Txns', createdOn: '22 Jul 2026, 10:12', message: 'Hi ${customerFirstName}, convert your recent purchase to EMI in just 2 taps: ${shortUrl}' },
  { id: 'CT-3288', name: 'Festive Offer Email', channelType: 'EMAIL', partnerName: 'IndusInd Bank (IBL)', vendorName: 'Karix', accountName: 'IBL-Karix-Mktg', createdOn: '18 Jul 2026, 15:40', body: '<h2>Hi ${customerFirstName}</h2><p>Your festive EMI offer is here.</p>' },
  { id: 'CT-3270', name: 'Activation Reminder WhatsApp', channelType: 'WHATSAPP', partnerName: 'Yes Bank', vendorName: 'Gupshup', accountName: 'YES-Gupshup-Onb', createdOn: '10 Jul 2026, 09:05', message: 'Hi ${customerFirstName}, activate your card now: ${shortUrl}' },
  { id: 'CT-3255', name: 'OS-to-EMI RCS Push', channelType: 'RCS', partnerName: 'IndusInd Bank (IBL)', vendorName: 'Karix', accountName: 'IBL-Karix-Txns', createdOn: '02 Jul 2026, 12:00', message: 'Convert your outstanding balance to easy EMIs, ${customerFirstName}.' },
  { id: 'CT-3310', name: 'Auth-to-EMI Consent WhatsApp', channelType: 'WHATSAPP', partnerName: 'IndusInd Bank (IBL)', vendorName: 'Karix', accountName: 'IBL-Karix-Txns', createdOn: '10 Sep 2026, 09:00', message: 'Hi ${customerFirstName}, you have an eligible transaction — convert to EMI in 2 taps: ${shortUrl}' },
  { id: 'CT-3311', name: 'Auth-to-EMI Reminder WhatsApp', channelType: 'WHATSAPP', partnerName: 'IndusInd Bank (IBL)', vendorName: 'Karix', accountName: 'IBL-Karix-Txns', createdOn: '10 Sep 2026, 09:05', message: 'Still deciding? Your EMI conversion offer is open for a limited time: ${shortUrl}' },
  { id: 'CT-3312', name: 'EMI Outcome Notification WhatsApp', channelType: 'WHATSAPP', partnerName: 'IndusInd Bank (IBL)', vendorName: 'Karix', accountName: 'IBL-Karix-Txns', createdOn: '10 Sep 2026, 09:10', message: 'Update on your EMI request: ${emiStatus}. Check Manage EMIs for details.' },
  { id: 'CT-3313', name: 'Card Activation WhatsApp', channelType: 'WHATSAPP', partnerName: 'IndusInd Bank (IBL)', vendorName: 'Karix', accountName: 'IBL-Karix-Onb', createdOn: '10 Sep 2026, 09:15', message: 'Hi ${customerFirstName}, activate your new card and set your PIN: ${shortUrl}' },
  { id: 'CT-3314', name: 'PIN Setup Reminder WhatsApp', channelType: 'WHATSAPP', partnerName: 'IndusInd Bank (IBL)', vendorName: 'Karix', accountName: 'IBL-Karix-Onb', createdOn: '10 Sep 2026, 09:20', message: "You're almost there — finish setting your PIN to start using your card: ${shortUrl}" },
];

export const PROGRAM_OPTIONS: Record<string, string[]> = {
  'IndusInd Bank (IBL)': ['Platinum Aura', 'Signature Rewards'],
  'Yes Bank': ['Prosperity Card'],
};

const ISSUER_MAKER_CHECKER: Record<string, boolean> = {
  'IndusInd Bank (IBL)': false,
  'Yes Bank': true,
};
const PROGRAM_MAKER_CHECKER: Record<string, boolean> = {
  'Platinum Aura': true,
  'Signature Rewards': false,
  'Prosperity Card': false,
};
// Maker-checker is never determined by scope type alone — it's the
// issuer's own config OR any specifically-selected program's own flag.
export function computeMakerCheckerFlag(issuer: string, programs: string[]): boolean {
  if (ISSUER_MAKER_CHECKER[issuer]) return true;
  return (programs || []).some((p) => PROGRAM_MAKER_CHECKER[p]);
}

export interface EventCategoryMeta {
  events: string[];
  isNew?: boolean;
}
export const EVENT_CATEGORIES: Record<string, EventCategoryMeta> = {
  'Journey Events': { events: ['Journey Progress', 'Pageload', 'Button Click'] },
  'Offer Events': { events: ['Outcome Issuance'] },
  // Proposed, not real in Quibbler today — see the Transaction Event-Based
  // Nudges PRD. Marked isNew so the wizard visibly flags these as
  // not-yet-built rather than blending them in as audited, current
  // behavior.
  'Transaction Events': { events: ['Transaction'], isNew: true },
  'EMI Events': { events: ['EMI_STATUS_CHANGED'], isNew: true },
  'Card Events': {
    events: [
      'Virtual card issued',
      'Physical card issued',
      'Virtual card activated',
      'Physical card activated',
      'PIN set',
      'First transaction done',
      'Card hotlisted',
      'Card locked',
      'Card unlocked',
      'Card control updated',
    ],
    isNew: true,
  },
};

// Which flow a customer completed a triggering action through.
export const JOURNEY_OPTIONS = ['Txn-to-EMI', 'Multi-Txn-to-EMI', 'OS-to-EMI', 'Onboarding', 'Card Activation'];
export const EVENT_SOURCE_OPTIONS = ['PWA', ...JOURNEY_OPTIONS];

// Real, authoritative `TransactionType` enum — every value except the 2
// @Deprecated Rewards ones.
export const TRANSACTION_SUBTYPE_OPTIONS = [
  'ADD_FUND', 'ADD_FUND_REVERSAL', 'REVERSAL', 'SWEEP_IN', 'SWEEP_OUT',
  'AUTHORIZATION_REVERSAL', 'AUTHORIZE', 'CASHBACK', 'CASHBACK_REVERSAL',
  'CHARGEBACK', 'CHARGEBACK_REVERSAL', 'EMI_PRINCIPAL', 'EMI_INTEREST',
  'EMI_FORECLOSURE_DEBIT', 'FEE', 'FEE_REVERSAL', 'INTEREST', 'INTEREST_REVERSAL',
  'REFUND', 'REFUND_REVERSAL', 'REMITTANCE', 'REMITTANCE_REVERSAL', 'REPAYMENT',
  'REPAYMENT_REVERSAL', 'SETTLEMENT_CREDIT', 'SETTLEMENT_CREDIT_CASH',
  'SETTLEMENT_DEBIT', 'SETTLEMENT_DEBIT_CASH', 'EFT_WITHDRAWAL',
  'EFT_WITHDRAWAL_REVERSAL', 'SURCHARGE', 'SURCHARGE_REVERSAL', 'TAX', 'TAX_REVERSAL',
];

// 'bool' is a yes/no question and reads as Yes / No, on the row and on
// Review. 'onoff' is the same shape worded for a card control, so a row
// reads "Domestic online is turned on" rather than "... is Yes".
export type AttrType = 'date' | 'select' | 'bool' | 'onoff' | 'number' | 'list' | 'smartTag' | 'multiSelect' | 'highestTxnEMI' | 'none';
export const YES_NO = ['Yes', 'No'];
export const ON_OFF = ['turned on', 'turned off'];

// The four card-control channels, and the three limits each one carries.
// The amount already spent against a limit is deliberately not here: it is
// not something a campaign filters on.
export const CARD_CONTROL_CHANNELS = ['Domestic chip', 'Domestic contactless', 'Domestic online', 'Domestic card swipe'];
export const CARD_CONTROL_LIMITS = ['single payment limit', 'daily limit', 'monthly limit'];
export const CARD_CONTROL_CHANGES = ['turned on', 'turned off', ...CARD_CONTROL_LIMITS];
export const HOTLIST_REASONS = ['Damaged'];
export interface AttrMeta {
  type: AttrType;
  options?: string[];
  // How this number reads in a sentence. Only affects display: '20000'
  // stays '20000' in storage, and shows as '₹20,000' or '70%'.
  unit?: 'rupees' | 'percent';
}
export const ELIGIBILITY_META: Record<string, Record<string, AttrMeta>> = {
  Customer: {
    'Date of Birth': { type: 'date' },
    'KYC Status': { type: 'select', options: ['Small KYC', 'FKYC'] },
    'FKYC Method': { type: 'select', options: ['CKYC', 'VKYC'] },
    'FKYC Status': { type: 'select', options: ['Not Initiated', 'Pending', 'Rejected', 'Completed'] },
    'Created On': { type: 'date' },
    'Last Updated On': { type: 'date' },
  },
  Account: {
    'Current OS amount': { type: 'number', unit: 'rupees' },
    'Current limit': { type: 'number', unit: 'rupees' },
    // The limit the bank sanctioned, which is NOT the unused/available
    // limit. Named in full so the two can't be confused in the picker.
    'Assigned limit': { type: 'number', unit: 'rupees' },
    // Current outstanding divided by current limit, as a whole percent. A
    // current limit of 0 matches nothing — there is no percentage of zero.
    // Nothing here is computed by the prototype; these are the campaign's
    // words for columns the platform already holds.
    Utilization: { type: 'number', unit: 'percent' },
    Interest: { type: 'number', unit: 'rupees' },
    // Yes means the stored status is success.
    'eSign completed': { type: 'bool' },
    'eNACH completed': { type: 'bool' },
    Status: { type: 'select', options: ['Active', 'Charge off', 'Pending closure', 'Closed', 'Dormant', 'Suspended', 'Forced suspended'] },
    'Smart Tag': { type: 'smartTag' },
    'Statement Due Date': { type: 'date' },
    'Created On': { type: 'date' },
    'Last Updated On': { type: 'date' },
    'Account Block Codes': { type: 'list' },
  },
  Card: {
    Status: { type: 'select', options: ['Active', 'Inactive'] },
    'Smart Tag': { type: 'smartTag' },
    'Card Expiry': { type: 'date' },
    'Card Type': { type: 'select', options: ['Physical', 'Virtual', 'Virtual Upgrade To Physical', 'Phygital'] },
    'Physically Issued': { type: 'bool' },
    'Virtually Issued': { type: 'bool' },
    'Physical Card Activated': { type: 'bool' },
    'Virtual Card Activated': { type: 'bool' },
    'Is Ever Activated': { type: 'bool' },
    Locked: { type: 'bool' },
    Blocked: { type: 'bool' },
    'Created On': { type: 'date' },
    'Last Updated On': { type: 'date' },
    'Card Block Codes': { type: 'list' },
    Hotlisted: { type: 'bool' },
    'Hotlist reason': { type: 'select', options: HOTLIST_REASONS },
    'First transaction done': { type: 'bool' },
    'First purchase done': { type: 'bool' },
    'First repayment done': { type: 'bool' },
    'PIN set': { type: 'bool' },
    'Primary card': { type: 'bool' },
  },
  // The card's controls as they stand right now. One row is one channel and
  // one thing about it: whether it is on, or one of its three limits. A
  // limit row only matches when that limit is turned on; the channel's own
  // on/off is its own separate row.
  'Card controls': Object.fromEntries(
    CARD_CONTROL_CHANNELS.flatMap((ch) => [
      [ch, { type: 'onoff' as AttrType }],
      ...CARD_CONTROL_LIMITS.map((lim) => [`${ch} ${lim}`, { type: 'number' as AttrType, unit: 'rupees' as const }]),
    ])
  ),
  Transaction: {
    'Transaction Type': { type: 'multiSelect', options: TRANSACTION_SUBTYPE_OPTIONS },
    'Transaction Status': { type: 'multiSelect', options: ['APPROVED', 'SETTLED', 'PARTIALLY_SETTLED', 'EXPIRED', 'CANCELED'] },
    'EMI Eligible': { type: 'bool' },
    'Transaction Amount': { type: 'number' },
    MCC: { type: 'list' },
    'Initiated By': { type: 'select', options: ['CUSTOMER_INITIATED', 'SYSTEM_GENERATED'] },
  },
  'EMI Request': {
    'New Status': { type: 'select', options: ['Pending', 'Successful', 'Failed', 'Expired', 'Cancelled'] },
    'Product Type': { type: 'select', options: ['Single-Txn', 'Multi-Txn', 'Outstanding'] },
    Source: { type: 'select', options: EVENT_SOURCE_OPTIONS },
  },
};

// Real mechanism, confirmed directly against ironbank-face-main's own
// eligibility form (smartNudgesConstants.ts + createEligibilityComponent.js):
// a "Promotional Nudge" scopes its whole User Base to a MILESTONE entity —
// pick one specific, already-configured milestone benefit (live-fetched
// there via BenefitInput; a static illustrative list here, since this app
// has no backend), then either an "Is" check (Completed/Not Completed —
// picking Completed auto-sets value to "100", matching the real form
// exactly) or a numeric/percentage comparator against that one benefit's
// progress. Not an Account attribute, not an "Engagement Tier" — those
// were fabricated and removed outright (see CLAUDE.md). This is the real
// replacement mechanism, reused across Entry · Audience (entity =
// 'Milestone'), Condition (customSource = 'Milestone'), and Branch
// (source = 'Milestone').
// The milestone OFFERS configured for this campaign's program.
//
// A milestone is an offer the program already has, not a spend ladder. The
// four entries that used to sit here ("Spend ₹25,000 in first 30 days" and
// three like it) were invented: they baked a target amount and a day count
// into the name, which is the offer's own configuration, not its identity.
// They were removed outright rather than renamed, and a saved campaign that
// still points at one of them opens with its offer cleared.
//
// This list stands in for whatever the program has configured, and lives in
// one place so there is only ever one to change. Names carry no amount and
// no day count. It is legitimately EMPTY for a program with no milestone
// offers, and the picker handles that rather than being filled with an
// invented rule.
export interface MilestoneOffer {
  id: string;
  name: string;
}
export const MILESTONE_OFFERS: MilestoneOffer[] = [
  { id: 'MO-1', name: 'Welcome Milestone' },
  { id: 'MO-2', name: 'Quarterly Spend Milestone' },
  { id: 'MO-3', name: 'Annual Fee Waiver Milestone' },
  { id: 'MO-4', name: 'Activation Milestone' },
  { id: 'MO-5', name: 'First Transaction Milestone' },
  { id: 'MO-6', name: 'First Purchase Milestone' },
  { id: 'MO-7', name: 'First Repayment Milestone' },
  { id: 'MO-8', name: 'Half Yearly Spend Milestone' },
  { id: 'MO-9', name: 'Monthly Spend Milestone' },
  { id: 'MO-10', name: 'Festive Spend Milestone' },
  { id: 'MO-11', name: 'Diwali Spend Milestone' },
  { id: 'MO-12', name: 'Summer Spend Milestone' },
  { id: 'MO-13', name: 'Dining Spend Milestone' },
  { id: 'MO-14', name: 'Fuel Spend Milestone' },
  { id: 'MO-15', name: 'Travel Spend Milestone' },
  { id: 'MO-16', name: 'Grocery Spend Milestone' },
  { id: 'MO-17', name: 'Online Spend Milestone' },
  { id: 'MO-18', name: 'Offline Spend Milestone' },
  { id: 'MO-19', name: 'International Spend Milestone' },
  { id: 'MO-20', name: 'Contactless Spend Milestone' },
  { id: 'MO-21', name: 'Utility Payment Milestone' },
  { id: 'MO-22', name: 'Insurance Payment Milestone' },
  { id: 'MO-23', name: 'Rent Payment Milestone' },
  { id: 'MO-24', name: 'Education Payment Milestone' },
  { id: 'MO-25', name: 'Healthcare Spend Milestone' },
  { id: 'MO-26', name: 'Entertainment Spend Milestone' },
  { id: 'MO-27', name: 'Fashion Spend Milestone' },
  { id: 'MO-28', name: 'Electronics Spend Milestone' },
  { id: 'MO-29', name: 'Furniture Spend Milestone' },
  { id: 'MO-30', name: 'Cab Spend Milestone' },
  { id: 'MO-31', name: 'Flight Booking Milestone' },
  { id: 'MO-32', name: 'Hotel Booking Milestone' },
  { id: 'MO-33', name: 'Lounge Access Milestone' },
  { id: 'MO-34', name: 'Airport Transfer Milestone' },
  { id: 'MO-35', name: 'Forex Spend Milestone' },
  { id: 'MO-36', name: 'EMI Conversion Milestone' },
  { id: 'MO-37', name: 'Balance Transfer Milestone' },
  { id: 'MO-38', name: 'Loan On Card Milestone' },
  { id: 'MO-39', name: 'Autopay Setup Milestone' },
  { id: 'MO-40', name: 'Standing Instruction Milestone' },
  { id: 'MO-41', name: 'Statement Spend Milestone' },
  { id: 'MO-42', name: 'Cycle Spend Milestone' },
  { id: 'MO-43', name: 'Anniversary Spend Milestone' },
  { id: 'MO-44', name: 'Birthday Spend Milestone' },
  { id: 'MO-45', name: 'Referral Milestone' },
  { id: 'MO-46', name: 'App Engagement Milestone' },
  { id: 'MO-47', name: 'Rewards Redemption Milestone' },
  { id: 'MO-48', name: 'Partner Spend Milestone' },
  { id: 'MO-49', name: 'Merchant Spend Milestone' },
  { id: 'MO-50', name: 'Supplementary Card Milestone' },
];
export function milestoneOfferName(id: string | undefined): string {
  return MILESTONE_OFFERS.find((o) => o.id === id)?.name || '';
}

// Which entity Drip's Entry Event / Wait Until / Split "Entry event
// attribute" condition builder resolves to per Event Category.
export const DC_EVENT_ENTITY: Record<string, string> = {
  'Transaction Events': 'Transaction',
  'EMI Events': 'EMI Request',
};
// An entity's one dominant attribute that IS the point of picking that
// event type at all (New Status for EMI_STATUS_CHANGED) — promoted to
// always-visible instead of buried behind "Add condition".
export const DC_PROMOTED_ATTR: Record<string, string> = {
  'EMI Request': 'New Status',
};

// Journey/Offer Events narrowing — ported from
// journeysnudgesemi/emi-conversions-prototype.html's separate
// "event-based nudges" feature (its EVENT_TRIGGER step), not from this
// app's own original Drip Campaigns prototype. That original fell back
// to condRow()'s generic free-text-attribute path for these categories
// (its own DC_EVENT_ENTITY comment: "Journey/Offer/Card Events have no
// such entity yet... so they fall back to a plain text attribute name").
// The richer mechanism below is the one confirmed directly against the
// event-based-nudges wizard specifically, per explicit instruction.
//
// Journey/Offer Events only ever need ONE attribute each, not a full
// entity attribute set — "Event Conditions are attribute-based per event
// type, not entity-based — the attribute is effectively locked once the
// event is chosen" (source's own comment). Transaction/EMI Events keep
// using the generic entity-based ConditionRows builder above instead —
// the same source file reserves the locked-attribute pattern
// specifically for Journey/Offer Events, since Transaction/EMI "each
// genuinely need multiple independent filterable attributes... instead
// of one locked attribute."
export const EVENT_ATTR_BY_TYPE: Record<string, string> = {
  'Journey Progress': 'Status',
  Pageload: 'Page Name',
  'Button Click': 'Button Name',
  'Outcome Issuance': 'Outcome Status',
};
// The source list had both 'Equals' and 'Is', which are the same question;
// lowercased they collapse to one, so this is four rather than five.
export const LOCKED_ATTR_OPERATORS = ['is', 'is not', 'is more than', 'is less than'];
// Every operator this app has ever stored, mapped onto the wording above, so
// a campaign saved before the rewrite still reads correctly.
export const LEGACY_OPERATORS: Record<string, string> = {
  Equals: 'is',
  Is: 'is',
  'Not Equals': 'is not',
  'Greater than': 'is more than',
  'Greater than or equal to': 'is at least',
  'Less than': 'is less than',
  'Less than or equal to': 'is at most',
  Between: 'is between',
  'Any of': 'is any of',
};
export function dcNormalizeOperator(op: string | undefined): string {
  if (!op) return '';
  return LEGACY_OPERATORS[op] ?? op;
}

// Which operators a condition row may use for a given attribute. Lives here
// rather than inline in ConditionRows.tsx so there is exactly one answer to
// "what can this attribute be compared with" — two copies of this rule would
// drift.
// Comparisons are lowercase so "what + comparison + value" reads as one
// sentence on the row and again on Review: "Current OS amount is greater
// than or equal to ₹20,000". Numbers get the full six; dates keep the same
// four they always had, just worded to read.
export const NUMBER_COMPARISONS = ['is', 'is more than', 'is at least', 'is less than', 'is at most', 'is between'];
export const DATE_COMPARISONS = ['is', 'is after', 'is before', 'is between'];
export function dcOperatorsForAttribute(meta: AttrMeta | null | undefined, opts?: { locked?: boolean }): string[] {
  if (opts?.locked) return LOCKED_ATTR_OPERATORS;
  // Two-valued fields get one comparison. "is not Yes" is just "is No", and
  // offering both would be a choice with no meaning behind it.
  if (meta?.type === 'bool' || meta?.type === 'onoff') return ['is'];
  if (meta?.type === 'multiSelect') return ['is any of'];
  if (meta?.type === 'number') return NUMBER_COMPARISONS;
  if (meta?.type === 'date') return DATE_COMPARISONS;
  return ['is', 'is not'];
}
// Formats a stored value the way its filter reads in a sentence.
export function dcFormatValue(meta: AttrMeta | null | undefined, raw: string | undefined): string {
  const v = (raw ?? '').toString().trim();
  if (!v) return '';
  // Campaigns saved before yes/no filters read as Yes and No stored
  // 'true'/'false'; they still read correctly.
  if (meta?.type === 'bool') return v === 'true' ? 'Yes' : v === 'false' ? 'No' : v;
  if (meta?.unit === 'percent') return `${v}%`;
  if (meta?.unit === 'rupees') {
    const n = Number(v);
    return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : `₹${v}`;
  }
  return v;
}

// Journey Events' own scoping selects (shown above its Event Conditions
// in the source). JOURNEY_OPTIONS above is already the real, reused
// constant; BATCH_OPTIONS is newly ported here.
export const BATCH_OPTIONS = ['Aug Festive Batch', 'Sep Reactivation Batch', 'Q3 Consolidation Batch'];

// Offer Events' own scoping selects. OFFER_TYPE_OPTIONS here is the real,
// reused constant from elsewhere in the same source file — the
// EVENT_TRIGGER step's own inline Offer Type list (['CVP','Campaign',
// 'Merchant']) is a separate, shorter, inconsistently-named stub that
// was never wired to this constant; this port uses the real one.
// Offer Name has no equivalent real catalog anywhere in that source —
// its EVENT_TRIGGER step hardcodes exactly one example
// ('Festive EMI Push') and nothing else. `IBL_CAMPAIGNS` elsewhere in
// the same file looks adjacent but is unrelated demo-data-generation
// filler for an EMI-conversions analytics table, not a verified list of
// real offer names for this feature — presenting it as one would be
// inventing a catalog that was never actually built. Offer Name is a
// free-text field here for that reason, not a constrained select.
export const OFFER_TYPE_OPTIONS = ['CVP', 'Campaign Offers', '3rd Party Offers', 'Merchant Offers', 'Bank Offers', 'Activation Offers'];

// Centralizes "what does Condition/Branch's 'Entry event attribute'
// source actually mean for this entry" into one function, reused by both
// SplitForm and DecisionSplitForm so they can't resolve it differently.
// Exactly one of `entity`/`lockedAttr` is ever non-null: Transaction/EMI
// Events resolve a real entity (existing ConditionRows/ELIGIBILITY_META
// path); Journey/Offer Events resolve a locked single attribute instead,
// once their eventType is known; anything else (Card Events, or no
// eventType picked yet) resolves neither, same as today.
export function resolveEntryEventAttrSource(eventCategory: string | null, eventType: string | null): { entity: string | null; lockedAttr: string | null } {
  if (!eventCategory) return { entity: null, lockedAttr: null };
  const entity = DC_EVENT_ENTITY[eventCategory] || null;
  if (entity) return { entity, lockedAttr: null };
  // A card event that carries details resolves to its own detail set, so
  // Condition and Branch offer exactly those and nothing else. A card event
  // with no details resolves neither, and the group stays hidden.
  if (eventCategory === 'Card Events') {
    const valid = dcValidEventType(eventCategory, eventType);
    return { entity: valid && CARD_EVENT_DETAIL_ENTITIES[valid] ? valid : null, lockedAttr: null };
  }
  const lockedAttr = eventType ? EVENT_ATTR_BY_TYPE[eventType] || null : null;
  return { entity: null, lockedAttr };
}

// Real per-channel delivery-status vocabulary (Bifrost) — used by Split's
// "Previous step outcome" source and Decision Split's own version of it.
export const DELIVERY_STATUS_COMMON = ['SENT_TO_SERVICE_PROVIDER', 'FAILED', 'UN_CATEGORISED', 'FAILED_ON_UPLOAD', 'FAILED_TO_CONNECT', 'FAILED_SYSTEM_ISSUES'];
export const DELIVERY_STATUS_BY_CHANNEL: Record<Channel, string[]> = {
  SMS: ['SENT', 'DELIVERED', 'UNKNOWN', 'FAILED_DND', 'FAILED_BLACKLIST', 'FAILED_CALL_BARRED', 'FAILED_EXPIRED', 'FAILED_INBOX_FULL', 'FAILED_SUBSCRIBER_ABSENT', 'FAILED_SUBSCRIBER_UNKNOWN', 'FAILED_TEMPLATE_MISMATCH', 'FAILED_URL_MISMATCH', 'FAILED_DLT_FAILURE', 'FAILED_SYSTEM_ISSUES', 'FAILED_PENDING', 'FAILED_OTHER'],
  EMAIL: ['SENT', 'DELIVERED', 'PENDING', 'QUEUED', 'OPENED', 'CLICKED', 'HARD_BOUNCE', 'SOFT_BOUNCE', 'SPAM', 'SUPPRESSED', 'NOT_SENT', 'NOT_DELIVERED', 'FAILED'],
  WHATSAPP: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'DELETED', 'FAILED', 'UNKNOWN'],
  RCS: ['SENT', 'DELIVERED', 'READ', 'CLICKED', 'REJECTED', 'NOT_SENT', 'NOT_DELIVERED', 'DND', 'FAILED', 'FAILED_EXPIRED', 'FAILED_TO_CONNECT', 'FAILED_TEMPLATE_MISMATCH', 'FAILED_SYSTEM_ISSUES', 'FAILED_OTHER'],
};
// Merged, deduped (common first, then whatever the channel adds that isn't
// already in common).
export function deliveryStatusOptionsFor(channel: Channel): string[] {
  const chanList = DELIVERY_STATUS_BY_CHANNEL[channel] || [];
  return [...DELIVERY_STATUS_COMMON, ...chanList.filter((s) => !DELIVERY_STATUS_COMMON.includes(s))];
}
// No channel known — union across every channel rather than showing nothing.
export function deliveryStatusOptionsAll(): string[] {
  const all = new Set(DELIVERY_STATUS_COMMON);
  Object.values(DELIVERY_STATUS_BY_CHANNEL).forEach((list) => list.forEach((s) => all.add(s)));
  return [...all];
}

// A Send with a fallback channel could have actually delivered via
// either one — "Previous step outcome" needs both channels' vocabularies,
// not just the primary, since the fallback is the one that's genuinely
// unknown-in-advance (it only fires if the primary failed).
export interface PrevStepSend {
  channel: Channel;
  fallbackChannel: Channel | null;
}
export function deliveryStatusOptionsForSend(send: PrevStepSend): string[] {
  const primary = deliveryStatusOptionsFor(send.channel);
  if (!send.fallbackChannel) return primary;
  const fallback = deliveryStatusOptionsFor(send.fallbackChannel);
  return [...new Set([...primary, ...fallback])];
}

// ---------------------------------------------------------------------------
// The one "what" list
//
// Entry · Audience, Condition and Branch used to each ask a different
// up-front question before you could state a filter: Entry asked for an
// Entity, Condition asked for a Source, Branch asked for a Source and then
// an Attribute. Three controls for the same job, and the available filters
// differed depending on which one you picked. They are now a single grouped
// list, so a filter row is just what / comparison / value everywhere.
//
// Transactions, Milestone and Previous message are groups in this same list
// rather than a separate kind of form. They keep the questions they always
// asked: Transactions is still "does a matching transaction exist in a
// lookback window", Milestone is still one benefit and a progress
// comparison, Previous message is still the previous send's outcome.
// ---------------------------------------------------------------------------
export type FilterGroup = 'Account' | 'Card' | 'Card controls' | 'Customer' | 'Transactions' | 'Milestone' | 'App activity' | 'Previous message';
export const TXN_EXISTS = 'a matching transaction exists';
export const TXN_NONE = 'no matching transaction exists';
export const PREV_MESSAGE_FIELD = 'Outcome';

export interface FilterOption {
  group: FilterGroup;
  field: string;
  label: string;
}
export interface FilterOptionGroup {
  group: FilterGroup;
  options: FilterOption[];
}

// Previous message only exists once there is a message to have an outcome,
// so it is offered on Condition and Branch and never on Entry.
//
// There is no Entry event group. The entry event and its details belong to
// the entry step, where the manager says who starts; a later Condition or
// Branch does not ask about that same event again.
export function dcFilterOptionGroups(opts?: { previousMessage?: boolean }): FilterOptionGroup[] {
  const fromEntity = (g: FilterGroup, entity: string): FilterOptionGroup => ({
    group: g,
    options: Object.keys(ELIGIBILITY_META[entity] || {}).map((field) => ({ group: g, field, label: field })),
  });
  const groups: FilterOptionGroup[] = [
    fromEntity('Account', 'Account'),
    fromEntity('Card', 'Card'),
    // Sits next to Card because it is the same card, just its controls.
    fromEntity('Card controls', 'Card controls'),
    fromEntity('Customer', 'Customer'),
    { group: 'Transactions', options: [{ group: 'Transactions', field: '', label: 'Transactions' }] },
  ];
  // Omitted entirely when the program has no milestone offers configured —
  // an empty group would read as a dead end, and there is nothing honest to
  // put in it.
  if (MILESTONE_OFFERS.length) {
    // One entry, not fifty: the offer is picked by search on the row, the
    // same reason the app event is. Omitted when the program has no
    // milestone offers configured.
    groups.push({ group: 'Milestone', options: [{ group: 'Milestone', field: '', label: 'Milestone' }] });
  }
  // One entry, not forty: the event itself is picked by search on the row,
  // because a plain dropdown of every event the app fires is unscannable.
  // Omitted when the program emits no events at all.
  if (APP_EVENTS.length) {
    groups.push({ group: 'App activity', options: [{ group: 'App activity', field: '', label: 'App activity' }] });
  }
  if (opts?.previousMessage) {
    groups.push({ group: 'Previous message', options: [{ group: 'Previous message', field: PREV_MESSAGE_FIELD, label: 'Previous message outcome' }] });
  }
  return groups;
}

// The entity whose attribute metadata backs a group, for the three groups
// that are plain attribute lookups. The other three carry their own shape.
export function dcEntityForGroup(group: string): string | null {
  return group === 'Account' || group === 'Card' || group === 'Card controls' || group === 'Customer' ? group : null;
}
export function dcFilterAttrMeta(group: string, field: string): AttrMeta | null {
  const entity = dcEntityForGroup(group);
  return entity ? ELIGIBILITY_META[entity]?.[field] ?? null : null;
}

// Progress against a milestone offer is a number, so it takes the same
// words as every other number filter. There is no bare "is": progress is a
// threshold question, and "is at least 100%" is how completed is expressed.
export const MILESTONE_COMPARISONS = ['is more than', 'is at least', 'is less than', 'is at most', 'is between'];
// The typed progress is a percent by default and can be switched to a rupee
// amount on the same row.
export type MilestoneValueUnit = 'percent' | 'rupees';

export function dcComparisonsForFilter(group: string, field: string): string[] {
  if (group === 'App activity') return APP_ACTIVITY_DIRECTIONS;
  if (group === 'Transactions') return [TXN_EXISTS, TXN_NONE];
  if (group === 'Milestone') return MILESTONE_COMPARISONS;
  if (group === 'Previous message') return ['is any of'];
  return dcOperatorsForAttribute(dcFilterAttrMeta(group, field));
}

// ---------------------------------------------------------------------------
// App activity — something the customer did, or did not do, in the bank's app
//
// One place, standing in for the events the program emits. Each entry keeps
// the RAW event name the app actually fires and a short label a campaign
// manager reads; the picker searches both and shows only the label.
//
// Session id, account id, customer id, card id and the raw timestamps are
// deliberately absent: they identify an occurrence, they are not something
// anyone filters on, so they are not details either.
//
// `details` lists only what that event genuinely carries. Most events carry
// none, and a detail left empty means any value.
// ---------------------------------------------------------------------------
export type AppEventDetail = 'offer';
export interface AppEvent {
  id: string;
  raw: string;
  label: string;
  category: 'Authentication' | 'Cards' | 'Payments' | 'Offers';
  details?: AppEventDetail[];
}

export const APP_EVENTS: AppEvent[] = [
  // Authentication
  { id: 'AE-001', raw: 'Authentication Transaction OTP Button Click', label: 'Enter OTP', category: 'Authentication' },
  { id: 'AE-002', raw: 'Authentication Transaction Verify OTP Button Click', label: 'Verify OTP', category: 'Authentication' },
  { id: 'AE-003', raw: 'Authentication Transaction Success Continue Button Click', label: 'Continue after OTP', category: 'Authentication' },
  { id: 'AE-004', raw: 'Authentication Transaction Resend OTP Button Click', label: 'Resend OTP', category: 'Authentication' },
  { id: 'AE-005', raw: 'Authentication Login Screen Load', label: 'Login screen opened', category: 'Authentication' },
  { id: 'AE-006', raw: 'Authentication Login Success', label: 'Logged in', category: 'Authentication' },
  { id: 'AE-007', raw: 'Authentication Login Failure', label: 'Login failed', category: 'Authentication' },
  { id: 'AE-008', raw: 'Authentication Biometric Enable Button Click', label: 'Biometric turned on', category: 'Authentication' },
  { id: 'AE-009', raw: 'Authentication MPIN Reset Button Click', label: 'MPIN reset started', category: 'Authentication' },
  { id: 'AE-010', raw: 'Authentication Logout Button Click', label: 'Logged out', category: 'Authentication' },
  // Cards
  { id: 'AE-011', raw: 'Cards Card Details Screen Load', label: 'Card details viewed', category: 'Cards' },
  { id: 'AE-012', raw: 'Cards Activate Card Button Click', label: 'Card activation started', category: 'Cards' },
  { id: 'AE-013', raw: 'Cards Activate Card Success', label: 'Card activated', category: 'Cards' },
  { id: 'AE-014', raw: 'Cards Set PIN Button Click', label: 'Set card PIN', category: 'Cards' },
  { id: 'AE-015', raw: 'Cards Block Card Button Click', label: 'Card blocked', category: 'Cards' },
  { id: 'AE-016', raw: 'Cards Unblock Card Button Click', label: 'Card unblocked', category: 'Cards' },
  { id: 'AE-017', raw: 'Cards Replace Card Button Click', label: 'Replacement requested', category: 'Cards' },
  { id: 'AE-018', raw: 'Cards Card Controls Screen Load', label: 'Card controls viewed', category: 'Cards' },
  { id: 'AE-019', raw: 'Cards International Usage Toggle Click', label: 'International usage changed', category: 'Cards' },
  { id: 'AE-020', raw: 'Cards Contactless Toggle Click', label: 'Contactless changed', category: 'Cards' },
  { id: 'AE-021', raw: 'Cards Limit Change Button Click', label: 'Limit change requested', category: 'Cards' },
  { id: 'AE-022', raw: 'Cards Statement Download Button Click', label: 'Statement downloaded', category: 'Cards' },
  // Payments
  { id: 'AE-023', raw: 'Payments Pay Bill Screen Load', label: 'Pay bill opened', category: 'Payments' },
  { id: 'AE-024', raw: 'Payments Pay Bill Button Click', label: 'Bill payment started', category: 'Payments' },
  { id: 'AE-025', raw: 'Payments Pay Bill Success', label: 'Bill paid', category: 'Payments' },
  { id: 'AE-026', raw: 'Payments Pay Bill Failure', label: 'Bill payment failed', category: 'Payments' },
  { id: 'AE-027', raw: 'Payments Autopay Setup Button Click', label: 'Autopay set up', category: 'Payments' },
  { id: 'AE-028', raw: 'Payments Autopay Cancel Button Click', label: 'Autopay cancelled', category: 'Payments' },
  { id: 'AE-029', raw: 'Payments EMI Conversion Screen Load', label: 'EMI conversion opened', category: 'Payments' },
  { id: 'AE-030', raw: 'Payments EMI Conversion Button Click', label: 'EMI conversion started', category: 'Payments' },
  { id: 'AE-031', raw: 'Payments EMI Conversion Success', label: 'EMI converted', category: 'Payments' },
  { id: 'AE-032', raw: 'Payments Transaction History Screen Load', label: 'Transactions viewed', category: 'Payments' },
  { id: 'AE-033', raw: 'Payments Dispute Raise Button Click', label: 'Dispute raised', category: 'Payments' },
  { id: 'AE-034', raw: 'Payments Rewards Redeem Button Click', label: 'Rewards redeemed', category: 'Payments' },
  // Offers
  { id: 'AE-035', raw: 'Offers Offer Card Click', label: 'Offer clicked', category: 'Offers', details: ['offer'] },
  { id: 'AE-036', raw: 'Offers Offer List Screen Load', label: 'Offers list viewed', category: 'Offers' },
  { id: 'AE-037', raw: 'Offers Offer Detail Screen Load', label: 'Offer details viewed', category: 'Offers', details: ['offer'] },
  { id: 'AE-038', raw: 'Offers Offer Apply Button Click', label: 'Offer applied', category: 'Offers', details: ['offer'] },
  { id: 'AE-039', raw: 'Offers Offer Dismiss Button Click', label: 'Offer dismissed', category: 'Offers', details: ['offer'] },
  { id: 'AE-040', raw: 'Offers Offer Terms Link Click', label: 'Offer terms opened', category: 'Offers', details: ['offer'] },
];

// The program's own offers, as names. No target amount and no day count —
// that is the offer's configuration, not its identity. Deliberately NOT the
// removed spend ladder, and separate from MILESTONE_OFFERS, which is a
// different thing.
export interface ProgramOffer {
  id: string;
  name: string;
}
export const PROGRAM_OFFERS: ProgramOffer[] = [
  { id: 'OF-1', name: 'Welcome Offer' },
  { id: 'OF-2', name: 'Fuel Surcharge Waiver' },
  { id: 'OF-3', name: 'Dining Cashback' },
  { id: 'OF-4', name: 'Travel Partner Offer' },
  { id: 'OF-5', name: 'EMI Processing Fee Waiver' },
];
export function programOfferName(id: string | undefined): string {
  return PROGRAM_OFFERS.find((o) => o.id === id)?.name || '';
}

export function appEventById(id: string | undefined): AppEvent | undefined {
  return APP_EVENTS.find((e) => e.id === id);
}
export function appEventLabel(id: string | undefined): string {
  return appEventById(id)?.label || '';
}
// Which events this campaign's program emits. The stand-in catalogue is the
// same for every program, so this is the single place to narrow once real
// per-program events exist — and it is what the program-change rule below
// checks against.
export function dcAppEventsForPrograms(_programs: string[]): AppEvent[] {
  return APP_EVENTS;
}
export const APP_ACTIVITY_DIRECTIONS = ['happened', 'did not happen'];

// ---------------------------------------------------------------------------
// Card event details
//
// Two card events carry something worth narrowing on. Registered as entities
// keyed by the event's own name so every existing attribute path — the
// condition rows, the Entry event group on Condition and Branch, the value
// widgets — works on them unchanged, instead of a parallel mechanism.
//
// Leaving a detail empty means any value. The other card events have none,
// and the Entry event group stays hidden for them.
// ---------------------------------------------------------------------------
export const CARD_EVENT_DETAIL_ENTITIES: Record<string, Record<string, AttrMeta>> = {
  'Card hotlisted': {
    Reason: { type: 'select', options: HOTLIST_REASONS },
  },
  'Card control updated': {
    Channel: { type: 'select', options: CARD_CONTROL_CHANNELS },
    Change: { type: 'select', options: CARD_CONTROL_CHANGES },
    // Only meaningful when Change is one of the three limits, and it
    // matches only when that limit is turned on.
    'Limit amount': { type: 'number', unit: 'rupees' },
  },
};
Object.assign(ELIGIBILITY_META, CARD_EVENT_DETAIL_ENTITIES);

export function cardEventDetailFields(eventType: string | null | undefined): Record<string, AttrMeta> | null {
  return (eventType && CARD_EVENT_DETAIL_ENTITIES[eventType]) || null;
}

// A stored event type that the category no longer lists reads as unset, so
// the row stays in place waiting to be picked again rather than silently
// claiming an event that no longer exists. This is what clears the four
// removed Card Events anywhere they were saved; nothing is repointed at a
// different event.
export function dcValidEventType(category: string | null | undefined, eventType: string | null | undefined): string {
  if (!category || !eventType) return '';
  return (EVENT_CATEGORIES[category]?.events || []).includes(eventType) ? eventType : '';
}

// A card event as one sentence: the event, then whatever detail was filled
// in. "Card hotlisted, Damaged", or "Card control updated, Domestic online,
// turned on". A limit reads as a rupee amount and only matches when that
// limit is turned on. An empty detail means any value and is simply absent
// from the sentence.
export function dcCardEventPhrase(eventType: string | null | undefined, details: Record<string, string> | undefined): string {
  const valid = dcValidEventType('Card Events', eventType);
  if (!valid) return '';
  const fields = cardEventDetailFields(valid);
  if (!fields || !details) return valid;
  const parts: string[] = [];
  for (const [name, meta] of Object.entries(fields)) {
    if (name === 'Limit amount') continue; // carried on Change below
    const v = details[name];
    if (!v) continue;
    if (name === 'Change' && CARD_CONTROL_LIMITS.includes(v)) {
      const amount = dcFormatValue(fields['Limit amount'], details['Limit amount']);
      parts.push(amount ? `${v} ${amount}` : v);
    } else {
      parts.push(dcFormatValue(meta, v));
    }
  }
  return parts.length ? `${valid}, ${parts.join(', ')}` : valid;
}
