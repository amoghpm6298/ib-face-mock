// Ported from journeysnudgesemi/emi-conversions-prototype.html.
import type { DripCampaignStatus } from './graphTypes';

export const DRIP_STATUS_META: Record<DripCampaignStatus, { label: string; badge: string }> = {
  DRAFT: { label: 'Draft', badge: 'gray' },
  SCHEDULED: { label: 'Scheduled', badge: 'info' },
  ACTIVE: { label: 'Active', badge: 'success' },
  EXPIRED: { label: 'Expired', badge: 'gray' },
  TERMINATED: { label: 'Terminated', badge: 'error' },
};
