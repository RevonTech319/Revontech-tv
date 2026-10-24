/**
 * Bulk SMS – integration point.
 *
 * The Subscribers page already collects recipients + message and calls
 * `sendBulkSms`. When a provider is chosen (Beem, NextSMS, Africa's Talking…)
 * implement the request below (ideally through a Cloud Function so the API key
 * never reaches the browser) and flip SMS_PROVIDER_CONFIGURED to true.
 */
export interface SmsRecipient {
  phone: string; // 2557XXXXXXXX
  message: string;
}

export interface SmsResult {
  ok: boolean;
  sent: number;
  error?: string;
}

export const SMS_PROVIDER_CONFIGURED = false;

export async function sendBulkSms(recipients: SmsRecipient[]): Promise<SmsResult> {
  if (!SMS_PROVIDER_CONFIGURED) {
    return { ok: false, sent: 0, error: 'SMS provider haijaunganishwa bado.' };
  }
  // TODO: POST recipients to your SMS Cloud Function / provider API here.
  return { ok: false, sent: 0, error: 'Not implemented' };
}

/** GSM-7 vs unicode segment estimate. */
export function smsSegments(text: string) {
  const unicode = /[^\x00-\x7F]/.test(text);
  const len = text.length;
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi);
  return { len, segments, unicode };
}
