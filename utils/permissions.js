const { PermissionFlagsBits } = require("discord.js");

function isStaff(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.some((role) =>
      member.client.config.adminRoleIds.some((roleId) => String(roleId) === role.id)
    );
}

async function requireStaff(interaction, action) {
  if (isStaff(interaction.member)) return true;
  const { logAudit } = require("./audit");
  void logAudit(interaction.client, {
    actorId: interaction.user.id,
    action: "Yetkisiz işlem denemesi",
    details: `${action} komutu/işlemi için gerekli yetkili rolü yok.`
  });
  return false;
}

module.exports = { isStaff, requireStaff };
