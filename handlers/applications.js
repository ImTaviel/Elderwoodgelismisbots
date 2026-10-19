const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { db } = require("../database");
const { findPlayer } = require("../services/albion");
const { isStaff } = require("../utils/permissions");

const panelCustomId = "application:open";
const screenshotInputCustomId = "screenshot_url";

function applicationPanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("Elderwood Lonca Başvurusu")
        .setDescription("Albion Online karakter bilgileriniz ve kısa bir tanıtımınızla başvurun. Formu açmak için aşağıdaki butona tıklayın.")
        .setColor(0x2ecc71)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(panelCustomId).setLabel("Başvuru Yap").setStyle(ButtonStyle.Success)
      )
    ]
  };
}

async function ensureApplicationPanel(client) {
  const channelId = client.config.applicationChannelId;
  if (!channelId) {
    console.error("applicationChannelId config.json içinde tanımlanmamış; başvuru paneli kurulmadı.");
    return;
  }
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Başvuru kanalı bulunamadı veya metin kanalı değil.");
  }
  const recentMessages = await channel.messages.fetch({ limit: 50 });
  const existingPanel = recentMessages.find((message) =>
    message.author.id === client.user.id &&
    message.components.some((row) => row.components.some((component) => component.customId === panelCustomId))
  );
  if (existingPanel) {
    await existingPanel.edit(applicationPanel());
  } else {
    await channel.send(applicationPanel());
  }
}

function showApplicationModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("application:submit")
    .setTitle("Elderwood Başvurusu")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(screenshotInputCustomId)
          .setLabel("Stat SS Linki (imgur.com)")
          .setPlaceholder("https://imgur.com/...")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(300)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ign")
          .setLabel("Oyun İçi Nick")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Neden Elderwood?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
  return interaction.showModal(modal);
}

async function submitApplication(interaction) {
  const screenshot = interaction.fields.getTextInputValue(screenshotInputCustomId).trim();
  const ign = interaction.fields.getTextInputValue("ign").trim();
  const reason = interaction.fields.getTextInputValue("reason").trim();
  if (!ign || !reason) {
    return interaction.reply({
      content: "Oyun içi nick ve başvuru açıklaması boş bırakılamaz.",
      flags: [MessageFlags.Ephemeral]
    });
  }
  let screenshotUrl;
  try {
    screenshotUrl = new URL(screenshot);
  } catch {
    return interaction.reply({ content: "Geçerli bir Imgur bağlantısı girin.", flags: [MessageFlags.Ephemeral] });
  }
  if (!["http:", "https:"].includes(screenshotUrl.protocol) ||
      !["imgur.com", "www.imgur.com", "i.imgur.com"].includes(screenshotUrl.hostname.toLowerCase())) {
    return interaction.reply({
      content: "Stat ekran görüntüsü bağlantısı imgur.com alan adında olmalıdır.",
      flags: [MessageFlags.Ephemeral]
    });
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const logChannel = await interaction.client.channels.fetch(interaction.client.config.applicationLogChannelId);
  if (!logChannel || !logChannel.isTextBased()) {
    throw new Error("Başvuru yetkili log kanalı bulunamadı veya metin kanalı değil.");
  }
  const createdAt = new Date().toISOString();
  const screenshotUrlForStorage = screenshotUrl.href || "Belirtilmedi";
  const applicationId = db.prepare(`
    INSERT INTO applications (discord_id, ign, screenshot_url, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(interaction.user.id, ign, screenshotUrlForStorage, reason, createdAt).lastInsertRowid;

  const embed = new EmbedBuilder()
    .setTitle(`Yeni başvuru #${applicationId}`)
    .setColor(0x3498db)
    .addFields(
      { name: "Başvuran", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Oyun içi nick", value: ign, inline: true },
      { name: "Neden Elderwood?", value: reason },
      { name: "Stat ekran görüntüsü", value: screenshotUrlForStorage }
    )
    .setTimestamp(new Date(createdAt));
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`application:approve:${applicationId}`).setLabel("Onayla").setStyle(ButtonStyle.Success)
  );
  try {
    await logChannel.send({ embeds: [embed], components: [buttons] });
  } catch (error) {
    db.prepare("DELETE FROM applications WHERE application_id = ? AND status = 'pending'").run(applicationId);
    throw error;
  }
  return interaction.editReply("Başvurunuz yetkili ekibine iletildi.");
}

async function approveApplication(interaction, applicationId) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: "Bu işlemi yalnızca yetkililer yapabilir.", flags: [MessageFlags.Ephemeral] });
  }
  const application = db.prepare("SELECT * FROM applications WHERE application_id = ?").get(applicationId);
  if (!application || application.status !== "pending") {
    return interaction.reply({ content: "Başvuru bulunamadı veya daha önce sonuçlandırıldı.", flags: [MessageFlags.Ephemeral] });
  }
  await interaction.deferUpdate();
  const player = await findPlayer(application.ign);
  const timestamp = new Date().toISOString();
  const result = db.transaction(() => {
    const updated = db.prepare(`
      UPDATE applications
      SET status = 'approved', resolved_at = ?, pvp_fame = ?, pve_fame = ?
      WHERE application_id = ? AND status = 'pending'
    `).run(timestamp, player ? player.pvpFame : null, player ? player.pveFame : null, applicationId);
    if (updated.changes !== 1) throw new Error("Başvuru başka bir yetkili tarafından sonuçlandırılmış.");
    db.prepare(`
      INSERT INTO users (discord_id, ign) VALUES (?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET ign = excluded.ign
    `).run(application.discord_id, player ? player.name : application.ign);
  });
  result();

  const fameText = player
    ? `PvP Fame: ${player.pvpFame === null ? "API verisi yok" : player.pvpFame.toLocaleString("tr-TR")}\nPvE Fame: ${player.pveFame === null ? "API verisi yok" : player.pveFame.toLocaleString("tr-TR")}`
    : "Albion API üzerinde oyuncu verisi bulunamadı";
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x2ecc71)
    .addFields({ name: "Albion API Fame", value: fameText }, { name: "Onaylayan", value: `<@${interaction.user.id}>` })
    .setFooter({ text: "Başvuru onaylandı" });
  await interaction.editReply({ embeds: [updatedEmbed], components: [] });
}

module.exports = {
  ensureApplicationPanel,
  handleApplicationButton: async (interaction) => {
    if (interaction.customId === panelCustomId) return showApplicationModal(interaction);
    if (interaction.customId.startsWith("application:approve:")) {
      const applicationId = Number(interaction.customId.split(":")[2]);
      if (!Number.isSafeInteger(applicationId) || applicationId < 1) {
        return interaction.reply({ content: "Geçersiz başvuru numarası.", flags: [MessageFlags.Ephemeral] });
      }
      return approveApplication(interaction, applicationId);
    }
    if (interaction.customId === "application:submit") return submitApplication(interaction);
  }
};
