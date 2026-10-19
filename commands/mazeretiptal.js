const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { db, ensureUser } = require("../database");
const { logAudit } = require("../utils/audit");

const dayMilliseconds = 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mazeretiptal")
    .setDescription("Aktif mazeretinizi iptal eder ve kullanılmayan günleri iade eder."),

  async execute(interaction) {
    ensureUser(interaction.user.id);
    const cancel = db.transaction(() => {
      const user = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(interaction.user.id);
      const now = Date.now();
      const expiresAt = user.excuse_until ? new Date(user.excuse_until).getTime() : 0;
      if (!expiresAt || expiresAt <= now) return { error: "inactive" };

      const unusedDays = Math.min(
        user.excuse_reserved_days,
        Math.ceil((expiresAt - now) / dayMilliseconds)
      );
      if (unusedDays > 0 && user.excuse_month) {
        db.prepare(`
          UPDATE excuse_usage SET days_used = MAX(0, days_used - ?)
          WHERE discord_id = ? AND month_key = ?
        `).run(unusedDays, interaction.user.id, user.excuse_month);
      }
      const usage = user.excuse_month
        ? db.prepare("SELECT days_used FROM excuse_usage WHERE discord_id = ? AND month_key = ?")
          .get(interaction.user.id, user.excuse_month)
        : null;
      db.prepare(`
        UPDATE users
        SET excuse_until = NULL, excuse_reserved_days = 0, excuse_month = NULL,
            monthly_excuse_days = ?
        WHERE discord_id = ?
      `).run(usage ? usage.days_used : 0, interaction.user.id);
      return { unusedDays, month: user.excuse_month };
    });

    const result = cancel();
    if (result.error) {
      return interaction.reply({ content: "İptal edilecek aktif bir mazeretiniz bulunmuyor.", flags: [MessageFlags.Ephemeral] });
    }
    void logAudit(interaction.client, {
      actorId: interaction.user.id,
      action: "Mazeret iptal edildi",
      details: `İade edilen kullanılmamış gün: ${result.unusedDays}; kullanım ayı: ${result.month || "bilinmiyor"}`
    });
    return interaction.reply({
      content: `Mazeretiniz iptal edildi. **${result.unusedDays}** kullanılmamış gün bu ayki hakkınıza iade edildi.`,
      flags: [MessageFlags.Ephemeral]
    });
  }
};
