const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { db, ensureUser } = require("../database");
const { monthKey } = require("../utils/time");

const dayMilliseconds = 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mazeret")
    .setDescription("İçerik pasifliği için mazeret süresi tanımlar.")
    .addIntegerOption((option) =>
      option.setName("gun").setDescription("Mazeret gün sayısı (1-15)").setRequired(true).setMinValue(1).setMaxValue(15)
    )
    .addStringOption((option) =>
      option.setName("mesaj").setDescription("Mazeret açıklaması").setRequired(true).setMaxLength(500)
    ),

  async execute(interaction) {
    const days = interaction.options.getInteger("gun");
    const reason = interaction.options.getString("mesaj");
    const now = new Date();
    const nowIso = now.toISOString();
    const currentMonth = monthKey(now, interaction.client.config.timezone);
    ensureUser(interaction.user.id);

    const createExcuse = db.transaction(() => {
      const currentUser = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(interaction.user.id);
      if (currentUser.excuse_until && new Date(currentUser.excuse_until) > now) {
        return { error: "active" };
      }

      const usage = db.prepare(`
        SELECT days_used FROM excuse_usage WHERE discord_id = ? AND month_key = ?
      `).get(interaction.user.id, currentMonth);
      const usedDays = usage ? usage.days_used : 0;
      if (usedDays + days > 15) return { error: "limit", usedDays };

      db.prepare(`
        INSERT INTO excuse_usage (discord_id, month_key, days_used)
        VALUES (?, ?, ?)
        ON CONFLICT(discord_id, month_key)
        DO UPDATE SET days_used = days_used + excluded.days_used
        WHERE days_used + excluded.days_used <= 15
      `).run(interaction.user.id, currentMonth, days);

      const expiresAt = new Date(now.getTime() + days * dayMilliseconds).toISOString();
      db.prepare(`
        UPDATE users
        SET excuse_until = ?, excuse_reserved_days = ?, excuse_month = ?,
            monthly_excuse_days = ?
        WHERE discord_id = ?
      `).run(expiresAt, days, currentMonth, usedDays + days, interaction.user.id);
      return { expiresAt, usedDays: usedDays + days };
    });

    try {
      const result = createExcuse();
      if (result.error === "active") {
        return interaction.reply({ content: "Aktif bir mazeret süreniz zaten var.", flags: [MessageFlags.Ephemeral] });
      }
      if (result.error === "limit") {
        return interaction.reply({
          content: `Bu ay ${result.usedDays} gün mazeret kullanıldı. Aylık 15 günlük sınır aşılıyor; mazeret tanımlanmadı.`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      return interaction.reply({
        content: `Mazeretiniz **${days} gün** için tanımlandı ve <t:${Math.floor(new Date(result.expiresAt).getTime() / 1000)}:F> tarihinde sona erecek.\nAçıklama: ${reason}`,
        flags: [MessageFlags.Ephemeral]
      });
    } catch (error) {
      console.error(`Mazeret kaydedilemedi (${interaction.user.id}):`, error);
      throw error;
    }
  }
};
