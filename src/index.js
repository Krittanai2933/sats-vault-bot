import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// โหลดทุกคำสั่งจากโฟลเดอร์ commands/ อัตโนมัติ
const commands = new Map();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir)) {
  if (!file.endsWith('.js')) continue;
  const mod = await import(`./commands/${file}`);
  commands.set(mod.default.name, mod.default);
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Sats Vault พร้อมใช้งานแล้วในชื่อ ${c.user.tag}`);
  console.log(`   โหลดคำสั่งทั้งหมด: ${[...commands.keys()].join(', ')}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`เกิดข้อผิดพลาดในคำสั่ง /${interaction.commandName}:`, err);
    const payload = { content: '⚠️ เกิดข้อผิดพลาดไม่คาดคิด ลองใหม่อีกครั้ง', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
