import { ensureUser, transfer } from '../db.js';

export default {
  name: 'tip',
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ ใช้คำสั่งนี้ในเซิร์ฟเวอร์เท่านั้น (DM ไม่รองรับ)', ephemeral: true });
      return;
    }

    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const guildId = interaction.guildId;

    if (target.id === interaction.user.id) {
      await interaction.reply({ content: 'ทิปตัวเองไม่ได้นะ 😄', ephemeral: true });
      return;
    }
    if (target.bot) {
      await interaction.reply({ content: 'ทิปให้บอทไม่ได้นะ', ephemeral: true });
      return;
    }

    ensureUser(guildId, interaction.user.id);
    ensureUser(guildId, target.id);

    try {
      transfer(guildId, interaction.user.id, target.id, amount, 'tip');
    } catch (err) {
      const msg =
        err.message === 'INSUFFICIENT_BALANCE'
          ? `ยอดไม่พอ ลอง \`/balance\` เช็คดูก่อนนะ`
          : `ทิปไม่สำเร็จ: ${err.message}`;
      await interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
      return;
    }

    await interaction.reply(
      `⚡ ${interaction.user} ส่ง **${amount.toLocaleString()} sats** ให้ ${target} แล้ว!`
    );
  },
};
