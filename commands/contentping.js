const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { db, ensureUser, levelForXp } = require("../database");
const { grantLevelRoles } = require("../utils/levels");
const { requireStaff } = require("../utils/permissions");
const { logAudit } = require("../utils/audit");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("contentping")
    .setDescription("Takım üyelerini contente çağırır ve katılım XP'si verir.")
    .addIntegerOption((option) =>
      option.setName("takim_id").setDescription("Takım ID'si").setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    if (!await requireStaff(interaction, "contentping")) {
      return interaction.reply({ content: "Bu komutu yalnızca yetkililer kullanabilir.", flags: [MessageFlags.Ephemeral] });
    }

    const teamId = interaction.options.getInteger("takim_id");
    const team = db.prepare("SELECT * FROM teams WHERE team_id = ?").get(teamId);
    if (!team) {
      return interaction.reply({ content: `**${teamId}** ID'li takım bulunamadı.`, flags: [MessageFlags.Ephemeral] });
    }
    const configuredMemberIds = JSON.parse(team.members);
    if (!Array.isArray(configuredMemberIds) || configuredMemberIds.length === 0) {
      return interaction.reply({ content: "Bu takımda henüz üye yok.", flags: [MessageFlags.Ephemeral] });
    }
    const memberIds = configuredMemberIds.filter((memberId) => {
      const member = db.prepare("SELECT archived_at FROM users WHERE discord_id = ?").get(memberId);
      return !member || member.archived_at === null;
    });
    if (memberIds.length === 0) {
      return interaction.reply({ content: "Takımdaki kayıtlı üyelerin tamamı arşivlenmiş durumda.", flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply();
    const timestamp = new Date().toISOString();
    const update = db.prepare(`
      UPDATE users
      SET last_content = ?,
          content_count = content_count + 1,
          xp = xp + 500,
          level = MIN(50, CAST((xp + 500) / 1000 AS INTEGER) + 1)
      WHERE discord_id = ?
    `);
    const updateMany = db.transaction(() => {
      for (const memberId of memberIds) {
        ensureUser(memberId);
        update.run(timestamp, memberId);
      }
    });
    updateMany();

    const roleFailures = [];
    for (const memberId of memberIds) {
      const user = db.prepare("SELECT level, xp FROM users WHERE discord_id = ?").get(memberId);
      const oldLevel = levelForXp(user.xp - 500);
      const newLevel = levelForXp(user.xp);
      try {
        await grantLevelRoles(interaction.guild, memberId, oldLevel, newLevel);
      } catch (error) {
        console.error(`Seviye rolü verilemedi (${memberId}):`, error);
        roleFailures.push(memberId);
      }
    }

    const mentions = memberIds.map((id) => `<@${id}>`).join(" ");
    const roleWarning = roleFailures.length
      ? `\n⚠️ Seviye rolleri atanamadı: ${roleFailures.map((id) => `<@${id}>`).join(", ")}.`
      : "";
    void logAudit(interaction.client, {
      actorId: interaction.user.id,
      action: "Content ping uygulandı",
      details: `Takım ID: ${teamId}; üyeler: ${memberIds.join(", ")}; XP: 500/kişi`
    });
    return interaction.editReply({
      content: `⚔️ **Takım ${teamId} content çağrısı!** ${mentions}\nKatılan takım üyelerine **500 XP** işlendi.${roleWarning}`,
      allowedMentions: { users: memberIds }
    });
  }
};
