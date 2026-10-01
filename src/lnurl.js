const LN_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isLightningAddress(value) {
  return LN_ADDRESS_RE.test(value);
}

/** แปลง Lightning Address เป็น BOLT11 invoice ผ่าน LNURL-pay ของโดเมนปลายทาง (ไม่ใช่ LNbits ของเรา) */
export async function resolveLightningAddress(address, amountSats) {
  const [name, domain] = address.split('@');
  if (!name || !domain) throw new Error('รูปแบบ Lightning Address ไม่ถูกต้อง');

  const lnurlRes = await fetch(`https://${domain}/.well-known/lnurlp/${name}`);
  const lnurlData = await lnurlRes.json().catch(() => ({}));
  if (!lnurlRes.ok || lnurlData.tag !== 'payRequest') {
    throw new Error(lnurlData?.reason || `ไม่พบ Lightning Address นี้ที่ ${domain}`);
  }

  const amountMsat = amountSats * 1000;
  if (amountMsat < lnurlData.minSendable || amountMsat > lnurlData.maxSendable) {
    const min = Math.ceil(lnurlData.minSendable / 1000);
    const max = Math.floor(lnurlData.maxSendable / 1000);
    throw new Error(`address นี้รับได้ระหว่าง ${min.toLocaleString()}-${max.toLocaleString()} sats เท่านั้น`);
  }

  const callbackUrl = new URL(lnurlData.callback);
  callbackUrl.searchParams.set('amount', String(amountMsat));

  const invoiceRes = await fetch(callbackUrl);
  const invoiceData = await invoiceRes.json().catch(() => ({}));
  if (!invoiceRes.ok || !invoiceData.pr) {
    throw new Error(invoiceData?.reason || 'ขอ invoice จาก Lightning Address นี้ไม่สำเร็จ');
  }

  return invoiceData.pr;
}
