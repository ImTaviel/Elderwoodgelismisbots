const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { db } = require("../database");
const { requireStaff } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mazeretlist")
    .setDescription("Aktif mazeretleri listeler (yetkili)."),

  async execute(interaction) {
    if (!await requireStaff(interaction, "mazeretlist")) {
      return interaction.reply({ content: "Bu komutu yalnızca yetkililer kullanabilir.", flags: [MessageFlags.Ephemeral] });
    }
    const active = db.prepare(`
      SELECT discord_id, excuse_until
      FROM users
      WHERE excuse_until IS NOT NULL AND excuse_until > ?
      ORDER BY excuse_until
    `).all(new Date().toISOString());
    if (active.length === 0) {
      return interaction.reply({ content: "Şu anda aktif mazeret bulunmuyor.", flags: [MessageFlags.Ephemeral] });
    }
    const description = active.map(({ discord_id, excuse_until }) =>
      `• <@${discord_id}> — <t:${Math.floor(new Date(excuse_until).getTime() / 1000)}:F> tarihine kadar`
    ).join("\n");
    return interaction.reply({
      content: `**Aktif mazeretler (${active.length})**\n${description}`,
      flags: [MessageFlags.Ephemeral],
      allowedMentions: { parse: [] }
    });
  }
};
