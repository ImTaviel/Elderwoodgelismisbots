require("dotenv").config();
const { REST, Routes } = require("discord.js");
const config = require("./config.json");
const commands = require("./commands");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId || !config.guildId) {
  throw new Error("DISCORD_TOKEN, CLIENT_ID ve config.json içindeki guildId tanımlanmalıdır.");
}

const rest = new REST({ version: "10" }).setToken(token);

rest.put(Routes.applicationGuildCommands(clientId, config.guildId), {
  body: commands.map((command) => command.data.toJSON())
}).then(() => {
  console.log(`${commands.length} slash komutu sunucuya kaydedildi.`);
}).catch((error) => {
  console.error("Slash komutları kaydedilemedi:", error);
  process.exitCode = 1;
});
