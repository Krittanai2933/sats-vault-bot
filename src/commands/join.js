import { ensureUser, setLightningAddress } from '../db.js';
import { isLightningAddress } from '../lnurl.js';

export default {
  name: 'join',
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ ใช้คำสั่งนี้ในเซิร์ฟเวอร์เท่านั้น (DM ไม่รองรับ)', ephemeral: true });
      return;
    }

    const lnaddress = interaction.options.getString('lnaddress');
    if (lnaddress && !isLightningAddress(lnaddress)) {
      await interaction.reply({
        content: '❌ รูปแบบ Lightning Address ไม่ถูกต้อง (ต้องเป็น name@domain.com)',
        ephemeral: true,
      });
      return;
    }

    const created = ensureUser(interaction.guildId, interaction.user.id);
    if (lnaddress) {
      setLightningAddress(interaction.guildId, interaction.user.id, lnaddress);
    }

    if (created) {
      const suffix = lnaddress
        ? ` และบันทึก Lightning Address \`${lnaddress}\` ไว้แล้ว (ใช้ \`/withdraw\` แค่ระบุ amount ได้เลย)`
        : '';
      await interaction.reply({
        content: `🪙 ยินดีต้อนรับสู่ **Sats Vault**! ยอดเริ่มต้นของคุณคือ 0 sats${suffix} — ใช้ \`/deposit\` เพื่อเติมเงิน หรือรอเพื่อน \`/tip\` ให้`,
      });
    } else if (lnaddress) {
      await interaction.reply({
        content: `✅ บันทึก Lightning Address \`${lnaddress}\` ไว้แล้ว ต่อไปนี้ \`/withdraw\` แค่ระบุ amount ก็ถอนได้เลยโดยไม่ต้องกรอก destination`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({ content: 'คุณ join อยู่แล้วนะ ใช้ `/balance` เช็คยอดได้เลย', ephemeral: true });
    }
  },
};
