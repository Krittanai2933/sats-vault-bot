import { getBalance } from '../db.js';

export default {
  name: 'balance',
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ ใช้คำสั่งนี้ในเซิร์ฟเวอร์เท่านั้น (DM ไม่รองรับ)', ephemeral: true });
      return;
    }

    const balance = getBalance(interaction.guildId, interaction.user.id);
    if (balance === null) {
      await interaction.reply({
        content: 'คุณยังไม่ได้ `/join` เลยนะ ลอง join ก่อนถึงจะมียอด sats ได้',
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({ content: `💰 ยอดของคุณ: **${balance.toLocaleString()} sats**`, ephemeral: true });
  },
};
