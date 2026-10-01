import QRCode from 'qrcode';
import { AttachmentBuilder } from 'discord.js';
import { ensureUser, addPendingDeposit, resolveDeposit, deletePendingDeposit } from '../db.js';
import { createInvoice, checkPayment } from '../lnbits.js';

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 150; // ~10 นาที

export default {
  name: 'deposit',
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ ใช้คำสั่งนี้ในเซิร์ฟเวอร์เท่านั้น (DM ไม่รองรับ)', ephemeral: true });
      return;
    }

    const amount = interaction.options.getInteger('amount', true);
    const guildId = interaction.guildId;
    ensureUser(guildId, interaction.user.id);

    await interaction.deferReply({ ephemeral: true });

    let invoice;
    try {
      invoice = await createInvoice(amount, `Sats Vault deposit - ${interaction.user.tag}`);
    } catch (err) {
      await interaction.editReply(`สร้าง invoice ไม่สำเร็จ: ${err.message}`);
      return;
    }

    addPendingDeposit(invoice.checking_id, guildId, interaction.user.id, amount);

    const qrBuffer = await QRCode.toBuffer(invoice.payment_request, { width: 400 });
    const attachment = new AttachmentBuilder(qrBuffer, { name: 'invoice.png' });

    await interaction.editReply({
      content:
        `⚡ สแกนจ่าย **${amount.toLocaleString()} sats** เพื่อเติม Vault:\n` +
        `\`\`\`${invoice.payment_request}\`\`\`` +
        `\nรอสักครู่... จะแจ้งอัตโนมัติเมื่อจ่ายสำเร็จ (invoice หมดอายุใน 10 นาที)`,
      files: [attachment],
    });

    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const status = await checkPayment(invoice.checking_id);
        if (status.paid) {
          clearInterval(timer);
          resolveDeposit(invoice.checking_id);
          await interaction.followUp({
            content: `✅ เติมเงินสำเร็จ! เพิ่ม **${amount.toLocaleString()} sats** เข้ายอดของคุณแล้ว`,
            ephemeral: true,
          });
          return;
        }
      } catch (err) {
        // เน็ตเวิร์คสะดุดชั่วคราว ปล่อยให้ลองใหม่รอบถัดไป ไม่ต้อง log รก
      }

      if (attempts >= MAX_POLLS) {
        clearInterval(timer);
        deletePendingDeposit(invoice.checking_id);
        await interaction.followUp({
          content: '⌛ invoice หมดอายุแล้วโดยไม่มีการจ่ายเงิน ลอง `/deposit` ใหม่อีกครั้งได้เลย',
          ephemeral: true,
        });
      }
    }, POLL_INTERVAL_MS);
  },
};
