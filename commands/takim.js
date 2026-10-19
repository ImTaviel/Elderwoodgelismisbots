const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { db } = require("../database");
const { requireStaff } = require("../utils/permissions");
const { logAudit } = require("../utils/audit");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("takim")
    .setDescription("İçerik takımlarını yönetin.")
    .addSubcommand((subcommand) =>
      subcommand.setName("olustur").setDescription("Yeni bir takım oluşturur.")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sil")
        .setDescription("Bir takımı siler.")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Takım ID'si").setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ekle")
        .setDescription("Bir üyeyi takıma ekler.")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Takım ID'si").setRequired(true).setMinValue(1)
        )
        .addUserOption((option) =>
          option.setName("kullanici").setDescription("Eklenecek üye").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("kaldir")
        .setDescription("Bir üyeyi takımdan çıkarır.")
        .addIntegerOption((option) =>
          option.setName("id").setDescription("Takım ID'si").setRequired(true).setMinValue(1)
        )
        .addUserOption((option) =>
          option.setName("kullanici").setDescription("Çıkarılacak üye").setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!await requireStaff(interaction, `takim ${interaction.options.getSubcommand()}`)) {
      return interaction.reply({ content: "Bu komutu yalnızca yetkililer kullanabilir.", flags: [MessageFlags.Ephemeral] });
    }

    const action = interaction.options.getSubcommand();
    if (action === "olustur") {
      const result = db.prepare("INSERT INTO teams (members) VALUES ('[]')").run();
      void logAudit(interaction.client, {
        actorId: interaction.user.id,
        action: "Takım oluşturuldu",
        details: `Takım ID: ${result.lastInsertRowid}`
      });
      return interaction.reply(`Takım **${result.lastInsertRowid}** oluşturuldu.`);
    }

    const teamId = interaction.options.getInteger("id");
    const team = db.prepare("SELECT * FROM teams WHERE team_id = ?").get(teamId);
    if (!team) {
      return interaction.reply({ content: `**${teamId}** ID'li takım bulunamadı.`, flags: [MessageFlags.Ephemeral] });
    }
    if (action === "sil") {
      db.prepare("DELETE FROM teams WHERE team_id = ?").run(teamId);
      void logAudit(interaction.client, {
        actorId: interaction.user.id,
        action: "Takım silindi",
        details: `Takım ID: ${teamId}`
      });
      return interaction.reply(`Takım **${teamId}** silindi.`);
    }

    const user = interaction.options.getUser("kullanici");
    let members;
    try {
      members = JSON.parse(team.members);
      if (!Array.isArray(members)) throw new Error("Takım üyeleri bir dizi değil.");
    } catch (error) {
      console.error(`Takım ${teamId} üyeleri okunamadı:`, error);
      return interaction.reply({
        content: "Takım kadrosu okunamadı; veritabanı kaydını kontrol edin.",
        flags: [MessageFlags.Ephemeral]
      });
    }

    if (action === "ekle") {
      if (members.includes(user.id)) {
        return interaction.reply({ content: `${user} zaten bu takımda.`, flags: [MessageFlags.Ephemeral] });
      }
      members.push(user.id);
    } else {
      if (!members.includes(user.id)) {
        return interaction.reply({ content: `${user} bu takımda değil.`, flags: [MessageFlags.Ephemeral] });
      }
      members = members.filter((memberId) => memberId !== user.id);
    }
    db.prepare("UPDATE teams SET members = ? WHERE team_id = ?")
      .run(JSON.stringify(members), teamId);
    void logAudit(interaction.client, {
      actorId: interaction.user.id,
      action: action === "ekle" ? "Takıma üye eklendi" : "Takımdan üye çıkarıldı",
      targetId: user.id,
      details: `Takım ID: ${teamId}`
    });
    return interaction.reply(
      action === "ekle"
        ? `${user}, **${teamId}** numaralı takıma eklendi.`
        : `${user}, **${teamId}** numaralı takımdan çıkarıldı.`
    );
  }
};
