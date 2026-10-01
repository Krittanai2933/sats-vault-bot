import 'dotenv/config';

const BASE_URL = (process.env.LNBITS_URL || '').replace(/\/+$/, '');
const ADMIN_KEY = process.env.LNBITS_ADMIN_KEY;
const INVOICE_KEY = process.env.LNBITS_INVOICE_KEY;

if (!BASE_URL || !ADMIN_KEY || !INVOICE_KEY) {
  throw new Error(
    'Missing LNBITS_URL / LNBITS_ADMIN_KEY / LNBITS_INVOICE_KEY in .env — ดูตัวอย่างใน .env.example'
  );
}

async function request(path, { method = 'GET', apiKey, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail || res.statusText;
    throw new Error(`LNbits ${method} ${path} -> ${res.status}: ${detail}`);
  }
  return data;
}

/** สร้าง invoice สำหรับรับเงิน (ใช้ invoice key พอ) */
export async function createInvoice(amountSats, memo) {
  return request('/api/v1/payments', {
    method: 'POST',
    apiKey: INVOICE_KEY,
    body: { out: false, amount: amountSats, memo },
  });
  // -> { payment_hash, payment_request, checking_id }
}

/** จ่าย invoice ออก (ต้องใช้ admin key เท่านั้น) */
export async function payInvoice(bolt11) {
  return request('/api/v1/payments', {
    method: 'POST',
    apiKey: ADMIN_KEY,
    body: { out: true, bolt11 },
  });
  // -> { payment_hash, checking_id }
}

/** เช็คสถานะการจ่ายเงินจาก checking_id */
export async function checkPayment(checkingId) {
  return request(`/api/v1/payments/${checkingId}`, { apiKey: INVOICE_KEY });
  // -> { paid: boolean, details: {...} }
}

/** ยอดคงเหลือของ treasury wallet เอง (มิลลิซาโตชิ) */
export async function getTreasuryBalance() {
  const data = await request('/api/v1/wallet', { apiKey: INVOICE_KEY });
  return Math.floor(data.balance / 1000); // แปลงเป็น sats
}
