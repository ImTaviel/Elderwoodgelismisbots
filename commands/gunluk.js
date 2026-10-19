const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { db, ensureUser } = require("../database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gunluk")
    .setDescription("24 saatte bir günlük Silver ödülünüzü alın."),

  async execute(interaction) {
    ensureUser(interaction.user.id);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const reward = Math.floor(Math.random() * 40001) + 10000;
    const timestamp = new Date(now).toISOString();
    const claimed = db.prepare(`
      UPDATE users
      SET silver = silver + ?, last_daily = ?
      WHERE discord_id = ?
        AND (last_daily IS NULL OR last_daily <= ?)
    `).run(reward, timestamp, interaction.user.id, new Date(now - cooldown).toISOString());
    if (claimed.changes !== 1) {
      const user = db.prepare("SELECT last_daily FROM users WHERE discord_id = ?").get(interaction.user.id);
      const lastDaily = user.last_daily ? new Date(user.last_daily).getTime() : 0;
      const availableAt = lastDaily + cooldown;
      return interaction.reply({
        content: `Günlük ödülünüzü zaten aldınız. Tekrar <t:${Math.ceil(availableAt / 1000)}:R> alabilirsiniz.`,
        flags: [MessageFlags.Ephemeral]
      });
    }
    return interaction.reply(`🎁 Günlük ödülünüz: **${reward.toLocaleString("tr-TR")} Silver**!`);
  }
};
