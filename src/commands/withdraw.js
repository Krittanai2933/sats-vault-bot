import { decode } from 'light-bolt11-decoder';
import { getBalance, getLightningAddress, withdraw } from '../db.js';
import { payInvoice } from '../lnbits.js';
import { isLightningAddress, resolveLightningAddress } from '../lnurl.js';

const FEE_RATE = 0.01; // ค่าธรรมเนียมสำรองไว้เผื่อ routing fee จริงตอน withdraw (หักคงที่ ไม่คืนส่วนต่าง)
const FEE_MIN_SATS = 1;

/** ถอด invoice ออกมาเป็นจำนวน sats จาก field 'amount' (หน่วย millisatoshi) */
function amountFromInvoice(bolt11) {
  const decoded = decode(bolt11);
  const amountSection = decoded.sections.find((s) => s.name === 'amount');
  if (!amountSection || !amountSection.value) return null;
  return Math.round(Number(amountSection.value) / 1000);
}

export default {
  name: 'withdraw',
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ ใช้คำสั่งนี้ในเซิร์ฟเวอร์เท่านั้น (DM ไม่รองรับ)', ephemeral: true });
      return;
    }

    const destinationInput = interaction.options.getString('destination');
    const requestedAmount = interaction.options.getInteger('amount');
    const guildId = interaction.guildId;

    let destination = destinationInput ? destinationInput.trim() : null;

    if (!destination) {
      destination = getLightningAddress(guildId, interaction.user.id);
      if (!destination) {
        await interaction.reply({
          content:
            '❌ ยังไม่ได้ระบุปลายทาง ใส่ `destination` (BOLT11 invoice หรือ Lightning Address) ' +
            'หรือบันทึก Lightning Address ไว้ก่อนด้วย `/join lnaddress:name@domain.com` แล้วจะถอนแค่ระบุ amount ได้เลย',
          ephemeral: true,
        });
        return;
      }
    }

    const toAddress = isLightningAddress(destination);

    let bolt11 = toAddress ? null : destination;
    let amount;

    if (toAddress) {
      if (!requestedAmount || requestedAmount <= 0) {
        await interaction.reply({
          content: '❌ ถอนไปยัง Lightning Address ต้องระบุ `amount` มาด้วยนะ',
          ephemeral: true,
        });
        return;
      }
      amount = requestedAmount;
    } else {
      try {
        amount = amountFromInvoice(destination);
      } catch {
        await interaction.reply({
          content: '❌ อ่านไม่ได้ ตรวจสอบว่าใส่ BOLT11 invoice หรือ Lightning Address ถูกต้องหรือไม่',
          ephemeral: true,
        });
        return;
      }
      if (!amount || amount <= 0) {
        await interaction.reply({ content: '❌ invoice นี้ไม่มีจำนวนเงินระบุไว้ (zero-amount invoice ยังไม่รองรับ)', ephemeral: true });
        return;
      }
    }

    const fee = Math.max(FEE_MIN_SATS, Math.ceil(amount * FEE_RATE));
    const totalDebit = amount + fee;

    const balance = getBalance(guildId, interaction.user.id);
    if (balance === null) {
      await interaction.reply({ content: 'คุณยังไม่ได้ `/join` เลยนะ', ephemeral: true });
      return;
    }
    if (balance < totalDebit) {
      await interaction.reply({
        content:
          `❌ ยอดไม่พอ ต้องถอน **${amount.toLocaleString()} sats** + ค่าธรรมเนียม **${fee.toLocaleString()} sats** ` +
          `รวม **${totalDebit.toLocaleString()} sats** แต่คุณมี **${balance.toLocaleString()} sats**`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    if (toAddress) {
      try {
        bolt11 = await resolveLightningAddress(destination, amount);
      } catch (err) {
        await interaction.editReply(`❌ ขอ invoice จาก Lightning Address ไม่สำเร็จ: ${err.message}`);
        return;
      }
    }

    try {
      await payInvoice(bolt11);
    } catch (err) {
      await interaction.editReply(`❌ จ่าย invoice ไม่สำเร็จ: ${err.message}`);
      return;
    }

    // หักยอดออกจากบัญชีผู้ใช้ (จำนวนถอน + ค่าธรรมเนียมสำรอง) เพราะเงินก้อนนี้ออกจาก treasury wallet ไปจริงแล้ว
    withdraw(guildId, interaction.user.id, totalDebit);

    await interaction.editReply(
      `✅ ถอนสำเร็จ **${amount.toLocaleString()} sats** ถูกส่งไปแล้ว (หักค่าธรรมเนียมสำรอง **${fee.toLocaleString()} sats**)`
    );
  },
};
