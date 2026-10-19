# Elderwood Discord Bot

Discord.js v14 tabanlı, Albion Online lonca yönetim botu.

## Gereksinimler

- Node.js 20 veya üzeri
- Discord uygulama/bot token'ı ve botun sunucuda `applications.commands`, `View Channel`, `Send Messages`, `Embed Links`, `Read Message History` (başvuru paneli için) ve `Manage Roles` (seviye rolleri için) izinleri
- Albion Online oyun bilgi API'sine erişim

Discord Developer Portal'da **Server Members Intent** seçeneğini de etkinleştirin; gece pasiflik taraması sunucu üyelerini doğrular.

## Kurulum

1. `npm install` çalıştırın.
2. `.env.example` dosyasını `.env` olarak kopyalayıp `DISCORD_TOKEN` ve `CLIENT_ID` değerlerini girin.
3. `config.json` içindeki `guildId`, başvuru kanalları, log kanalları ve yetkili rol ID'lerini doldurun. `levelRoles` eşiklerine ilgili Discord rol ID'lerini yazın. Denetim günlüğü için `AUDIT_LOG_CHANNEL_ID` ortam değişkenini veya `auditLogChannelId` ayarını tanımlayın.
4. Slash komutlarını sunucuya kaydetmek için `npm run deploy` çalıştırın.
5. Botu başlatmak için `npm start` çalıştırın.

Bot açıldığında başvuru kanalındaki paneli oluşturur veya var olan paneli günceller. `data/elderwood.sqlite` SQLite veritabanı dosyası ilk açılışta oluşturulur. Bu dosyayı ve `.env` dosyasını yedekleyin; `.env` dosyasını paylaşmayın.

## Komutlar

Discord slash komut adları Türkçe karakter içeremediği için adlar ASCII'dir:

- `/takim olustur|sil|ekle|kaldir`, `/contentping takim_id` (yetkili)
- `/mazeret gun mesaj`, `/mazeretiptal`, `/mazeretlist` (sonuncusu yetkili; takvim ayı başına en fazla 15 gün)
- `/gunluk`, `/silvercek miktar`
- `/databaseekle kullanici oyun_nick level silver` (yetkili)
- `/uyebilgi kullanici`, `/liderlik`, `/yardim`

`/contentping`, takımın arşivlenmemiş üyelerinin katılımını kaydeder ve 500 XP ekler. Seviye 50, 49.000 XP'den itibaren üst sınırdır. Silver çekim için Level 10 ve en az 500.000 Silver bakiye gerekir; istenen miktar onaya kadar rezerve edilir ve ret durumunda iade edilir. Her gece config içindeki saat diliminde pasiflik taraması yapılır. Sunucudan ayrılan üyelerin kayıtları silinmez; geri katılırlarsa yeniden etkinleştirilir.

Denetim kaydı, `/databaseekle`, `/takim`, `/contentping`, Silver talep kararları ve arşiv durumundaki değişiklikleri `auditLogChannelId` kanalına gönderir. Bu kanal ayarlanmamışsa kayıtlar konsola yazılır. Haftalık Albion lonca kontrolü için `ALBION_GUILD_ID` (oyun lonca ID'si) ve `MANAGEMENT_CHANNEL_ID` (Discord yönetim kanalı) tanımlayın. `automaticRoleRemoval` varsayılan olarak kapalıdır; açılırsa yalnızca `memberRoleIdsToRemove` içindeki roller alınır. Ortam değişkenleri `AUDIT_LOG_CHANNEL_ID`, `MANAGEMENT_CHANNEL_ID` ve `ALBION_GUILD_ID` değerleri `config.json` ayarlarını geçersiz kılabilir.

Yeni şema alanları ve `excuse_usage` tablosu bot ilk açılışında mevcut SQLite verileri korunarak eklenir. Mazeret günlükleri `config.json` içindeki saat dilimine göre ay bazında tutulur.
