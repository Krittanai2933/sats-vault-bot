import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('เข้าร่วม Sats Vault เพื่อเริ่มมียอด sats ของตัวเอง')
    .addStringOption((opt) =>
      opt
        .setName('lnaddress')
        .setDescription('บันทึก Lightning Address (name@domain.com) ไว้เป็นปลายทางเริ่มต้นตอน /withdraw')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('เช็คยอด sats ของตัวเอง'),

  new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('สร้าง Lightning invoice เพื่อเติม sats เข้า Vault')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('จำนวน sats').setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('ถอน sats ไปยัง Lightning invoice หรือ Lightning Address ของคุณ')
    .addStringOption((opt) =>
      opt
        .setName('destination')
        .setDescription('BOLT11 invoice หรือ Lightning Address (ไม่ต้องใส่ถ้าบันทึกไว้แล้วด้วย /join)')
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('จำนวน sats (จำเป็นถ้าใส่/ใช้ Lightning Address, ไม่ต้องใส่ถ้าใส่ invoice)')
        .setRequired(false)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('tip')
    .setDescription('ส่ง sats ให้เพื่อนในเซิร์ฟเวอร์ (ฟรี ไม่มีค่าธรรมเนียม)')
    .addUserOption((opt) => opt.setName('user').setDescription('คนที่จะส่งให้').setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('จำนวน sats').setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('rain')
    .setDescription('หว่าน sats จากยอดของคุณ แบ่งเท่า ๆ กันให้ทุกคนที่ join แล้ว')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('จำนวน sats รวมที่จะหว่าน').setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('อันดับคนมี sats เยอะสุดใน Vault'),
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const guildIds = (process.env.DISCORD_GUILD_ID || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

if (guildIds.length > 0) {
  console.log(`กำลังลงทะเบียนคำสั่งแบบ guild-only (ขึ้นทันที) ที่ ${guildIds.length} guild: ${guildIds.join(', ')}`);
  for (const guildId of guildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId), {
        body: commands,
      });
      console.log(`  ✅ guild ${guildId} สำเร็จ`);
    } catch (err) {
      console.error(`  ❌ guild ${guildId} ล้มเหลว: ${err.message}`);
    }
  }
} else {
  console.log('กำลังลงทะเบียนคำสั่งแบบ global (ใช้เวลาราว ๆ 1 ชม. กว่าจะขึ้นทุกเซิร์ฟเวอร์)...');
  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
  console.log('  ✅ global สำเร็จ');
}

console.log(`ลงทะเบียนคำสั่งทั้งหมด ${commands.length} คำสั่งเรียบร้อย`);
