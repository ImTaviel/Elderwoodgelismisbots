require("dotenv").config();
const { Client, Events, GatewayIntentBits, MessageFlags } = require("discord.js");
const config = require("./config.json");
const commands = require("./commands");
const { ensureApplicationPanel, handleApplicationButton } = require("./handlers/applications");
const { handleSilverButton } = require("./handlers/silver");
const { startPassivityScheduler } = require("./services/passivity");
const { startAlbionMembershipScheduler } = require("./services/albion-membership");
const { logAudit } = require("./utils/audit");
const { db } = require("./database");

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN ortam değişkeni tanımlanmalıdır.");
if (!config.guildId) throw new Error("config.json içinde guildId tanımlanmalıdır.");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});
client.config = {
  ...config,
  auditLogChannelId: process.env.AUDIT_LOG_CHANNEL_ID || config.auditLogChannelId,
  managementChannelId: process.env.MANAGEMENT_CHANNEL_ID || config.managementChannelId,
  albionGuildId: process.env.ALBION_GUILD_ID || config.albionGuildId
};
const commandMap = new Map(commands.map((command) => [command.data.name, command]));

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`${readyClient.user.tag} olarak giriş yapıldı.`);
  try {
    await ensureApplicationPanel(readyClient);
  } catch (error) {
    console.error("Başvuru paneli kurulamadı:", error);
  }
  try {
    await startPassivityScheduler(readyClient);
  } catch (error) {
    console.error("Pasiflik zamanlayıcısı başlatılamadı:", error);
  }
  try {
    await startAlbionMembershipScheduler(readyClient);
  } catch (error) {
    console.error("Albion üyelik doğrulama zamanlayıcısı başlatılamadı:", error);
  }
});

client.on(Events.GuildMemberRemove, (member) => {
  if (member.guild.id !== client.config.guildId) return;
  try {
    const result = db.prepare(`
      UPDATE users SET archived_at = ?
      WHERE discord_id = ? AND archived_at IS NULL
    `).run(new Date().toISOString(), member.id);
    if (result.changes) {
      logAudit(client, {
        actorId: "system",
        action: "Üye arşivlendi",
        targetId: member.id,
        details: "Discord sunucusundan ayrıldığı için üye verisi arşivlendi."
      });
    }
  } catch (error) {
    console.error(`Ayrılan üye arşivlenemedi (${member.id}):`, error);
  }
});

client.on(Events.GuildMemberAdd, (member) => {
  if (member.guild.id !== client.config.guildId) return;
  try {
    const result = db.prepare(`
      UPDATE users SET archived_at = NULL
      WHERE discord_id = ? AND archived_at IS NOT NULL
    `).run(member.id);
    if (result.changes) {
      logAudit(client, {
        actorId: "system",
        action: "Üye arşivden çıkarıldı",
        targetId: member.id,
        details: "Discord sunucusuna yeniden katıldığı için üye kaydı etkinleştirildi."
      });
    }
  } catch (error) {
    console.error(`Geri dönen üye etkinleştirilemedi (${member.id}):`, error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commandMap.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("application:")) {
        await handleApplicationButton(interaction);
      } else if (interaction.customId.startsWith("silver:")) {
        await handleSilverButton(interaction);
      }
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "application:submit") {
      await handleApplicationButton(interaction);
    }
  } catch (error) {
    console.error("Etkileşim işlenemedi:", error);
    const response = {
      content: "İşlem sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyin.",
      flags: [MessageFlags.Ephemeral]
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(response).catch((followUpError) => {
        console.error("Etkileşim hata bildirimi gönderilemedi:", followUpError);
      });
    } else {
      await interaction.reply(response).catch((replyError) => {
        console.error("Etkileşim hata bildirimi gönderilemedi:", replyError);
      });
    }
  }
});

client.on(Events.Error, (error) => console.error("Discord istemci hatası:", error));
client.login(token).catch((error) => {
  console.error("Discord'a giriş yapılamadı:", error);
  process.exitCode = 1;
});
