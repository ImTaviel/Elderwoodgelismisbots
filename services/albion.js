const axios = require("axios");

const baseUrl = "https://gameinfo.albiononline.com/api/gameinfo";

function fameValue(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

async function findPlayer(ign) {
  const searchResponse = await axios.get(`${baseUrl}/search`, {
    params: { q: ign },
    timeout: 10000
  });
  const players = searchResponse.data && Array.isArray(searchResponse.data.players)
    ? searchResponse.data.players
    : [];
  if (players.length === 0) {
    return null;
  }
  const exactMatches = players.filter((player) =>
    typeof player.Name === "string" && player.Name.toLowerCase() === ign.toLowerCase()
  );
  const candidates = exactMatches.length ? exactMatches : players;
  if (candidates.length !== 1) {
    throw new Error(`Albion API "${ign}" için birden fazla oyuncu buldu; başvuruyu manuel kontrol edin.`);
  }
  const player = candidates[0];
  if (!player.Id) throw new Error("Albion API oyuncu kaydında oyuncu ID'si bulunamadı.");

  const detailResponse = await axios.get(`${baseUrl}/players/${encodeURIComponent(player.Id)}`, {
    timeout: 10000
  });
  const detail = detailResponse.data || {};
  const lifetime = detail.LifetimeStatistics || {};
  return {
    name: detail.Name || player.Name || ign,
    playerId: detail.Id || player.Id,
    guildId: detail.GuildId || player.GuildId || null,
    pvpFame: fameValue(lifetime.PvP && lifetime.PvP.Fame) ??
      fameValue(detail.KillFame) ?? fameValue(player.KillFame),
    pveFame: fameValue(lifetime.PvE && lifetime.PvE.Total) ??
      fameValue(detail.PvEFame) ?? fameValue(player.PvEFame)
  };
}

module.exports = { findPlayer };
