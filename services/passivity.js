const { db } = require("../database");
async function checkPassivity(client) {
  const now = new Date();
  db.prepare(`
    UPDATE users
    SET excuse_until = NULL
    WHERE excuse_until IS NOT NULL AND excuse_until <= ?
  `).run(now.toISOString());

  const channelId = client.config.contentPassiveLogChannelId;
  if (!channelId) {
    console.error("contentPassiveLogChannelId config.json içinde tanımlanmamış; pasiflik raporu gönderilmedi.");
    return;
  }
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Pasiflik log kanalı bulunamadı veya metin kanalı değil.");
  }

  const guild = await client.guilds.fetch(client.config.guildId);
  const cutoff = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const inactiveUsers = db.prepare(`
    SELECT discord_id, ign, last_content
    FROM users
    WHERE (last_content IS NULL OR last_content < ?)
      AND (excuse_until IS NULL OR excuse_until <= ?)
      AND archived_at IS NULL
    ORDER BY last_content ASC
  `).all(cutoff, now.toISOString());

  const activeMembers = [];
  for (const user of inactiveUsers) {
    try {
      const member = await guild.members.fetch(user.discord_id);
      activeMembers.push({ ...user, displayName: member.displayName });
    } catch (error) {
      if (error.code !== 10007) {
        console.error(`Pasiflik denetiminde üye alınamadı (${user.discord_id}):`, error);
      }
    }
  }
  if (activeMembers.length === 0) return;

  for (let index = 0; index < activeMembers.length; index += 10) {
    const batch = activeMembers.slice(index, index + 10);
    const report = batch.map((user) => {
      const lastContent = user.last_content
        ? `<t:${Math.floor(new Date(user.last_content).getTime() / 1000)}:R>`
        : "hiç content kaydı yok";
      return `• <@${user.discord_id}> (**${user.ign}**) — son content: ${lastContent}`;
    }).join("\n");
    await channel.send({
      content: `⚠️ **10 günü aşan pasiflik raporu**\n${report}`,
      allowedMentions: { users: batch.map((user) => user.discord_id) }
    });
  }
}

async function startPassivityScheduler(client) {
  const cron = await import("node-cron");
  cron.schedule("0 0 * * *", () => {
    checkPassivity(client).catch((error) => {
      console.error("Gece yarısı pasiflik kontrolü başarısız:", error);
    });
  }, { timezone: client.config.timezone });
}

module.exports = { checkPassivity, startPassivityScheduler };
