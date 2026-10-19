const config = require("../config.json");

async function grantLevelRoles(guild, userId, oldLevel, newLevel) {
  if (newLevel <= oldLevel) return;
  const member = await guild.members.fetch(userId);
  for (const [milestoneText, roleId] of Object.entries(config.levelRoles)) {
    const milestone = Number(milestoneText);
    if (!roleId || oldLevel >= milestone || newLevel < milestone) continue;
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      throw new Error(`Level ${milestone} rolü (${roleId}) sunucuda bulunamadı.`);
    }
    await member.roles.add(role, `Elderwood seviye eşiği: Level ${milestone}`);
  }
}

module.exports = { grantLevelRoles };
