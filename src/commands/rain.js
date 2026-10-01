import { ensureUser, getAllJoinedIds, rain } from '../db.js';

export default {
  name: 'rain',
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ ใช้คำสั่งนี้ในเซิร์ฟเวอร์เท่านั้น (DM ไม่รองรับ)', ephemeral: true });
      return;
    }

    const amount = interaction.options.getInteger('amount', true);
    const guildId = interaction.guildId;
    ensureUser(guildId, interaction.user.id);

    const recipients = getAllJoinedIds(guildId, interaction.user.id);
    if (recipients.length === 0) {
      await interaction.reply({
        content: 'ยังไม่มีคนอื่น `/join` เลยนะ รอเพื่อนมาก่อนค่อยหว่านได้',
        ephemeral: true,
      });
      return;
    }

    let result;
    try {
      result = rain(guildId, interaction.user.id, recipients, amount);
    } catch (err) {
      const messages = {
        INSUFFICIENT_BALANCE: 'ยอดของคุณไม่พอ',
        SHARE_TOO_SMALL: `หาร ${amount} sats ให้ ${recipients.length} คนแล้วได้คนละ 0 sats ลองเพิ่มจำนวนดู`,
      };
      await interaction.reply({ content: `❌ ${messages[err.message] || err.message}`, ephemeral: true });
      return;
    }

    await interaction.reply(
      `🌧️ ${interaction.user} หว่าน **${result.actuallySpent.toLocaleString()} sats** ` +
        `ให้ ${recipients.length} คน คนละ **${result.share.toLocaleString()} sats**!`
    );
  },
};
