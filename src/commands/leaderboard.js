import { leaderboard } from '../db.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default {
  name: 'leaderboard',
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ ใช้คำสั่งนี้ในเซิร์ฟเวอร์เท่านั้น (DM ไม่รองรับ)', ephemeral: true });
      return;
    }

    const rows = leaderboard(interaction.guildId, 10);
    if (rows.length === 0) {
      await interaction.reply({ content: 'ยังไม่มีใคร join เลยนะ', ephemeral: true });
      return;
    }

    const lines = rows.map((row, i) => {
      const medal = MEDALS[i] || `${i + 1}.`;
      return `${medal} <@${row.discord_id}> — **${row.balance_sats.toLocaleString()} sats**`;
    });

    await interaction.reply(`🏆 **Sats Vault Leaderboard**\n${lines.join('\n')}`);
  },
};
