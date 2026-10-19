const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { db } = require("../database");
const { requireStaff } = require("../utils/permissions");
const { logAudit } = require("../utils/audit");

const activeRequests = new Set();

async function handleSilverButton(interaction) {
  if (!interaction.customId.startsWith("silver:")) return;
  if (!await requireStaff(interaction, "silver talep kararı")) {
    return interaction.reply({ content: "Bu işlemi yalnızca yetkililer yapabilir.", flags: [MessageFlags.Ephemeral] });
  }
  const [, action, idText] = interaction.customId.split(":");
  const requestId = Number(idText);
  if (!Number.isSafeInteger(requestId) || requestId < 1 || !["approve", "reject"].includes(action)) {
    return interaction.reply({ content: "Geçersiz Silver talebi.", flags: [MessageFlags.Ephemeral] });
  }
  const request = db.prepare("SELECT * FROM silver_requests WHERE request_id = ?").get(requestId);
  if (!request || request.status !== "pending") {
    return interaction.reply({ content: "Talep bulunamadı veya daha önce sonuçlandırıldı.", flags: [MessageFlags.Ephemeral] });
  }
  if (activeRequests.has(requestId)) {
    return interaction.reply({ content: "Bu talep şu anda işleniyor.", flags: [MessageFlags.Ephemeral] });
  }

  activeRequests.add(requestId);
  try {
    await interaction.deferUpdate();
    const originalComponents = interaction.message.components.map((row) => ActionRowBuilder.from(row));
    const disabledComponents = interaction.message.components.map((row) =>
      ActionRowBuilder.from(row).setComponents(
        row.components.map((component) => ButtonBuilder.from(component).setDisabled(true))
      )
    );
    await interaction.message.edit({ components: disabledComponents });

    const status = action === "approve" ? "approved" : "rejected";
    try {
      db.transaction(() => {
        const update = db.prepare(`
          UPDATE silver_requests SET status = ?, resolved_at = ?
          WHERE request_id = ? AND status = 'pending'
        `).run(status, new Date().toISOString(), requestId);
        if (update.changes !== 1) throw new Error("Silver talebi başka bir yetkili tarafından sonuçlandırılmış.");
        if (status === "rejected") {
          db.prepare("UPDATE users SET silver = silver + ? WHERE discord_id = ?")
            .run(request.amount, request.discord_id);
        }
      })();
    } catch (error) {
      const current = db.prepare("SELECT status FROM silver_requests WHERE request_id = ?").get(requestId);
      if (current && current.status === "pending") {
        await interaction.message.edit({ components: originalComponents }).catch((editError) => {
          console.error(`Silver talebi ${requestId} butonları geri açılamadı:`, editError);
        });
      }
      throw error;
    }

    const outcome = status === "approved" ? "onaylandı" : "reddedildi; rezerve edilen Silver bakiyenize iade edildi";
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(status === "approved" ? 0x2ecc71 : 0xe74c3c)
      .addFields({ name: "Sonuç", value: `${outcome}\nYetkili: <@${interaction.user.id}>` })
      .setFooter({ text: `Talep ${status}` });
    await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
    await logAudit(interaction.client, {
      actorId: interaction.user.id,
      action: `Silver talebi ${status === "approved" ? "onaylandı" : "reddedildi"}`,
      targetId: request.discord_id,
      details: `Talep ID: ${requestId}; miktar: ${request.amount}; sonuç: ${status}`
    });

    try {
      const user = await interaction.client.users.fetch(request.discord_id);
      await user.send(`Silver çekim talebiniz **${request.amount.toLocaleString("tr-TR")} Silver** için ${outcome}.`);
    } catch (error) {
      console.error(`Silver talebi ${requestId} için kullanıcıya DM gönderilemedi:`, error);
      await interaction.followUp({
        content: `İşlem tamamlandı; ancak <@${request.discord_id}> kullanıcısına DM gönderilemedi.`,
        flags: [MessageFlags.Ephemeral]
      });
    }
  } finally {
    activeRequests.delete(requestId);
  }
}

module.exports = { handleSilverButton };
