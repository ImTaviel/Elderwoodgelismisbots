const { db } = require("../database");
const { findPlayer } = require("./albion");
const { logAudit } = require("../utils/audit");

async function verifyAlbionMembership(client) {
  const { albionGuildId, managementChannelId } = client.config;
  if (!albionGuildId) {
    console.error("albionGuildId tanımlı değil; haftalık Albion lonca doğrulaması çalıştırılmadı.");
    return;
  }
  if (!managementChannelId) {
    console.error("managementChannelId tanımlı değil; haftalık Albion lonca doğrulaması çalıştırılmadı.");
    return;
  }

  const users = db.prepare(`
    SELECT discord_id, ign, archived_at
    FROM users
    WHERE ign IS NOT NULL AND ign != '' AND ign != 'Belirtilmedi'
  `).all();
  const guild = await client.guilds.fetch(client.config.guildId);
  const changes = [];
  let nextIndex = 0;

  async function verifyNext() {
    while (nextIndex < users.length) {
      const user = users[nextIndex++];
      try {
        const player = await findPlayer(user.ign);
        if (!player) {
          changes.push(`• <@${user.discord_id}> (${user.ign}): Albion API'de bulunamadı; kayıt değiştirilmedi.`);
          continue;
        }
        const isInGuild = String(player.guildId || "").toLowerCase() === String(albionGuildId).toLowerCase();
        if (!isInGuild) {
          const archivedAt = new Date().toISOString();
          const result = db.prepare(`
            UPDATE users SET archived_at = ?
            WHERE discord_id = ? AND archived_at IS NULL
          `).run(archivedAt, user.discord_id);
          if (result.changes) {
            changes.push(`• <@${user.discord_id}> (${user.ign}): Albion loncasından ayrılmış; kayıt arşivlendi.`);
            await logAudit(client, {
              actorId: "system",
              action: "Albion üyeliği sonlandığı için arşivlendi",
              targetId: user.discord_id,
              details: `IGN: ${user.ign}; lonca ID: ${player.guildId || "loncasız"}`
            });
          }
          if (client.config.automaticRoleRemoval && client.config.memberRoleIdsToRemove.length) {
            try {
              const member = await guild.members.fetch(user.discord_id);
              const roles = client.config.memberRoleIdsToRemove
                .map(String)
                .filter((roleId) => member.roles.cache.has(roleId));
              if (roles.length) await member.roles.remove(roles, "Albion lonca üyeliği doğrulanamadı.");
            } catch (error) {
              if (error.code !== 10007) {
                console.error(`Albion üyeliği sonlanan üyeden rol alınamadı (${user.discord_id}):`, error);
              }
            }
          }
          continue;
        }

        let member;
        try {
          member = await guild.members.fetch(user.discord_id);
        } catch (error) {
          if (error.code !== 10007) {
            console.error(`Discord üyesi doğrulanamadı (${user.discord_id}):`, error);
          }
          continue;
        }

        const updates = [];
        if (user.ign !== player.name) updates.push(`IGN: ${user.ign} → ${player.name}`);
        const wasArchived = Boolean(user.archived_at);
        db.prepare(`
          UPDATE users SET ign = ?, archived_at = NULL
          WHERE discord_id = ?
        `).run(player.name, user.discord_id);
        if (wasArchived) {
          updates.push("Albion loncasına yeniden katıldığı için kayıt etkinleştirildi");
          await logAudit(client, {
            actorId: "system",
            action: "Albion üyeliği geri döndüğü için kayıt etkinleştirildi",
            targetId: user.discord_id,
            details: `IGN: ${player.name}`
          });
        }
        if (updates.length) changes.push(`• <@${user.discord_id}>: ${updates.join("; ")}.`);
      } catch (error) {
        console.error(`Albion üyeliği doğrulanamadı (${user.discord_id}, ${user.ign}):`, error);
        changes.push(`• <@${user.discord_id}> (${user.ign}): API hatası; kayıt değiştirilmedi.`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, users.length) }, () => verifyNext()));
  if (changes.length === 0) return;
  const channel = await client.channels.fetch(managementChannelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Yönetim kanalı bulunamadı veya metin kanalı değil.");
  }
  for (let index = 0; index < changes.length; index += 15) {
    await channel.send({
      content: `**Haftalık Albion lonca doğrulaması**\n${changes.slice(index, index + 15).join("\n")}`,
      allowedMentions: { parse: [] }
    });
  }
}

async function startAlbionMembershipScheduler(client) {
  const cron = await import("node-cron");
  cron.schedule("0 20 * * 0", () => {
    verifyAlbionMembership(client).catch((error) => {
      console.error("Haftalık Albion lonca doğrulaması başarısız:", error);
    });
  }, { timezone: client.config.timezone });
}

module.exports = { verifyAlbionMembership, startAlbionMembershipScheduler };
