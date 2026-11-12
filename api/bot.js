// FILE: api/bot.js (Deploy on Vercel for 24/7 Phone-OFF Zero-Lag Execution)
const FIREBASE_DB_URL = "https://kumarkorapp-default-rtdb.asia-southeast1.firebasedatabase.app";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, engine: "Kumar 24/7 Multi-Bot Cloud Webhook Active" });
  }

  const botId = req.query.botId;
  const upd = req.body;
  if (!botId || !upd) return res.status(200).send("OK");

  try {
    // 1. Fetch Bot Config & State from your Firebase (kumarkorapp)
    const fbRes = await fetch(`${FIREBASE_DB_URL}/kumar_cloud/bots/${botId}.json`);
    const node = await fbRes.json();
    if (!node || !node.botConfig || !node.botConfig.active) {
      return res.status(200).send("BOT_OFF");
    }

    const cfg = node.botConfig;
    const token = cfg.token;
    const players = node.playersMap || {};

    const isCb = Boolean(upd.callback_query);
    const from = isCb ? upd.callback_query.from : (upd.message && upd.message.from);
    if (!from) return res.status(200).send("OK");

    const uid = String(from.id);
    const name = ((from.first_name || "") + " " + (from.last_name || "")).trim() || "Player";

    if (!players[uid]) {
      const joinBon = Number(cfg.joinReward || 2);
      players[uid] = {
        id: uid,
        name: name,
        username: from.username || "",
        balance: joinBon,
        totalEarned: joinBon,
        totalWithdrawn: 0,
        oxWins: 0,
        oxLosses: 0,
        referrals: 0,
        oxStake: 1,
        banned: false
      };
    }

    const p = players[uid];
    if (p.banned) {
      await tgSend(token, uid, "🚫 <b>You are BANNED from this bot by the Administrator.</b>");
      return res.status(200).send("OK");
    }

    const sw = cfg.cmdSwitch || {};
    const kb = {
      keyboard: [
        [{ text: "👤 My Profile" }, ...(sw.pay !== false ? [{ text: "💳 Pay / Deposit" }] : [])],
        ...(sw.ox !== false || cfg.tasksEnabled !== false
          ? [[...(sw.ox !== false ? [{ text: "🎮 Play O-X Game" }] : []), ...(cfg.tasksEnabled !== false ? [{ text: "📋 Task Center" }] : [])]]
          : []),
        [{ text: "🎁 Daily Bonus" }, { text: "👥 Refer & Earn" }],
        [{ text: "💸 Withdraw" }, { text: "📜 History" }]
      ],
      resize_keyboard: true
    };

    if (!isCb && upd.message && upd.message.text) {
      const text = upd.message.text.trim();

      if (text.startsWith("/start")) {
        const fundTxt = cfg.unlimitedFund ? "♾️ Unlimited" : `₹${Number(cfg.botFund || 500).toFixed(2)}`;
        const welcome =
          `👑 <b>Welcome to ${cfg.name || cfg.username}, ${name}!</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 <b>User ID:</b> <code>${uid}</code>\n` +
          `💰 <b>Balance:</b> <code>₹${Number(p.balance || 0).toFixed(2)}</code>\n` +
          `💵 <b>Live Bot Fund:</b> <code>${fundTxt}</code>\n` +
          `🎁 <b>Daily:</b> <code>₹${Number(cfg.dailyBonus || 2).toFixed(2)}</code> | 👥 <b>Refer:</b> <code>₹${Number(cfg.referBonus || 5).toFixed(2)}</code>`;
        await tgSend(token, uid, welcome, kb);
      } else if (text.includes("Profile")) {
        await tgSend(
          token,
          uid,
          `👤 <b>PLAYER PROFILE</b>\n━━━━━━━━━━━━━━━━━━━━\n🧑 Name: <b>${p.name}</b>\n🆔 ID: <code>${uid}</code>\n💰 Balance: <code>₹${Number(p.balance || 0).toFixed(2)}</code>`,
          kb
        );
      } else if (text.includes("Bonus")) {
        const today = new Date().toISOString().slice(0, 10);
        if (p.lastBonus === today) {
          await tgSend(token, uid, "⏳ <b>Daily Bonus already claimed today!</b>", kb);
        } else {
          const dBon = Number(cfg.dailyBonus || 2);
          p.lastBonus = today;
          p.balance = Number((Number(p.balance || 0) + dBon).toFixed(2));
          await tgSend(token, uid, `🎁 <b>DAILY BONUS CLAIMED: +₹${dBon.toFixed(2)}!</b>`, kb);
        }
      } else if (text.includes("Refer")) {
        const link = `https://t.me/${cfg.username}?start=ref_${uid}`;
        await tgSend(token, uid, `👥 <b>REFER & EARN</b>\n🔗 Your Invite Link:\n<code>${link}</code>`, kb);
      } else {
        await tgSend(token, uid, `✅ <b>Command Received!</b> Balance: <code>₹${Number(p.balance || 0).toFixed(2)}</code>`, kb);
      }
    }

    // Save updated player back to Firebase
    await fetch(`${FIREBASE_DB_URL}/kumar_cloud/bots/${botId}/playersMap/${uid}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p)
    });
  } catch (err) {}

  return res.status(200).send("OK");
}

async function tgSend(token, chatId, text, replyMarkup) {
  let url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${encodeURIComponent(chatId)}&text=${encodeURIComponent(text)}&parse_mode=HTML`;
  if (replyMarkup) url += `&reply_markup=${encodeURIComponent(JSON.stringify(replyMarkup))}`;
  await fetch(url);
}
