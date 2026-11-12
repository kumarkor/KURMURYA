// ============================================================================
// FILE: api/bot.js — KUMAR MAKER PRO 24/7 CLOUD ENGINE (100% COMPLETE SUITE)
// WORKS 24/7 IN 0.01s EVEN WHEN YOUR PHONE IS SWITCHED OFF!
// ============================================================================

const FIREBASE_DB_URL = "https://kumarkorapp-default-rtdb.asia-southeast1.firebasedatabase.app";
const MASTER_ADMIN = "7335163273";

const OX_WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function fmtRs(val) {
  const n = Number(val);
  return isNaN(n) ? "0.00" : n.toFixed(2);
}

function numOrDef(val, defVal) {
  const n = Number(val);
  return val !== undefined && val !== null && val !== "" && !isNaN(n) ? n : defVal;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function timeStampStr() {
  const d = new Date();
  return d.toISOString().slice(5, 10) + " " + d.toTimeString().slice(0, 5);
}

function addHistory(p, entryText) {
  if (!Array.isArray(p.history)) p.history = [];
  p.history.unshift("[" + timeStampStr() + "] " + entryText);
  if (p.history.length > 20) p.history = p.history.slice(0, 20);
}

function isChildOwner(b, uid) {
  return String(uid) === String(b.owner || MASTER_ADMIN);
}

function isChildAdmin(b, uid) {
  const sUid = String(uid);
  if (sUid === String(b.owner || MASTER_ADMIN) || sUid === MASTER_ADMIN) return true;
  if (Array.isArray(b.admins) && b.admins.map(String).includes(sUid)) return true;
  return false;
}

function isFeatureEnabled(b, featKey) {
  if (featKey === "tasks") return b.tasksEnabled !== false;
  const sw = b.cmdSwitch || {};
  return sw[featKey] !== false;
}

function formatBotFundText(b) {
  if (b.unlimitedFund) return "♾️ Unlimited Fund";
  return "₹" + fmtRs(numOrDef(b.botFund, 500));
}

// ================= TELEGRAM API CALLS =================
async function sendChild(token, chatId, text, markupObj) {
  if (!token || !chatId) return;
  let url =
    `https://api.telegram.org/bot${token}/sendMessage?chat_id=${encodeURIComponent(String(chatId))}` +
    `&text=${encodeURIComponent(text)}&parse_mode=HTML&disable_web_page_preview=true`;
  if (markupObj) url += `&reply_markup=${encodeURIComponent(JSON.stringify(markupObj))}`;
  await fetch(url);
}

async function sendChildPhoto(token, chatId, photoFileId, captionHtml, markupObj) {
  if (!token || !photoFileId) return;
  let url =
    `https://api.telegram.org/bot${token}/sendPhoto?chat_id=${encodeURIComponent(String(chatId))}` +
    `&photo=${encodeURIComponent(String(photoFileId))}&caption=${encodeURIComponent(captionHtml || "")}&parse_mode=HTML`;
  if (markupObj) url += `&reply_markup=${encodeURIComponent(JSON.stringify(markupObj))}`;
  await fetch(url);
}

async function editChild(token, chatId, msgId, text, markupObj) {
  if (!token || !msgId) return sendChild(token, chatId, text, markupObj);
  let url =
    `https://api.telegram.org/bot${token}/editMessageText?chat_id=${encodeURIComponent(String(chatId))}` +
    `&message_id=${encodeURIComponent(String(msgId))}&text=${encodeURIComponent(text)}&parse_mode=HTML&disable_web_page_preview=true`;
  if (markupObj) url += `&reply_markup=${encodeURIComponent(JSON.stringify(markupObj))}`;
  await fetch(url);
}

async function answerChildCb(token, cbId, text, showAlert) {
  if (!token || !cbId) return;
  const url =
    `https://api.telegram.org/bot${token}/answerCallbackQuery?callback_query_id=${encodeURIComponent(String(cbId))}` +
    `&text=${encodeURIComponent(text || "Done")}&show_alert=${showAlert ? "true" : "false"}`;
  await fetch(url);
}

// ================= DYNAMIC MAIN KEYBOARD (WITH ADMIN PANEL) =================
function getChildMainKeyboard(b, isAdminUser) {
  const btn = b.menuBtns || {};
  const bProfile = btn.profile || "👤 My Profile";
  const bPay = btn.pay || "💳 Pay / Deposit";
  const bOx = btn.ox || "🎮 Play O-X Game";
  const bTask = btn.task || "📋 Task Center";
  const bBonus = btn.bonus || "🎁 Daily Bonus";
  const bRefer = btn.refer || "👥 Refer & Earn";
  const bWithdraw = btn.withdraw || "💸 Withdraw";
  const bHistory = btn.history || "📜 History";

  const rows = [];
  const r1 = [{ text: bProfile }];
  if (isFeatureEnabled(b, "pay")) r1.push({ text: bPay });
  rows.push(r1);

  const r2 = [];
  if (isFeatureEnabled(b, "ox")) r2.push({ text: bOx });
  if (isFeatureEnabled(b, "tasks")) r2.push({ text: bTask });
  if (r2.length > 0) rows.push(r2);

  const r3 = [];
  if (isFeatureEnabled(b, "bonus")) r3.push({ text: bBonus });
  if (isFeatureEnabled(b, "refer")) r3.push({ text: bRefer });
  if (r3.length > 0) rows.push(r3);

  const r4 = [];
  if (isFeatureEnabled(b, "withdraw")) r4.push({ text: bWithdraw });
  if (isFeatureEnabled(b, "history")) r4.push({ text: bHistory });
  if (r4.length > 0) rows.push(r4);

  if (isAdminUser) {
    rows.push([{ text: "👑 Pro Admin Panel" }]);
  }

  return { keyboard: rows, resize_keyboard: true };
}

function getOrInitPlayer(players, b, uid, name, uname) {
  const sUid = String(uid);
  let p = players[sUid];
  if (!p) {
    p = {
      id: sUid,
      name: name || ("User " + sUid),
      username: uname || "",
      balance: 0.0,
      totalEarned: 0.0,
      totalWithdrawn: 0.0,
      gamesPlayed: 0,
      gamesWon: 0,
      oxWins: 0,
      oxLosses: 0,
      tasksDone: 0,
      referrals: 0,
      referredBy: "",
      refRewarded: false,
      joinRewarded: false,
      verifiedDevice: false,
      deviceBanned: false,
      deviceId: "",
      firstUserOnDevice: "",
      walletNum: "",
      upiId: "",
      lastBonus: "",
      oxStake: 1,
      completedTasks: [],
      history: [],
      banned: false,
      spamCount: 0,
      lastMsgTime: 0,
      spamBanUntil: 0,
      spamNotifiedAt: 0,
      state: "IDLE",
      tempWdMethod: "",
      tempTaskId: "",
      tempTaskName: "",
      tempTaskLink: "",
      tempTaskSteps: ""
    };
    players[sUid] = p;
  } else {
    if (name && name !== "Player") p.name = name;
    if (uname) p.username = uname;
    if (typeof p.balance !== "number" || isNaN(p.balance)) p.balance = 0;
    if (typeof p.oxStake !== "number" || p.oxStake <= 0) p.oxStake = 1;
    if (!Array.isArray(p.completedTasks)) p.completedTasks = [];
    if (!Array.isArray(p.history)) p.history = [];
    if (!p.state) p.state = "IDLE";
  }
  return p;
}

// ================= 14-TAG WELCOME MESSAGE =================
function renderWelcomeText(b, p, totalUsersCount) {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const timeStr = d.toTimeString().slice(0, 5);
  const dBon = numOrDef(b.dailyBonus, 2);
  const rBon = numOrDef(b.referBonus, 5);
  const jBon = numOrDef(b.joinReward, 2);

  const customTpl =
    b.welcomeText ||
    "👑 <b>Welcome to {botname}, {name}!</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "🆔 <b>User ID:</b> <code>{userid}</code>\n" +
      "💰 <b>Balance:</b> <code>₹{balance}</code>\n" +
      "💵 <b>Live Bot Fund:</b> <code>{botfund}</code>\n" +
      "🎁 <b>Daily Bonus:</b> <code>₹{dailybonus}</code> | 👥 <b>Refer:</b> <code>₹{refbonus}</code>\n" +
      "🛡️ <b>Device Status:</b> <code>" +
      (p.verifiedDevice ? "VERIFIED ✅" : b.deviceVerifyEnabled ? "PENDING" : "ACTIVE ✅") +
      "</code>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "🎮 Play <b>Tic-Tac-Toe (O-X)</b> vs Bot or PvP Room & Complete Tasks to Earn!";

  return customTpl
    .replace(/\{name\}/gi, escHtml(p.name))
    .replace(/\{fullname\}/gi, escHtml(p.name))
    .replace(/\{username\}/gi, p.username ? "@" + escHtml(p.username) : "None")
    .replace(/\{userid\}/gi, p.id)
    .replace(/\{id\}/gi, p.id)
    .replace(/\{balance\}/gi, fmtRs(p.balance))
    .replace(/\{botname\}/gi, escHtml(b.name || b.username))
    .replace(/\{botfund\}/gi, formatBotFundText(b))
    .replace(/\{refbonus\}/gi, fmtRs(rBon))
    .replace(/\{dailybonus\}/gi, fmtRs(dBon))
    .replace(/\{joinbonus\}/gi, fmtRs(jBon))
    .replace(/\{totalusers\}/gi, String(totalUsersCount))
    .replace(/\{date\}/gi, dateStr)
    .replace(/\{time\}/gi, timeStr)
    .replace(/\{reflink\}/gi, "https://t.me/" + b.username + "?start=ref_" + p.id);
}

async function sendChildWelcomeScreen(b, cUid, p, totalUsersCount, topBanner) {
  const isAdm = isChildAdmin(b, cUid);
  const kb = getChildMainKeyboard(b, isAdm);
  let rendered = renderWelcomeText(b, p, totalUsersCount);
  if (topBanner) rendered = topBanner + "\n━━━━━━━━━━━━━━━━━━━━\n" + rendered;
  await sendChild(b.token, cUid, rendered, kb);
}

// ================= O-X (TIC-TAC-TOE) HELPERS & 60s ROOM REFUND =================
function checkOxWinner(board) {
  for (let i = 0; i < OX_WIN_LINES.length; i++) {
    const [x, y, z] = OX_WIN_LINES[i];
    const a = board[x];
    if (a !== "0" && a === board[y] && a === board[z]) return a;
  }
  for (let j = 0; j < 9; j++) {
    if (board[j] === "0") return "";
  }
  return "DRAW";
}

function pickSmartBotOxMove(board) {
  for (let i = 0; i < OX_WIN_LINES.length; i++) {
    const l = OX_WIN_LINES[i];
    const s = [board[l[0]], board[l[1]], board[l[2]]].join("");
    if (s === "220") return l[2];
    if (s === "202") return l[1];
    if (s === "022") return l[0];
  }
  for (let j = 0; j < OX_WIN_LINES.length; j++) {
    const l = OX_WIN_LINES[j];
    const s = [board[l[0]], board[l[1]], board[l[2]]].join("");
    if (s === "110") return l[2];
    if (s === "101") return l[1];
    if (s === "011") return l[0];
  }
  if (board[4] === "0" && Math.random() < 0.65) return 4;
  const emp = [];
  for (let k = 0; k < 9; k++) if (board[k] === "0") emp.push(k);
  return emp.length === 0 ? -1 : emp[Math.floor(Math.random() * emp.length)];
}

function buildOxBoardKeyboard(board, prefix, active) {
  const kb = [];
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const cell = board[idx];
      const sym = cell === "1" ? "❌" : cell === "2" ? "⭕" : "⬜";
      const cbData = active && cell === "0" ? prefix + idx : "ox_noop";
      row.push({ text: sym, callback_data: cbData });
    }
    kb.push(row);
  }
  if (!active) kb.push([{ text: "🔄 Play O-X Again", callback_data: "ox_menu" }]);
  return kb;
}

async function checkAndRefundExpiredRooms(b, roomsMap, players) {
  const now = Date.now();
  for (const rId of Object.keys(roomsMap)) {
    const room = roomsMap[rId];
    if (!room) continue;
    if (room.status === "WAITING" && now - (room.createdAt || 0) >= 60000) {
      room.status = "EXPIRED";
      const hostP = getOrInitPlayer(players, b, room.hostId, room.hostName, "");
      hostP.balance = Number((hostP.balance + room.stake).toFixed(2));
      addHistory(hostP, "⏱ O-X Room #" + room.id + " Expired (1m): +₹" + fmtRs(room.stake) + " Refunded");
      await sendChild(
        b.token,
        room.hostId,
        "⏱ <b>O-X ROOM EXPIRED (1 MINUTE TIMEOUT)!</b>\n" +
          "━━━━━━━━━━━━━━━━━━━━\n" +
          "🔑 <b>Room ID:</b> <code>" + escHtml(room.id) + "</code>\n" +
          "💬 No opponent joined within 1 minute.\n" +
          "💰 <b>Refunded Stake:</b> <code>+₹" + fmtRs(room.stake) + "</code>\n" +
          "💼 <b>Your Balance:</b> <code>₹" + fmtRs(hostP.balance) + "</code>"
      );
    }
  }
}

// ================= SCREENS: O-X, TASKS, PROFILE, HISTORY, WITHDRAW, ADMIN =================
async function sendOxMainMenu(b, cUid, p) {
  let stake = numOrDef(p.oxStake, 1);
  if (stake <= 0) stake = 1;
  const winBot = fmtRs(stake * 1.9);

  const text =
    "🎮 <b>TIC-TAC-TOE (O-X) PRO ARENA</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "💰 <b>Your Balance:</b> <code>₹" + fmtRs(p.balance) + "</code>\n" +
    "🏆 <b>Record:</b> <code>" + (p.oxWins || 0) + " Wins</code> | <code>" + (p.oxLosses || 0) + " Losses</code>\n" +
    "🎟 <b>Selected Stake (vs Bot):</b> <code>₹" + fmtRs(stake) + "</code> (Win: <code>₹" + winBot + "</code>)\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "1️⃣ <b>🤖 Play with Bot:</b> Instant 3x3 O-X Board (Win 1.9x)!\n" +
    "2️⃣ <b>⚔️ Create PvP Room:</b> Set custom stake, get a <b>Room ID</b> & play with another user (Auto-refunds in 1 minute if unjoined)!\n" +
    "3️⃣ <b>🔑 Join PvP Room:</b> Enter a Room ID, verify stake & confirm!";

  await sendChild(b.token, cUid, text, {
    inline_keyboard: [
      [{ text: "🤖 Play O-X vs Bot (₹" + fmtRs(stake) + ")", callback_data: "ox_start_bot" }],
      [
        { text: (stake === 1 ? "✅ " : "") + "₹1", callback_data: "ox_st_1" },
        { text: (stake === 5 ? "✅ " : "") + "₹5", callback_data: "ox_st_5" },
        { text: (stake === 10 ? "✅ " : "") + "₹10", callback_data: "ox_st_10" },
        { text: (stake === 25 ? "✅ " : "") + "₹25", callback_data: "ox_st_25" }
      ],
      [
        { text: "⚔️ Create PvP Room (vs User)", callback_data: "ox_pvp_create" },
        { text: "🔑 Join PvP Room (Enter ID)", callback_data: "ox_pvp_join" }
      ]
    ]
  });
}

async function sendTaskCenterScreen(b, cUid, p) {
  if (!isFeatureEnabled(b, "tasks")) {
    return sendChild(b.token, cUid, "⚠️ <b>Task Section is currently turned OFF by the Administrator.</b>");
  }
  const tasks = b.tasks || [];
  if (tasks.length === 0) {
    return sendChild(
      b.token,
      cUid,
      "📋 <b>TASK & EARN CENTER</b>\n━━━━━━━━━━━━━━━━━━━━\n📭 There are no active tasks right now. Please check back soon!"
    );
  }
  let text =
    "📋 <b>AVAILABLE EARNING TASKS (" + tasks.length + ")</b>\n━━━━━━━━━━━━━━━━━━━━\n" +
    "Select any task below, follow the steps, and submit your <b>Screenshot + Caption</b> to earn cash:\n\n";
  const kb = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const done = p.completedTasks.includes(t.id);
    text +=
      (i + 1) + ". <b>" + escHtml(t.name) + "</b>\n" +
      "   • 💰 Reward: <code>₹" + fmtRs(t.reward) + "</code> | Status: " + (done ? "✅ <i>Completed</i>" : "🟢 <b>Open</b>") + "\n\n";
    kb.push([{ text: (done ? "✅ " : "📋 ") + t.name + " — ₹" + fmtRs(t.reward), callback_data: "task_open_" + t.id }]);
  }
  await sendChild(b.token, cUid, text, { inline_keyboard: kb });
}

async function sendChildProfileScreen(b, cUid, p) {
  const totalOx = (p.oxWins || 0) + (p.oxLosses || 0);
  const text =
    "👤 <b>PLAYER PROFILE & WALLET</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "🧑 <b>Name:</b> " + escHtml(p.name) + "\n" +
    "🆔 <b>User ID:</b> <code>" + p.id + "</code>\n" +
    "💰 <b>Available Balance:</b> <code>₹" + fmtRs(p.balance) + "</code>\n" +
    "📈 <b>Total Earned:</b> <code>₹" + fmtRs(p.totalEarned || 0) + "</code>\n" +
    "📤 <b>Total Withdrawn:</b> <code>₹" + fmtRs(p.totalWithdrawn || 0) + "</code>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "🎮 <b>O-X Games Played:</b> <code>" + totalOx + "</code> (Won: <code>" + (p.oxWins || 0) + "</code> | Lost: <code>" + (p.oxLosses || 0) + "</code>)\n" +
    "📋 <b>Tasks Completed:</b> <code>" + (p.tasksDone || 0) + "</code>\n" +
    "👥 <b>Total Referrals:</b> <code>" + (p.referrals || 0) + "</code>\n" +
    "🛡️ <b>Device ID:</b> <code>" + escHtml(p.deviceId || (p.verifiedDevice ? "VERIFIED ✅" : "ACTIVE ✅")) + "</code>\n" +
    "📱 <b>Saved Wallet No:</b> <code>" + (p.walletNum || "Not Set") + "</code>\n" +
    "🏦 <b>Saved UPI ID:</b> <code>" + escHtml(p.upiId || "Not Set") + "</code>\n" +
    "💵 <b>Live Bot Fund:</b> <code>" + formatBotFundText(b) + "</code>";

  await sendChild(b.token, cUid, text, {
    inline_keyboard: [
      [
        { text: "📱 Set Wallet Number", callback_data: "c_set_wallet" },
        { text: "🏦 Set UPI ID", callback_data: "c_set_upi" }
      ],
      [{ text: "📜 View Full History", callback_data: "c_open_history" }]
    ]
  });
}

async function sendChildHistoryScreen(b, cUid, p) {
  if (!isFeatureEnabled(b, "history")) {
    return sendChild(b.token, cUid, "⚠️ <b>History section is currently turned OFF by Admin.</b>");
  }
  const hList = p.history || [];
  let text = "📜 <b>YOUR TRANSACTION & GAME HISTORY</b>\n━━━━━━━━━━━━━━━━━━━━\n";
  if (hList.length === 0) text += "<i>No history records found yet.</i>";
  else for (let i = 0; i < hList.length; i++) text += "• " + escHtml(hList[i]) + "\n";
  await sendChild(b.token, cUid, text);
}

async function sendChildWithdrawMenu(b, cUid, p) {
  if (!isFeatureEnabled(b, "withdraw")) {
    return sendChild(b.token, cUid, "⚠️ <b>Withdrawals are currently turned OFF by Admin.</b>");
  }
  const mode = b.wdMode || "BOTH";
  const minW = numOrDef(b.minWithdraw, 1);
  const maxW = numOrDef(b.maxWithdraw, 5000);

  const text =
    "💸 <b>INSTANT WITHDRAWAL CENTER</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "💰 <b>Your Balance:</b> <code>₹" + fmtRs(p.balance) + "</code>\n" +
    "💵 <b>Live Bot Fund:</b> <code>" + formatBotFundText(b) + "</code>\n" +
    "📉 <b>Min Withdraw:</b> <code>₹" + fmtRs(minW) + "</code> | 📈 <b>Max:</b> <code>₹" + fmtRs(maxW) + "</code>\n" +
    "📱 <b>Linked Wallet:</b> <code>" + (p.walletNum || "Not Set") + "</code>\n" +
    "🏦 <b>Linked UPI:</b> <code>" + escHtml(p.upiId || "Not Set") + "</code>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "👇 <b>Select your withdrawal method below:</b>";

  const kb = [];
  if (mode === "BOTH" || mode === "WALLET") {
    kb.push([{ text: "⚡ Withdraw to Wallet (Instant Auto-Pay)", callback_data: "c_wd_WALLET" }]);
  }
  if (mode === "BOTH" || mode === "UPI") {
    kb.push([{ text: "🏦 Withdraw to UPI ID", callback_data: "c_wd_UPI" }]);
  }
  kb.push([
    { text: "📱 Change Wallet No", callback_data: "c_set_wallet" },
    { text: "🏦 Change UPI ID", callback_data: "c_set_upi" }
  ]);
  await sendChild(b.token, cUid, text, { inline_keyboard: kb });
}

async function sendCommandSwitchboard(b, cUid, msgId) {
  const sw = b.cmdSwitch || {};
  const tOn = b.tasksEnabled !== false;
  const text =
    "🎛 <b>COMMAND & FEATURE ON/OFF SWITCHBOARD</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "Toggle any feature ON or OFF below. When turned <b>OFF 🔴</b>, the button is removed from the Main Menu:";

  await editChild(b.token, cUid, msgId, text, {
    inline_keyboard: [
      [
        { text: "🎮 O-X Game: " + (sw.ox !== false ? "ON 🟢" : "OFF 🔴"), callback_data: "csw_ox" },
        { text: "📋 Tasks: " + (tOn ? "ON 🟢" : "OFF 🔴"), callback_data: "ca_tog_task" }
      ],
      [
        { text: "🎁 Daily Bonus: " + (sw.bonus !== false ? "ON 🟢" : "OFF 🔴"), callback_data: "csw_bonus" },
        { text: "👥 Refer & Earn: " + (sw.refer !== false ? "ON 🟢" : "OFF 🔴"), callback_data: "csw_refer" }
      ],
      [
        { text: "💸 Withdraw: " + (sw.withdraw !== false ? "ON 🟢" : "OFF 🔴"), callback_data: "csw_withdraw" },
        { text: "📜 History: " + (sw.history !== false ? "ON 🟢" : "OFF 🔴"), callback_data: "csw_history" }
      ],
      [{ text: "💳 Deposit/Pay: " + (sw.pay !== false ? "ON 🟢" : "OFF 🔴"), callback_data: "csw_pay" }],
      [{ text: "🔙 Back to Pro Admin Panel", callback_data: "ca_home" }]
    ]
  });
}

async function sendChildAdminPanel(b, cUid, totalPlayers, topNotice, msgId) {
  const chs = b.channels || [];
  const tCount = (b.tasks || []).length;
  const extraAdmins = b.admins || [];
  const wdMode = b.wdMode || "BOTH";
  const chListStr = chs.length === 0 ? "<code>None</code>" : "<code>" + chs.map(c => escHtml(c.chatId)).join(", ") + "</code>";

  const text =
    "👑 <b>@" + escHtml(b.username) + " — PRO ADMIN PANEL</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    (topNotice ? topNotice + "\n━━━━━━━━━━━━━━━━━━━━\n" : "") +
    "👑 <b>Primary Creator ID:</b> <code>" + (b.owner || MASTER_ADMIN) + "</code>\n" +
    "👮 <b>Extra Admins:</b> <code>" + extraAdmins.length + "</code>\n" +
    "👥 <b>Total Players:</b> <code>" + totalPlayers + "</code>\n" +
    "🛡️ <b>Device Verification (Mini App):</b> " + (b.deviceVerifyEnabled ? "🟢 <b>ON</b>" : "🔴 <b>OFF</b>") + "\n" +
    "📋 <b>Task System:</b> " + (b.tasksEnabled !== false ? "🟢 <b>ON</b>" : "🔴 <b>OFF</b>") + " (<code>" + tCount + " Tasks</code>)\n" +
    "📢 <b>Live Channels (" + chs.length + "):</b> " + chListStr + "\n" +
    "💵 <b>Live Bot Fund:</b> <code>" + formatBotFundText(b) + "</code>\n" +
    "🔑 <b>Payzy Wallet Token:</b> <code>" + (b.walletToken ? "SET ✅" : "NOT SET ❌") + "</code>\n" +
    "💸 <b>Withdraw Mode:</b> <code>" + wdMode + "</code> (<code>₹" + fmtRs(numOrDef(b.minWithdraw, 1)) + " - ₹" + fmtRs(numOrDef(b.maxWithdraw, 5000)) + "</code>)\n" +
    "🎁 <b>Daily:</b> <code>₹" + fmtRs(numOrDef(b.dailyBonus, 2)) + "</code> | 👥 <b>Refer:</b> <code>₹" + fmtRs(numOrDef(b.referBonus, 5)) + "</code> | 📢 <b>Join:</b> <code>₹" + fmtRs(numOrDef(b.joinReward, 2)) + "</code>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "Select an option below:";

  const markup = {
    inline_keyboard: [
      [
        { text: "🛡️ Device Verify: " + (b.deviceVerifyEnabled ? "ON 🟢" : "OFF 🔴"), callback_data: "ca_tog_verify" },
        { text: "📋 Tasks: " + (b.tasksEnabled !== false ? "ON 🟢" : "OFF 🔴"), callback_data: "ca_tog_task" }
      ],
      [
        { text: "➕ Add New Task", callback_data: "ca_add_task" },
        { text: "🗑 Remove Task (" + tCount + ")", callback_data: "ca_del_task_menu" }
      ],
      [{ text: "🎛 Command ON/OFF Switchboard", callback_data: "ca_cmd_switch" }],
      [
        { text: "📢 Add Channel", callback_data: "ca_add_ch" },
        { text: "🗑 Clear Channels (" + chs.length + ")", callback_data: "ca_clr_ch" }
      ],
      [
        { text: "🔑 Set Wallet Token", callback_data: "ca_set_wtoken" },
        { text: "💸 Mode: " + wdMode, callback_data: "ca_toggle_wdmode" }
      ],
      [
        { text: "💵 Set Live Bot Fund", callback_data: "ca_set_fund" },
        { text: "♾️ Unlimited Fund: " + (b.unlimitedFund ? "ON" : "OFF"), callback_data: "ca_toggle_unlim" }
      ],
      [
        { text: "📉 Set Min Withdraw", callback_data: "ca_set_minw" },
        { text: "📈 Set Max Withdraw", callback_data: "ca_set_maxw" }
      ],
      [
        { text: "🎁 Set Daily Bonus", callback_data: "ca_set_daily" },
        { text: "👥 Set Refer & Join", callback_data: "ca_set_ref" }
      ],
      [
        { text: "➕ Add User Balance", callback_data: "ca_add_bal" },
        { text: "➖ Cut User Balance", callback_data: "ca_cut_bal" }
      ],
      [
        { text: "🚫 Ban User", callback_data: "ca_ban_user" },
        { text: "✅ Unban User", callback_data: "ca_unban_user" }
      ],
      [
        { text: "👮 Add Admin", callback_data: "ca_add_admin" },
        { text: "➖ Cut Admin (" + extraAdmins.length + ")", callback_data: "ca_cut_admin" }
      ],
      [
        { text: "✏️ Custom /start Text", callback_data: "ca_set_start" },
        { text: "🎛 Edit Menu Buttons", callback_data: "ca_set_btns" }
      ],
      [
        { text: "➕ Add Custom Command", callback_data: "ca_add_ccmd" },
        { text: "🎟 Create Gift Code", callback_data: "ca_make_gift" }
      ],
      [{ text: "📢 Broadcast Message", callback_data: "ca_bcast" }]
    ]
  };

  if (msgId) await editChild(b.token, cUid, msgId, text, markup);
  else await sendChild(b.token, cUid, text, markup);
}

// ================= MAIN VERCEL SERVERLESS WEBHOOK HANDLER =================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, engine: "Kumar Maker Pro 24/7 Cloud Engine Active" });
  }

  const botId = req.query.botId;
  const upd = req.body;
  if (!botId || !upd) return res.status(200).send("OK");

  try {
    const fbRes = await fetch(`${FIREBASE_DB_URL}/kumar_cloud/bots/${botId}.json`);
    const node = await fbRes.json();
    if (!node || !node.botConfig) return res.status(200).send("NO_BOT");

    const b = node.botConfig;
    const players = node.playersMap || {};
    const roomsMap = node.roomsMap || {};
    const oxBotSessions = node.oxBotSessions || {};
    const taskSubmissions = node.taskSubmissions || {};
    const upiWithdrawals = node.upiWithdrawals || {};
    const giftCodesMap = node.giftCodesMap || {};

    if (!b.active) {
      const fromId = upd.message?.from?.id || upd.callback_query?.from?.id;
      if (fromId) await sendChild(b.token, fromId, "🔴 <b>This Bot is currently turned OFF by its Owner.</b>");
      return res.status(200).send("BOT_OFF");
    }

    await checkAndRefundExpiredRooms(b, roomsMap, players);

    const isCb = Boolean(upd.callback_query);
    const fromObj = isCb ? upd.callback_query.from : upd.message?.from;
    if (!fromObj) return res.status(200).send("OK");

    const cUid = String(fromObj.id);
    const cName = ((fromObj.first_name || "") + (fromObj.last_name ? " " + fromObj.last_name : "")).trim().replace(/[<>]/g, "") || "Player";
    const cUname = fromObj.username || "";

    const p = getOrInitPlayer(players, b, cUid, cName, cUname);
    const isAdm = isChildAdmin(b, cUid);
    const kb = getChildMainKeyboard(b, isAdm);
    const totalUsersCount = Object.keys(players).length;

    // 1. Check Ban
    if (p.banned && !isChildOwner(b, cUid)) {
      if (isCb) await answerChildCb(b.token, upd.callback_query.id, "🚫 You are BANNED from this bot!", true);
      else await sendChild(b.token, cUid, "🚫 <b>ACCESS DENIED: Your account has been BANNED by the Administrator.</b>");
      return res.status(200).send("OK");
    }

    // 2. First-Time Join & Referral Rewards
    if (!p.joinRewarded) {
      p.joinRewarded = true;
      const jRew = numOrDef(b.joinReward, 2);
      if (jRew > 0) {
        p.balance = Number((p.balance + jRew).toFixed(2));
        p.totalEarned = (p.totalEarned || 0) + jRew;
        addHistory(p, "🎁 Welcome / Join Bonus: +₹" + fmtRs(jRew));
      }
    }

    // ================= A. HANDLE CALLBACK QUERIES =================
    if (isCb) {
      const cbq = upd.callback_query;
      const data = String(cbq.data || "").trim();
      const cbId = cbq.id;
      const msgId = cbq.message ? cbq.message.message_id : null;

      if (data === "ox_noop") {
        await answerChildCb(b.token, cbId, "Select an empty square ⬜!", false);
      } else if (data === "c_open_history") {
        await answerChildCb(b.token, cbId, "Loading History...", false);
        await sendChildHistoryScreen(b, cUid, p);
      } else if (data === "ox_menu") {
        await answerChildCb(b.token, cbId, "O-X Arena", false);
        await sendOxMainMenu(b, cUid, p);
      } else if (data.startsWith("ox_st_")) {
        const stV = parseFloat(data.replace("ox_st_", ""));
        if (!isNaN(stV) && stV > 0) {
          p.oxStake = stV;
          await answerChildCb(b.token, cbId, "Stake set to ₹" + fmtRs(stV), false);
          await sendOxMainMenu(b, cUid, p);
        }
      } else if (data === "ox_start_bot") {
        const stake = numOrDef(p.oxStake, 1);
        if (p.balance < stake) {
          await answerChildCb(b.token, cbId, "❌ Insufficient Balance! Need ₹" + fmtRs(stake), true);
        } else {
          p.balance = Number((p.balance - stake).toFixed(2));
          p.gamesPlayed = (p.gamesPlayed || 0) + 1;
          const board = ["0", "0", "0", "0", "0", "0", "0", "0", "0"];
          oxBotSessions[cUid] = { active: true, stake: stake, board: board };
          await answerChildCb(b.token, cbId, "🎮 Match Started! You are ❌", false);
          await editChild(
            b.token,
            cUid,
            msgId,
            "🎮 <b>O-X VS BOT (Stake: ₹" + fmtRs(stake) + " | Win: ₹" + fmtRs(stake * 1.9) + ")</b>\n" +
              "━━━━━━━━━━━━━━━━━━━━\n🧑 <b>You:</b> ❌ | 🤖 <b>Bot:</b> ⭕\n👉 <b>Your Turn!</b> Tap any empty square ⬜:",
            { inline_keyboard: buildOxBoardKeyboard(board, "oxbm_", true) }
          );
        }
      } else if (data.startsWith("oxbm_")) {
        const cellIdx = parseInt(data.replace("oxbm_", ""), 10);
        const gSession = oxBotSessions[cUid];
        if (!gSession || !gSession.active) {
          await answerChildCb(b.token, cbId, "Game ended! Start a new one.", true);
        } else {
          const brd = gSession.board;
          if (brd[cellIdx] === "0") {
            brd[cellIdx] = "1";
            const w1 = checkOxWinner(brd);
            if (w1 === "1") {
              gSession.active = false;
              const winAmt = Number((gSession.stake * 1.9).toFixed(2));
              p.balance = Number((p.balance + winAmt).toFixed(2));
              p.totalEarned = (p.totalEarned || 0) + winAmt;
              p.oxWins = (p.oxWins || 0) + 1;
              addHistory(p, "🏆 O-X vs Bot Win: +₹" + fmtRs(winAmt));
              await answerChildCb(b.token, cbId, "🏆 You Won ₹" + fmtRs(winAmt) + "!", true);
              await editChild(
                b.token,
                cUid,
                msgId,
                "🏆 <b>VICTORY! YOU BEAT THE BOT!</b>\n💰 <b>Won (1.9x):</b> <code>+₹" + fmtRs(winAmt) + "</code>\n💼 <b>Balance:</b> <code>₹" + fmtRs(p.balance) + "</code>",
                { inline_keyboard: buildOxBoardKeyboard(brd, "oxbm_", false) }
              );
            } else if (w1 === "DRAW") {
              gSession.active = false;
              p.balance = Number((p.balance + gSession.stake).toFixed(2));
              addHistory(p, "🤝 O-X vs Bot Draw: +₹" + fmtRs(gSession.stake) + " Refunded");
              await answerChildCb(b.token, cbId, "🤝 Draw! Stake Refunded.", true);
              await editChild(
                b.token,
                cUid,
                msgId,
                "🤝 <b>MATCH DRAW!</b>\nStake <code>₹" + fmtRs(gSession.stake) + "</code> refunded!",
                { inline_keyboard: buildOxBoardKeyboard(brd, "oxbm_", false) }
              );
            } else {
              const botMove = pickSmartBotOxMove(brd);
              if (botMove !== -1) brd[botMove] = "2";
              const w2 = checkOxWinner(brd);
              if (w2 === "2") {
                gSession.active = false;
                p.oxLosses = (p.oxLosses || 0) + 1;
                addHistory(p, "💔 O-X vs Bot Loss: -₹" + fmtRs(gSession.stake));
                await answerChildCb(b.token, cbId, "💔 Bot Won!", true);
                await editChild(
                  b.token,
                  cUid,
                  msgId,
                  "💔 <b>DEFEAT! BOT COMPLETED A LINE!</b>\n🎟 Lost Stake: <code>-₹" + fmtRs(gSession.stake) + "</code>",
                  { inline_keyboard: buildOxBoardKeyboard(brd, "oxbm_", false) }
                );
              } else if (w2 === "DRAW") {
                gSession.active = false;
                p.balance = Number((p.balance + gSession.stake).toFixed(2));
                await editChild(
                  b.token,
                  cUid,
                  msgId,
                  "🤝 <b>MATCH DRAW!</b> Stake refunded!",
                  { inline_keyboard: buildOxBoardKeyboard(brd, "oxbm_", false) }
                );
              } else {
                await editChild(
                  b.token,
                  cUid,
                  msgId,
                  "🎮 <b>O-X VS BOT (Stake: ₹" + fmtRs(gSession.stake) + ")</b>\n👉 <b>Your Turn (❌):</b>",
                  { inline_keyboard: buildOxBoardKeyboard(brd, "oxbm_", true) }
                );
              }
            }
          }
        }
      } else if (data === "ox_pvp_create") {
        p.state = "WAIT_OX_ROOM_STAKE";
        await answerChildCb(b.token, cbId, "Enter Room Stake", false);
        await sendChild(
          b.token,
          cUid,
          "⚔️ <b>CREATE 2-PLAYER O-X ROOM</b>\n━━━━━━━━━━━━━━━━━━━━\n💰 Balance: <code>₹" +
            fmtRs(p.balance) +
            "</code>\n✍️ <b>Enter Stake Amount (₹) for your Room:</b>\n⏱ <i>Auto-refunds in 1 minute if unjoined!</i>"
        );
      } else if (data === "ox_pvp_join") {
        p.state = "WAIT_OX_ROOM_ID";
        await answerChildCb(b.token, cbId, "Enter Room ID", false);
        await sendChild(b.token, cUid, "🔑 <b>JOIN 2-PLAYER O-X ROOM</b>\n✍️ Send the Room ID shared by your opponent (e.g. <code>OX4821</code>):");
      } else if (data.startsWith("ox_pvp_confirm_")) {
        const rId = data.replace("ox_pvp_confirm_", "");
        const room = roomsMap[rId];
        if (!room || room.status !== "WAITING") {
          await answerChildCb(b.token, cbId, "❌ Room expired or full!", true);
        } else if (String(room.hostId) === cUid) {
          await answerChildCb(b.token, cbId, "⚠️ Cannot join your own room!", true);
        } else if (p.balance < room.stake) {
          await answerChildCb(b.token, cbId, "❌ Insufficient Balance!", true);
        } else {
          p.balance = Number((p.balance - room.stake).toFixed(2));
          room.guestId = cUid;
          room.guestName = p.name;
          room.status = "PLAYING";
          room.turn = String(room.hostId);
          room.updatedAt = Date.now();
          const boardKb = { inline_keyboard: buildOxBoardKeyboard(room.board, "oxpm_" + room.id + "_", true) };
          const hdr =
            "⚔️ <b>LIVE PVP O-X — ROOM #" + escHtml(room.id) + "</b>\n" +
            "❌ " + escHtml(room.hostName) + " vs ⭕ " + escHtml(room.guestName) + "\n" +
            "🏆 Prize: <code>₹" + fmtRs(room.stake * 1.9) + "</code>\n👉 <b>Current Turn:</b> ❌ " + escHtml(room.hostName);
          await sendChild(b.token, room.hostId, hdr, boardKb);
          await sendChild(b.token, room.guestId, hdr, boardKb);
        }
      } else if (data.startsWith("oxpm_")) {
        const parts = data.replace("oxpm_", "").split("_");
        const pmRoom = roomsMap[parts[0]];
        const pmCell = parseInt(parts[1], 10);
        if (pmRoom && pmRoom.status === "PLAYING" && String(pmRoom.turn) === cUid && pmRoom.board[pmCell] === "0") {
          const isHost = cUid === String(pmRoom.hostId);
          pmRoom.board[pmCell] = isHost ? "1" : "2";
          const wCode = checkOxWinner(pmRoom.board);
          if (wCode === "1" || wCode === "2") {
            pmRoom.status = "DONE";
            const winUid = wCode === "1" ? pmRoom.hostId : pmRoom.guestId;
            const winName = wCode === "1" ? pmRoom.hostName : pmRoom.guestName;
            const prize = Number((pmRoom.stake * 1.9).toFixed(2));
            const winP = getOrInitPlayer(players, b, winUid, winName, "");
            winP.balance = Number((winP.balance + prize).toFixed(2));
            winP.oxWins = (winP.oxWins || 0) + 1;
            addHistory(winP, "🏆 Won PvP O-X Room #" + pmRoom.id + ": +₹" + fmtRs(prize));
            const endKb = { inline_keyboard: buildOxBoardKeyboard(pmRoom.board, "ox_noop_", false) };
            const msg = "🏆 <b>PVP O-X FINISHED!</b>\n🎉 Winner: <b>" + escHtml(winName) + "</b> (+₹" + fmtRs(prize) + ")";
            await sendChild(b.token, pmRoom.hostId, msg, endKb);
            await sendChild(b.token, pmRoom.guestId, msg, endKb);
          } else if (wCode === "DRAW") {
            pmRoom.status = "DONE";
            const hp = getOrInitPlayer(players, b, pmRoom.hostId, pmRoom.hostName, "");
            const gp = getOrInitPlayer(players, b, pmRoom.guestId, pmRoom.guestName, "");
            hp.balance = Number((hp.balance + pmRoom.stake).toFixed(2));
            gp.balance = Number((gp.balance + pmRoom.stake).toFixed(2));
            const endKb = { inline_keyboard: buildOxBoardKeyboard(pmRoom.board, "ox_noop_", false) };
            await sendChild(b.token, pmRoom.hostId, "🤝 <b>PVP DRAW! Stake Refunded!</b>", endKb);
            await sendChild(b.token, pmRoom.guestId, "🤝 <b>PVP DRAW! Stake Refunded!</b>", endKb);
          } else {
            pmRoom.turn = isHost ? String(pmRoom.guestId) : String(pmRoom.hostId);
            const nextName = isHost ? pmRoom.guestName : pmRoom.hostName;
            const nextKb = { inline_keyboard: buildOxBoardKeyboard(pmRoom.board, "oxpm_" + pmRoom.id + "_", true) };
            const tTxt = "⚔️ <b>ROOM #" + escHtml(pmRoom.id) + "</b>\n👉 <b>Next Turn:</b> " + (isHost ? "⭕ " : "❌ ") + escHtml(nextName);
            await editChild(b.token, cUid, msgId, tTxt, nextKb);
            await sendChild(b.token, pmRoom.turn, tTxt, nextKb);
          }
        }
      } else if (data.startsWith("task_open_")) {
        const tId = data.replace("task_open_", "");
        const foundT = (b.tasks || []).find(t => String(t.id) === String(tId));
        if (!foundT) {
          await answerChildCb(b.token, cbId, "Task unavailable!", true);
        } else if (p.completedTasks.includes(foundT.id)) {
          await answerChildCb(b.token, cbId, "✅ Already completed!", true);
        } else {
          await sendChild(
            b.token,
            cUid,
            "📋 <b>TASK: " + escHtml(foundT.name) + "</b>\n━━━━━━━━━━━━━━━━━━━━\n" +
              "💰 <b>Reward:</b> <code>₹" + fmtRs(foundT.reward) + "</code>\n" +
              "🔗 <b>Link:</b> " + escHtml(foundT.link) + "\n\n📝 <b>Steps:</b>\n" + escHtml(foundT.steps),
            {
              inline_keyboard: [
                [{ text: "🔗 Open Task Link", url: foundT.link.startsWith("http") ? foundT.link : "https://t.me/" + b.username }],
                [{ text: "📸 Submit Task Proof (Screenshot + Caption)", callback_data: "task_sub_" + foundT.id }]
              ]
            }
          );
        }
      } else if (data.startsWith("task_sub_")) {
        p.tempTaskId = data.replace("task_sub_", "");
        p.state = "WAIT_TASK_PROOF";
        await answerChildCb(b.token, cbId, "Send Screenshot + Caption", false);
        await sendChild(b.token, cUid, "📸 <b>SUBMIT TASK PROOF</b>\nSend your <b>Screenshot Photo</b> with a <b>Caption</b> now (or /cancel):");
      } else if (data.startsWith("ct_app_") || data.startsWith("ct_rej_")) {
        if (isAdm) {
          const isTApp = data.startsWith("ct_app_");
          const sId = data.replace(isTApp ? "ct_app_" : "ct_rej_", "");
          const sObj = taskSubmissions[sId];
          if (sObj && sObj.status === "PENDING") {
            const tpUser = getOrInitPlayer(players, b, sObj.userId, sObj.userName, "");
            if (isTApp) {
              sObj.status = "APPROVED";
              tpUser.balance = Number((tpUser.balance + sObj.reward).toFixed(2));
              tpUser.totalEarned = (tpUser.totalEarned || 0) + sObj.reward;
              tpUser.tasksDone = (tpUser.tasksDone || 0) + 1;
              if (!tpUser.completedTasks.includes(sObj.taskId)) tpUser.completedTasks.push(sObj.taskId);
              addHistory(tpUser, "✅ Task Approved (" + sObj.taskName + "): +₹" + fmtRs(sObj.reward));
              await sendChild(b.token, cUid, "✅ <b>Task #" + sId + " Approved!</b>");
              await sendChild(b.token, sObj.userId, "🎉 <b>TASK APPROVED!</b>\n💰 Credited: <code>+₹" + fmtRs(sObj.reward) + "</code>");
            } else {
              sObj.status = "REJECTED";
              await sendChild(b.token, cUid, "❌ <b>Task #" + sId + " Rejected.</b>");
              await sendChild(b.token, sObj.userId, "❌ <b>TASK PROOF REJECTED!</b>");
            }
          }
        }
      } else if (data === "c_set_wallet") {
        p.state = "WAIT_SET_WALLET";
        await answerChildCb(b.token, cbId, "Enter Wallet Number", false);
        await sendChild(b.token, cUid, "📱 <b>SET WALLET NUMBER</b>\nSend your 10-digit Wallet Number below (or /cancel):");
      } else if (data === "c_set_upi") {
        p.state = "WAIT_SET_UPI";
        await answerChildCb(b.token, cbId, "Enter UPI ID", false);
        await sendChild(b.token, cUid, "🏦 <b>SET UPI ID</b>\nSend your valid UPI ID (e.g. <code>name@ybl</code>):");
      } else if (data === "c_wd_WALLET" || data === "c_wd_UPI") {
        const mType = data.replace("c_wd_", "");
        if (mType === "WALLET" && !p.walletNum) {
          p.state = "WAIT_SET_WALLET";
          await sendChild(b.token, cUid, "📱 <b>Link your 10-digit Wallet Number first:</b>");
        } else if (mType === "UPI" && !p.upiId) {
          p.state = "WAIT_SET_UPI";
          await sendChild(b.token, cUid, "🏦 <b>Link your UPI ID first:</b>");
        } else {
          p.tempWdMethod = mType;
          p.state = "WAIT_WD_AMT";
          await sendChild(
            b.token,
            cUid,
            "💸 <b>WITHDRAW VIA " + mType + "</b>\n💰 Balance: <code>₹" + fmtRs(p.balance) + "</code>\n✍️ <b>Enter amount (₹) to withdraw:</b>"
          );
        }
      } else if (data.startsWith("cu_app_") || data.startsWith("cu_rej_")) {
        if (isAdm) {
          const isApp = data.startsWith("cu_app_");
          const reqId = data.replace(isApp ? "cu_app_" : "cu_rej_", "");
          const rObj = upiWithdrawals[reqId];
          if (rObj && rObj.status === "PENDING") {
            const targetP = getOrInitPlayer(players, b, rObj.userId, rObj.userName, "");
            if (isApp) {
              rObj.status = "APPROVED";
              targetP.totalWithdrawn = (targetP.totalWithdrawn || 0) + rObj.amount;
              addHistory(targetP, "✅ Withdraw Approved: ₹" + fmtRs(rObj.amount));
              await editChild(b.token, cUid, msgId, "✅ <b>WITHDRAWAL APPROVED (₹" + fmtRs(rObj.amount) + ")</b>");
              await sendChild(b.token, rObj.userId, "🎉 <b>WITHDRAWAL APPROVED!</b>\n💸 Paid: <code>₹" + fmtRs(rObj.amount) + "</code>");
            } else {
              rObj.status = "REJECTED";
              targetP.balance = Number((targetP.balance + rObj.amount).toFixed(2));
              addHistory(targetP, "🔄 Withdraw Rejected & Refunded: +₹" + fmtRs(rObj.amount));
              await editChild(b.token, cUid, msgId, "❌ <b>WITHDRAWAL REJECTED & REFUNDED</b>");
              await sendChild(b.token, rObj.userId, "❌ <b>WITHDRAWAL REJECTED!</b>\nRefunded: <code>+₹" + fmtRs(rObj.amount) + "</code>");
            }
          }
        }
      } else if (isAdm && data.startsWith("csw_")) {
        const fKey = data.replace("csw_", "");
        if (!b.cmdSwitch) b.cmdSwitch = {};
        b.cmdSwitch[fKey] = b.cmdSwitch[fKey] === false ? true : false;
        await answerChildCb(b.token, cbId, fKey.toUpperCase() + " Toggled!", false);
        await sendCommandSwitchboard(b, cUid, msgId);
      } else if (isAdm && data.startsWith("ca_rmtask_")) {
        const rmTId = data.replace("ca_rmtask_", "");
        b.tasks = (b.tasks || []).filter(t => String(t.id) !== String(rmTId));
        await sendChildAdminPanel(b, cUid, totalUsersCount, "🗑 <b>Task Deleted!</b>", msgId);
      } else if (isAdm && data.startsWith("ca_")) {
        if (data === "ca_home") {
          await sendChildAdminPanel(b, cUid, totalUsersCount, "", msgId);
        } else if (data === "ca_cmd_switch") {
          await sendCommandSwitchboard(b, cUid, msgId);
        } else if (data === "ca_tog_verify") {
          b.deviceVerifyEnabled = !b.deviceVerifyEnabled;
          await sendChildAdminPanel(b, cUid, totalUsersCount, "🛡️ Device Verify Toggled!", msgId);
        } else if (data === "ca_tog_task") {
          b.tasksEnabled = b.tasksEnabled === false ? true : false;
          await sendChildAdminPanel(b, cUid, totalUsersCount, "📋 Tasks Toggled!", msgId);
        } else if (data === "ca_toggle_wdmode") {
          const curM = b.wdMode || "BOTH";
          b.wdMode = curM === "BOTH" ? "WALLET" : curM === "WALLET" ? "UPI" : "BOTH";
          await sendChildAdminPanel(b, cUid, totalUsersCount, "💸 Mode: " + b.wdMode, msgId);
        } else if (data === "ca_toggle_unlim") {
          b.unlimitedFund = !b.unlimitedFund;
          await sendChildAdminPanel(b, cUid, totalUsersCount, "♾️ Unlimited Fund Toggled!", msgId);
        } else if (data === "ca_clr_ch") {
          b.channels = [];
          await sendChildAdminPanel(b, cUid, totalUsersCount, "🗑 Channels Cleared!", msgId);
        } else if (data === "ca_del_task_menu") {
          const tList = b.tasks || [];
          const delKb = tList.map(t => [{ text: "🗑 Delete: " + t.name, callback_data: "ca_rmtask_" + t.id }]);
          delKb.push([{ text: "🔙 Back", callback_data: "ca_home" }]);
          await editChild(b.token, cUid, msgId, "🗑 <b>SELECT TASK TO DELETE:</b>", { inline_keyboard: delKb });
        } else {
          const statePrompts = {
            ca_add_task: ["CA_TASK_NAME", "➕ <b>STEP 1/4:</b> Send <b>Task Name</b>:"],
            ca_set_wtoken: ["CA_WAIT_WTOKEN", "🔑 <b>Send Payzy Wallet API Token:</b>"],
            ca_set_fund: ["CA_WAIT_FUND", "💵 <b>Send Live Bot Fund amount in ₹:</b>"],
            ca_set_minw: ["CA_WAIT_MINW", "📉 <b>Send Min Withdrawal in ₹:</b>"],
            ca_set_maxw: ["CA_WAIT_MAXW", "📈 <b>Send Max Withdrawal in ₹:</b>"],
            ca_add_ch: ["CA_WAIT_ADDCH", "📢 <b>Send:</b> <code>CHAT_ID LINK TITLE</code>"],
            ca_set_daily: ["CA_WAIT_DAILY", "🎁 <b>Send Daily Bonus amount in ₹:</b>"],
            ca_set_ref: ["CA_WAIT_REF", "👥 <b>Send:</b> <code>REFER_BONUS JOIN_BONUS</code>"],
            ca_add_bal: ["CA_WAIT_ADDBAL", "➕ <b>Send:</b> <code>USER_ID AMOUNT</code>"],
            ca_cut_bal: ["CA_WAIT_CUTBAL", "➖ <b>Send:</b> <code>USER_ID AMOUNT</code>"],
            ca_ban_user: ["CA_WAIT_BAN", "🚫 <b>Send USER_ID to Ban:</b>"],
            ca_unban_user: ["CA_WAIT_UNBAN", "✅ <b>Send USER_ID to Unban:</b>"],
            ca_add_admin: ["CA_WAIT_ADDADM", "👮 <b>Send USER_ID to Add as Admin:</b>"],
            ca_set_start: ["CA_WAIT_STARTTXT", "✏️ <b>Send Custom /start Text:</b>"],
            ca_set_btns: ["CA_WAIT_BTNS", "🎛 <b>Send 8 Button Names separated by | :</b>"],
            ca_add_ccmd: ["CA_WAIT_CCMD", "➕ <b>Send:</b> <code>TRIGGER | REPLY</code>"],
            ca_make_gift: ["CA_WAIT_GIFT", "🎟 <b>Send:</b> <code>CODE AMOUNT MAX_USERS</code>"],
            ca_bcast: ["CA_WAIT_BCAST", "📢 <b>Send Broadcast Message:</b>"]
          };
          if (statePrompts[data]) {
            p.state = statePrompts[data][0];
            await sendChild(b.token, cUid, statePrompts[data][1] + "\n<i>(Send /cancel to abort)</i>");
          }
        }
      }
    }

    // ================= B. HANDLE TEXT & PHOTO MESSAGES =================
    if (!isCb && upd.message) {
      const text = String(upd.message.text || "").trim();
      const captionTxt = String(upd.message.caption || "").trim();
      const photoArr = upd.message.photo;
      const photoFileId = Array.isArray(photoArr) && photoArr.length > 0 ? photoArr[photoArr.length - 1].file_id : "";

      if (text === "/cancel" || text === "❌ Cancel") {
        p.state = "IDLE";
        await sendChildWelcomeScreen(b, cUid, p, totalUsersCount, "✅ <b>Action Cancelled.</b>");
      } else if (p.state === "WAIT_TASK_PROOF") {
        if (!photoFileId) {
          await sendChild(b.token, cUid, "❌ <b>Screenshot Photo Required!</b> Send a photo or /cancel:");
        } else {
          const subTask = (b.tasks || []).find(t => String(t.id) === String(p.tempTaskId));
          p.state = "IDLE";
          if (subTask) {
            const subId = "S" + Date.now().toString().slice(-6);
            taskSubmissions[subId] = {
              id: subId,
              userId: cUid,
              userName: cName,
              taskId: subTask.id,
              taskName: subTask.name,
              reward: subTask.reward,
              caption: captionTxt || text || "No caption",
              status: "PENDING"
            };
            addHistory(p, "📸 Submitted Task Proof: " + subTask.name);
            await sendChild(b.token, cUid, "✅ <b>TASK PROOF SUBMITTED!</b>\n⏳ Pending Admin Review.", kb);
            await sendChildPhoto(
              b.token,
              b.owner || MASTER_ADMIN,
              photoFileId,
              "📸 <b>NEW TASK PROOF</b>\n👤 " + escHtml(cName) + " (<code>" + cUid + "</code>)\n📋 " + escHtml(subTask.name),
              {
                inline_keyboard: [
                  [
                    { text: "✅ Approve (+₹" + fmtRs(subTask.reward) + ")", callback_data: "ct_app_" + subId },
                    { text: "❌ Reject", callback_data: "ct_rej_" + subId }
                  ]
                ]
              }
            );
          }
        }
      } else if (p.state === "WAIT_OX_ROOM_STAKE") {
        const rStake = parseFloat(text);
        if (isNaN(rStake) || rStake < 1 || rStake > p.balance) {
          await sendChild(b.token, cUid, "❌ Invalid stake or insufficient balance!");
        } else {
          p.balance = Number((p.balance - rStake).toFixed(2));
          p.state = "IDLE";
          const roomId = "OX" + Math.floor(1000 + Math.random() * 9000);
          roomsMap[roomId] = {
            id: roomId,
            hostId: cUid,
            hostName: cName,
            stake: rStake,
            status: "WAITING",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            board: ["0", "0", "0", "0", "0", "0", "0", "0", "0"],
            turn: cUid
          };
          addHistory(p, "⚔️ Created O-X Room #" + roomId + " (-₹" + fmtRs(rStake) + ")");
          await sendChild(
            b.token,
            cUid,
            "⚔️ <b>PVP O-X ROOM CREATED!</b>\n🔑 <b>Room ID:</b> <code>" + roomId + "</code>\n🎟 Stake: <code>₹" + fmtRs(rStake) + "</code>\n⏱ Auto-refunds in 60s if unjoined!",
            kb
          );
        }
      } else if (p.state === "WAIT_OX_ROOM_ID") {
        const joinCode = text.toUpperCase().trim();
        const roomFound = roomsMap[joinCode];
        p.state = "IDLE";
        if (!roomFound || roomFound.status !== "WAITING") {
          await sendChild(b.token, cUid, "❌ <b>Room Not Found or Expired!</b>", kb);
        } else {
          await sendChild(
            b.token,
            cUid,
            "🔑 <b>CONFIRM JOIN ROOM #" + escHtml(roomFound.id) + "</b>\n🧑 Host: " + escHtml(roomFound.hostName) + "\n🎟 Stake: <code>₹" + fmtRs(roomFound.stake) + "</code>",
            { inline_keyboard: [[{ text: "✅ Confirm & Pay ₹" + fmtRs(roomFound.stake), callback_data: "ox_pvp_confirm_" + roomFound.id }]] }
          );
        }
      } else if (p.state === "WAIT_SET_WALLET") {
        const wNum = text.replace(/\D/g, "");
        if (wNum.length < 10) await sendChild(b.token, cUid, "❌ Send valid 10-digit Wallet Number:");
        else {
          p.walletNum = wNum;
          p.state = "IDLE";
          await sendChild(b.token, cUid, "✅ <b>Wallet Saved:</b> <code>" + wNum + "</code>", kb);
          await sendChildWithdrawMenu(b, cUid, p);
        }
      } else if (p.state === "WAIT_SET_UPI") {
        if (!text.includes("@")) await sendChild(b.token, cUid, "❌ Send valid UPI ID containing @:");
        else {
          p.upiId = text.trim();
          p.state = "IDLE";
          await sendChild(b.token, cUid, "✅ <b>UPI ID Saved:</b> <code>" + escHtml(p.upiId) + "</code>", kb);
          await sendChildWithdrawMenu(b, cUid, p);
        }
      } else if (p.state === "WAIT_WD_AMT") {
        const wdAmt = parseFloat(text);
        const minW = numOrDef(b.minWithdraw, 1);
        const maxW = numOrDef(b.maxWithdraw, 5000);
        if (isNaN(wdAmt) || wdAmt < minW || wdAmt > maxW || wdAmt > p.balance) {
          await sendChild(b.token, cUid, "❌ Invalid amount or insufficient balance!");
        } else {
          p.balance = Number((p.balance - wdAmt).toFixed(2));
          p.state = "IDLE";
          const reqId = "U" + Date.now().toString().slice(-6);
          upiWithdrawals[reqId] = {
            id: reqId,
            userId: cUid,
            userName: cName,
            amount: wdAmt,
            upi: p.tempWdMethod === "WALLET" ? p.walletNum : p.upiId,
            status: "PENDING"
          };
          addHistory(p, "⏳ Withdraw Request (#" + reqId + "): ₹" + fmtRs(wdAmt));
          await sendChild(b.token, cUid, "✅ <b>WITHDRAWAL REQUEST SUBMITTED (#" + reqId + ")!</b>\n💸 Amount: <code>₹" + fmtRs(wdAmt) + "</code>", kb);
          await sendChild(
            b.token,
            b.owner || MASTER_ADMIN,
            "🔔 <b>NEW WITHDRAWAL REQUEST</b>\n👤 " + escHtml(cName) + " (<code>" + cUid + "</code>)\n💸 Amount: <code>₹" + fmtRs(wdAmt) + "</code>\n🎯 Account: <code>" + escHtml(upiWithdrawals[reqId].upi) + "</code>",
            {
              inline_keyboard: [
                [
                  { text: "✅ Approve (₹" + fmtRs(wdAmt) + ")", callback_data: "cu_app_" + reqId },
                  { text: "❌ Reject & Refund", callback_data: "cu_rej_" + reqId }
                ]
              ]
            }
          );
        }
      } else if (isAdm && p.state.startsWith("CA_")) {
        const st = p.state;
        if (st === "CA_TASK_NAME") {
          p.tempTaskName = text;
          p.state = "CA_TASK_LINK";
          await sendChild(b.token, cUid, "🔗 <b>STEP 2/4:</b> Send <b>Task Link</b>:");
        } else if (st === "CA_TASK_LINK") {
          p.tempTaskLink = text.trim();
          p.state = "CA_TASK_STEPS";
          await sendChild(b.token, cUid, "📝 <b>STEP 3/4:</b> Send <b>Task Steps</b>:");
        } else if (st === "CA_TASK_STEPS") {
          p.tempTaskSteps = text;
          p.state = "CA_TASK_REWARD";
          await sendChild(b.token, cUid, "💰 <b>STEP 4/4:</b> Send <b>Task Reward in ₹</b>:");
        } else if (st === "CA_TASK_REWARD") {
          p.state = "IDLE";
          const tRew = parseFloat(text);
          if (!Array.isArray(b.tasks)) b.tasks = [];
          b.tasks.push({ id: "T" + Date.now().toString().slice(-5), name: p.tempTaskName, link: p.tempTaskLink, steps: p.tempTaskSteps, reward: tRew || 1 });
          await sendChildAdminPanel(b, cUid, totalUsersCount, "✅ <b>New Task Added!</b>");
        } else {
          p.state = "IDLE";
          if (st === "CA_WAIT_WTOKEN") b.walletToken = text.trim();
          else if (st === "CA_WAIT_FUND") { b.botFund = parseFloat(text) || 0; b.unlimitedFund = false; }
          else if (st === "CA_WAIT_MINW") b.minWithdraw = parseFloat(text) || 1;
          else if (st === "CA_WAIT_MAXW") b.maxWithdraw = parseFloat(text) || 5000;
          else if (st === "CA_WAIT_DAILY") b.dailyBonus = parseFloat(text) || 0;
          else if (st === "CA_WAIT_REF") {
            const rp = text.split(" ");
            b.referBonus = parseFloat(rp[0]) || 0;
            b.joinReward = parseFloat(rp[1]) || 0;
          } else if (st === "CA_WAIT_ADDCH") {
            const cp = text.split(" ");
            if (!Array.isArray(b.channels)) b.channels = [];
            b.channels.push({ chatId: cp[0], link: cp[1] || "https://t.me/", title: cp.slice(2).join(" ") || "Channel" });
          } else if (st === "CA_WAIT_ADDBAL" || st === "CA_WAIT_CUTBAL") {
            const bp = text.split(" ");
            const tp = getOrInitPlayer(players, b, bp[0], "Player", "");
            const amt = parseFloat(bp[1]) || 0;
            tp.balance = st === "CA_WAIT_ADDBAL" ? Number((tp.balance + amt).toFixed(2)) : Math.max(0, Number((tp.balance - amt).toFixed(2)));
            await sendChild(b.token, bp[0], "💳 <b>Admin Balance Update:</b> <code>₹" + fmtRs(tp.balance) + "</code>");
          } else if (st === "CA_WAIT_BAN") {
            const bu = getOrInitPlayer(players, b, text.trim(), "Player", "");
            bu.banned = true;
          } else if (st === "CA_WAIT_UNBAN") {
            const ubu = getOrInitPlayer(players, b, text.trim(), "Player", "");
            ubu.banned = false;
          } else if (st === "CA_WAIT_ADDADM") {
            if (!Array.isArray(b.admins)) b.admins = [];
            b.admins.push(text.trim());
          } else if (st === "CA_WAIT_STARTTXT") {
            b.welcomeText = text;
          } else if (st === "CA_WAIT_BTNS") {
            const pts = text.split("|");
            if (pts.length >= 8) {
              b.menuBtns = {
                profile: pts[0].trim(), pay: pts[1].trim(), ox: pts[2].trim(), task: pts[3].trim(),
                bonus: pts[4].trim(), refer: pts[5].trim(), withdraw: pts[6].trim(), history: pts[7].trim()
              };
            }
          } else if (st === "CA_WAIT_CCMD") {
            const cc = text.split("|");
            if (cc.length >= 2) {
              if (!b.customCmds) b.customCmds = {};
              b.customCmds[cc[0].trim().toLowerCase()] = cc.slice(1).join("|").trim();
            }
          } else if (st === "CA_WAIT_GIFT") {
            const gp = text.split(" ");
            const gCode = (gp[0] || "").toUpperCase();
            giftCodesMap[gCode] = { code: gCode, amount: parseFloat(gp[1]) || 5, max: parseInt(gp[2], 10) || 20, used: [] };
          } else if (st === "CA_WAIT_BCAST") {
            for (const uId of Object.keys(players)) {
              await sendChild(b.token, uId, "📢 <b>ANNOUNCEMENT</b>\n━━━━━━━━━━━━━━━━━━━━\n" + text);
            }
          }
          await sendChildAdminPanel(b, cUid, totalUsersCount, "✅ <b>Updated Successfully!</b>");
        }
      } else {
        // ================= STANDARD MENU BUTTONS & COMMANDS =================
        const btns = b.menuBtns || {};
        const bProfile = btns.profile || "👤 My Profile";
        const bPay = btns.pay || "💳 Pay / Deposit";
        const bOx = btns.ox || "🎮 Play O-X Game";
        const bTask = btns.task || "📋 Task Center";
        const bBonus = btns.bonus || "🎁 Daily Bonus";
        const bRefer = btns.refer || "👥 Refer & Earn";
        const bWithdraw = btns.withdraw || "💸 Withdraw";
        const bHistory = btns.history || "📜 History";

        if (text.startsWith("/start")) {
          const sp = text.split(" ");
          if (sp.length > 1 && sp[1].startsWith("ref_")) {
            const invId = sp[1].replace("ref_", "").trim();
            if (invId && invId !== cUid && !p.referredBy) {
              p.referredBy = invId;
              p.refRewarded = true;
              const rBon = numOrDef(b.referBonus, 5);
              const invP = getOrInitPlayer(players, b, invId, "Inviter", "");
              invP.referrals = (invP.referrals || 0) + 1;
              invP.balance = Number((invP.balance + rBon).toFixed(2));
              invP.totalEarned = (invP.totalEarned || 0) + rBon;
              addHistory(invP, "👥 Referral Bonus (" + p.name + "): +₹" + fmtRs(rBon));
              await sendChild(b.token, invId, "🎉 <b>New Referral Joined!</b> Bonus: <code>+₹" + fmtRs(rBon) + "</code>!");
            }
          }
          await sendChildWelcomeScreen(b, cUid, p, totalUsersCount, "");
        } else if (text === bProfile || text === "👤 My Profile" || text === "/profile") {
          await sendChildProfileScreen(b, cUid, p);
        } else if (text === bPay || text === "💳 Pay / Deposit" || text === "💳 Deposit" || text === "/pay") {
          await sendChild(
            b.token,
            cUid,
            "💳 <b>PAY / DEPOSIT / REDEEM GIFT CODE</b>\n" +
              "━━━━━━━━━━━━━━━━━━━━\n" +
              "💰 <b>Your Balance:</b> <code>₹" + fmtRs(p.balance) + "</code>\n" +
              "💵 <b>Live Bot Fund:</b> <code>" + formatBotFundText(b) + "</code>\n\n" +
              "• Send any <b>Gift Code</b> directly in chat to claim instant balance!\n" +
              "• Or contact the Bot Owner below:",
            { inline_keyboard: [[{ text: "👑 Contact Bot Owner", url: "tg://user?id=" + (b.owner || MASTER_ADMIN) }]] }
          );
        } else if (text === bOx || text === "🎮 Play O-X Game" || text === "/ox" || text === "/game") {
          await sendOxMainMenu(b, cUid, p);
        } else if (text === bTask || text === "📋 Task Center" || text === "/tasks") {
          await sendTaskCenterScreen(b, cUid, p);
        } else if (text === bBonus || text === "🎁 Daily Bonus" || text === "/bonus") {
          const dBon = numOrDef(b.dailyBonus, 2);
          const today = new Date().toISOString().slice(0, 10);
          if (p.lastBonus === today) {
            await sendChild(b.token, cUid, "⏳ <b>Daily Bonus already claimed today!</b> Come back tomorrow.", kb);
          } else {
            p.lastBonus = today;
            p.balance = Number((p.balance + dBon).toFixed(2));
            p.totalEarned = (p.totalEarned || 0) + dBon;
            addHistory(p, "🎁 Daily Bonus Claimed: +₹" + fmtRs(dBon));
            await sendChild(b.token, cUid, "🎁 <b>DAILY BONUS CLAIMED!</b>\nAdded: <code>+₹" + fmtRs(dBon) + "</code>\nBalance: <code>₹" + fmtRs(p.balance) + "</code>", kb);
          }
        } else if (text === bRefer || text === "👥 Refer & Earn" || text === "/refer") {
          const rLink = "https://t.me/" + b.username + "?start=ref_" + cUid;
          const rBonAmt = numOrDef(b.referBonus, 5);
          await sendChild(
            b.token,
            cUid,
            "👥 <b>REFER & EARN PROGRAM</b>\n━━━━━━━━━━━━━━━━━━━━\n" +
              "Invite friends & earn <b>₹" + fmtRs(rBonAmt) + "</b> per verified friend!\n\n" +
              "🔗 <b>Your Invite Link:</b>\n<code>" + rLink + "</code>\n\n" +
              "📊 <b>Total Referrals:</b> <code>" + (p.referrals || 0) + "</code>",
            kb
          );
        } else if (text === bWithdraw || text === "💸 Withdraw" || text === "/withdraw") {
          await sendChildWithdrawMenu(b, cUid, p);
        } else if (text === bHistory || text === "📜 History" || text === "/history") {
          await sendChildHistoryScreen(b, cUid, p);
        } else if (isAdm && (text === "👑 Pro Admin Panel" || text === "👑 Admin Panel" || text === "/admin")) {
          await sendChildAdminPanel(b, cUid, totalUsersCount, "");
        } else if (b.customCmds && b.customCmds[text.toLowerCase()]) {
          await sendChild(b.token, cUid, b.customCmds[text.toLowerCase()], kb);
        } else if (giftCodesMap[text.toUpperCase().trim()]) {
          const gCand = text.toUpperCase().trim();
          const gObj = giftCodesMap[gCand];
          if (!Array.isArray(gObj.used)) gObj.used = [];
          if (gObj.used.includes(cUid)) {
            await sendChild(b.token, cUid, "⚠️ You already claimed this Gift Code!", kb);
          } else if (gObj.used.length >= gObj.max) {
            await sendChild(b.token, cUid, "❌ Gift Code expired!", kb);
          } else {
            gObj.used.push(cUid);
            p.balance = Number((p.balance + gObj.amount).toFixed(2));
            p.totalEarned = (p.totalEarned || 0) + gObj.amount;
            addHistory(p, "🎟 Gift Code (" + gCand + "): +₹" + fmtRs(gObj.amount));
            await sendChild(b.token, cUid, "🎉 <b>GIFT CODE REDEEMED!</b>\nAdded: <code>+₹" + fmtRs(gObj.amount) + "</code>\nBalance: <code>₹" + fmtRs(p.balance) + "</code>", kb);
          }
        } else {
          await sendChildWelcomeScreen(b, cUid, p, totalUsersCount, "");
        }
      }
    }

    // Save entire updated state back to Firebase atomically
    node.botConfig = b;
    node.playersMap = players;
    node.roomsMap = roomsMap;
    node.oxBotSessions = oxBotSessions;
    node.taskSubmissions = taskSubmissions;
    node.upiWithdrawals = upiWithdrawals;
    node.giftCodesMap = giftCodesMap;

    await fetch(`${FIREBASE_DB_URL}/kumar_cloud/bots/${botId}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(node)
    });
  } catch (err) {}

  return res.status(200).send("OK");
}
