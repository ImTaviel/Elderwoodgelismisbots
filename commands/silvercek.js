const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { db, ensureUser } = require("../database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("silvercek")
    .setDescription("Silver çekim isteği oluşturur.")
    .addIntegerOption((option) =>
      option.setName("miktar").setDescription("Çekilecek Silver miktarı").setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const amount = interaction.options.getInteger("miktar");
    const user = ensureUser(interaction.user.id);
    if (user.level < 10) {
      return interaction.editReply({ content: "Silver çekmek için en az **Level 10** olmalısınız." });
    }
    if (user.silver < 500000) {
      return interaction.editReply({ content: "Silver çekim talebi oluşturmak için bakiyeniz en az **500.000 Silver** olmalıdır." });
    }
    if (user.silver < amount) {
      return interaction.editReply({ content: "Silver bakiyeniz bu çekim için yetersiz." });
    }

    const logChannel = await interaction.client.channels.fetch(interaction.client.config.silverLogChannelId);
    if (!logChannel || !logChannel.isTextBased()) {
      throw new Error("Silver log kanalı bulunamadı veya metin kanalı değil.");
    }

    const timestamp = new Date().toISOString();
    const request = db.transaction(() => {
      const balanceUpdate = db.prepare(`
        UPDATE users SET silver = silver - ?
        WHERE discord_id = ? AND silver >= ? AND silver >= 500000 AND level >= 10
      `).run(amount, interaction.user.id, amount);
      if (balanceUpdate.changes !== 1) {
        throw new Error("Talep sırasında bakiye veya seviye değişti; işlem durduruldu.");
      }
      return db.prepare(`
        INSERT INTO silver_requests (discord_id, amount, created_at)
        VALUES (?, ?, ?)
      `).run(interaction.user.id, amount, timestamp).lastInsertRowid;
    });
    const requestId = request();

    try {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
      const embed = new EmbedBuilder()
        .setTitle("Silver çekim talebi")
        .setColor(0xf1c40f)
        .setDescription(`Kullanıcı: <@${interaction.user.id}>\nMiktar: **${amount.toLocaleString("tr-TR")} Silver**\nTalep: \`${requestId}\``)
        .setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`silver:approve:${requestId}`).setLabel("Onayla").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`silver:reject:${requestId}`).setLabel("Reddet").setStyle(ButtonStyle.Danger)
      );
      await logChannel.send({ embeds: [embed], components: [buttons] });
    } catch (error) {
      db.transaction(() => {
        db.prepare("UPDATE users SET silver = silver + ? WHERE discord_id = ?")
          .run(amount, interaction.user.id);
        db.prepare("UPDATE silver_requests SET status = 'cancelled', resolved_at = ? WHERE request_id = ? AND status = 'pending'")
          .run(new Date().toISOString(), requestId);
      })();
      throw error;
    }

    return interaction.editReply(`**${amount.toLocaleString("tr-TR")} Silver** çekim talebiniz yetkili onayına gönderildi. Talep sonuçlanana kadar bakiye rezerve edilmiştir.`);
  }
};
