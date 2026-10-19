const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { db, ensureUser } = require("../database");
const { requireStaff } = require("../utils/permissions");
const { grantLevelRoles } = require("../utils/levels");
const { logAudit } = require("../utils/audit");

const commands = [{
  data: new SlashCommandBuilder()
    .setName("databaseekle")
    .setDescription("Bir üyeyi veritabanına manuel olarak ekler veya günceller.")
    .addUserOption((option) =>
      option.setName("kullanici").setDescription("Kaydedilecek Discord üyesi").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("oyun_nick").setDescription("Albion Online oyun içi adı").setRequired(true).setMaxLength(100)
    )
    .addIntegerOption((option) =>
      option.setName("level").setDescription("Üye seviyesi (1-50)").setRequired(true).setMinValue(1).setMaxValue(50)
    )
    .addIntegerOption((option) =>
      option.setName("silver").setDescription("Başlangıç Silver bakiyesi").setRequired(true).setMinValue(0)
    ),

  async execute(interaction) {
    if (!await requireStaff(interaction, "databaseekle")) {
      return interaction.reply({ content: "Bu komutu yalnızca yetkililer kullanabilir.", flags: [MessageFlags.Ephemeral] });
    }
    const user = interaction.options.getUser("kullanici");
    const ign = interaction.options.getString("oyun_nick").trim();
    const level = interaction.options.getInteger("level");
    const silver = interaction.options.getInteger("silver");
    if (!ign) {
      return interaction.reply({ content: "Oyun içi nick boş olamaz.", flags: [MessageFlags.Ephemeral] });
    }

    const previous = ensureUser(user.id);
    const oldLevel = previous.level;
    const xp = (level - 1) * 1000;
    db.prepare("UPDATE users SET ign = ?, level = ?, xp = ?, silver = ?, archived_at = NULL WHERE discord_id = ?")
      .run(ign, level, xp, silver, user.id);
    void logAudit(interaction.client, {
      actorId: interaction.user.id,
      action: "Üye veritabanına eklendi/güncellendi",
      targetId: user.id,
      details: `IGN: ${ign}; Level: ${level}; XP: ${xp}; Silver: ${silver}`
    });
    await interaction.deferReply();
    try {
      await grantLevelRoles(interaction.guild, user.id, oldLevel, level);
    } catch (error) {
      console.error(`Seviye rolü verilemedi (${user.id}):`, error);
      return interaction.editReply(`${user} veritabanına kaydedildi, ancak seviye rolü atanamadı. Botun rol izinlerini ve rol hiyerarşisini kontrol edin.`);
    }
    return interaction.editReply(`${user} veritabanına kaydedildi. IGN: **${ign}**, Level: **${level}**, Silver: **${silver.toLocaleString("tr-TR")}**.`);
  }
},

{
  data: new SlashCommandBuilder()
    .setName("uyebilgi")
    .setDescription("Bir üyenin oyun ve ekonomi bilgilerini gösterir.")
    .addUserOption((option) =>
      option.setName("kullanici").setDescription("Bilgisi görüntülenecek üye").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("kullanici");
    const user = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(target.id);
    if (!user) {
      return interaction.reply({ content: "Bu üye veritabanında kayıtlı değil.", flags: [MessageFlags.Ephemeral] });
    }
    const embed = new EmbedBuilder()
      .setTitle(`${user.ign} — Üye bilgileri`)
      .setThumbnail(target.displayAvatarURL())
      .setColor(0x5865f2)
      .addFields(
        { name: "Son content", value: user.last_content ? `<t:${Math.floor(new Date(user.last_content).getTime() / 1000)}:R>` : "Henüz yok", inline: true },
        { name: "Silver", value: user.silver.toLocaleString("tr-TR"), inline: true },
        { name: "Level", value: String(user.level), inline: true },
        { name: "XP", value: user.xp.toLocaleString("tr-TR"), inline: true },
        { name: "Content katılımı", value: String(user.content_count), inline: true }
      );
    return interaction.reply({ embeds: [embed] });
  }
},

{
  data: new SlashCommandBuilder()
    .setName("liderlik")
    .setDescription("Content katılımı ve seviyeye göre ilk 10 üyeyi gösterir."),

  async execute(interaction) {
    const leaders = db.prepare(`
      SELECT discord_id, ign, content_count, level, xp
      FROM users
      WHERE archived_at IS NULL
      ORDER BY content_count DESC, level DESC, xp DESC
      LIMIT 10
    `).all();
    if (leaders.length === 0) {
      return interaction.reply({ content: "Henüz liderlik tablosunda üye yok.", flags: [MessageFlags.Ephemeral] });
    }
    const description = leaders.map((member, index) =>
      `**${index + 1}.** <@${member.discord_id}> — **${member.ign}** · ${member.content_count} content · Level ${member.level} (${member.xp} XP)`
    ).join("\n");
    return interaction.reply({
      embeds: [new EmbedBuilder().setTitle("🏆 Elderwood Liderlik Tablosu").setDescription(description).setColor(0xf1c40f)],
      allowedMentions: { parse: [] }
    });
  }
},

{
  data: new SlashCommandBuilder()
    .setName("yardim")
    .setDescription("Bot komutlarını ve sistem kurallarını gösterir."),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("Elderwood Bot — Yardım")
      .setColor(0x2ecc71)
      .addFields(
        { name: "Takım ve content", value: "`/takim olustur|sil|ekle|kaldir`, `/contentping takim_id` — Yetkili işlemleri; content ping üyelere 500 XP verir.", inline: false },
        { name: "Mazeret", value: "`/mazeret gun mesaj` — Kendiniz için mazeret kaydedin; ayda en fazla 15 gün. `/mazeretiptal` kullanılmayan günleri iade eder; `/mazeretlist` yetkililere aktif mazeretleri gösterir.", inline: false },
        { name: "Ekonomi", value: "`/gunluk` — 24 saatte bir 10.000–50.000 Silver. `/silvercek miktar` — Level 10 ve en az 500.000 Silver gerektirir; talep yetkili onayına gider.", inline: false },
        { name: "Üye ve bilgi", value: "`/databaseekle kullanici oyun_nick level silver` (yetkili), `/uyebilgi kullanici`, `/liderlik`.", inline: false },
        { name: "Başvuru", value: "Başvuru kanalındaki **Başvuru Yap** butonunu kullanın. Onaylanan başvurular Albion API üzerinden kontrol edilir.", inline: false },
        { name: "Seviye sistemi", value: "Her 1.000 XP bir seviye kazandırır; üst sınır Level 50'dir. Her content çağrısı takım üyelerine 500 XP verir.", inline: false }
      );
    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  }
}];

module.exports = commands;
