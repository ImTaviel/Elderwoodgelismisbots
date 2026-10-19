const { EmbedBuilder } = require("discord.js");

async function logAudit(client, { actorId, action, targetId, details }) {
  const channelId = client.config.auditLogChannelId;
  if (!channelId) {
    console.error(`AUDIT LOG: ${action}; actor=${actorId || "system"}; target=${targetId || "none"}; ${details || ""}`);
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error("Audit log kanalı bulunamadı veya metin kanalı değil.");
    }
    const embed = new EmbedBuilder()
      .setTitle(action)
      .setColor(0x5865f2)
      .addFields(
        { name: "İşlemi yapan", value: actorId === "system" ? "Sistem" : actorId ? `<@${actorId}> (\`${actorId}\`)` : "Bilinmiyor" },
        { name: "Hedef", value: targetId ? `<@${targetId}> (\`${targetId}\`)` : "Yok" },
        { name: "Parametreler", value: String(details || "Belirtilmedi").slice(0, 1024) }
      )
      .setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error("Audit kaydı gönderilemedi:", error);
  }
}

module.exports = { logAudit };
