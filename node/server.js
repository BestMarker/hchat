const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { server } = require('websocket');
const bcrypt = require('bcrypt');
const { features } = require('process');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { ms } = require('zod/locales');
const { clear } = require('console');

const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const USERS_FILE = path.join(__dirname, 'users.json');


dotenv.config();

const SERVER_NAME = process.env.SERVER_NAME || "Sohbet sunucusu";
const SERVER_MOTD = process.env.SERVER_MOTD || "HChat 1.3.0";
const SERVER_SOFTWARE = "HChat vanilla 1.3.0";
const FEATURELIST = ["Kayıt", "AI", "Şifreleme"];
const maxusers = process.env.MAXUSERS || 8 ; // 0 ise sınırsız kullanıcı
const SERVER_PORT = process.env.SERVER_PORT || 6968;
var currentusers = 0;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); //TODO yapay zeka özelliklerini opsiyonel yap
const aiTools = {
    functionDeclarations: [
        {
            name: "banUser",
            description: "Bir kullanıcıyı sohbet sunucusundan yasaklar (banlar).",
            parameters: {
                type: "OBJECT",
                properties: {
                    username: { type: "STRING", description: "Banlanacak kullanıcının adı" },
                    reason: { type: "STRING", description: "Banlanma sebebi" },
                },
                required: ["username"],
            },
        },
        {
            name: "unbanUser",
            description: "Bir kullanıcının yasağını kaldırır.",
            parameters: {
                type: "OBJECT",
                properties: {
                    username: { type: "STRING", description: "Yasağı kalkacak kullanıcı adı" },
                },
                required: ["username"],
            },
        },
        {
            name: "clearChat",
            description: "Sohbet odasındaki mesajları temizler."
        }
    ],
};

const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite", 
    tools: [aiTools] 
});

function performBan(username, reason) {
    const users = readUsers();
    const userIndex = users.findIndex(u => u.username === username);
    
    if (userIndex !== -1) {
        users[userIndex].isBanned = true; // Kullanıcıya ban etiketi yapıştır
        users[userIndex].banReason = reason || "Admin kararı";
        writeUsers(users);
        
        // Eğer kullanıcı şu an bağlıysa, bağlantısını kes
        wss.clients.forEach(client => {
            if (client.username === username && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'kick', hata: `BANLANDINIZ: ${reason}` }));
                client.close();
            }
        });
        return `${username} başarıyla banlandı. Sebep: ${reason}`;
    }
    return `${username} adlı kullanıcı bulunamadı.`;
}

function performUnban(username) {
    const users = readUsers();
    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex !== -1) {
        users[userIndex].isBanned = false;
        writeUsers(users);
        return `${username} kullanıcısının banı kaldırıldı.`;
    }
    return "Kullanıcı bulunamadı.";
}

function clearChat() {
    try {
        const rawData = fs.readFileSync(MESSAGES_FILE, 'utf8');
        const messages = JSON.parse(rawData);
        messages.forEach(msg => {
            wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'msg-sil', msgid: msg.id }));
            }
        });
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify([], null, 2), 'utf8');
        });
        return "Sohbet başarıyla temizlendi.";
    } catch (err) {
        console.error("Sohbet temizlenirken hata:", err);
        return "Sohbet temizlenirken bir hata oluştu.";
    }
}

// --- YAPAY ZEKA İŞLEYİCİSİ ---
async function handleAICommand(adminMsg, adminSocket) {
    // Sohbet geçmişini modele vererek bağlam oluşturabiliriz ama şimdilik sadece komutu yolluyoruz.
    const chat = model.startChat();

    try {
        const result = await chat.sendMessage(adminMsg);
        const response = await result.response;
        const functionCalls = response.functionCalls();

        if (functionCalls && functionCalls.length > 0) {
            // Gemini bir fonksiyon çağırmak istiyor
            const msgid = uuidv4();
            for (const call of functionCalls) {
                let actionResult = "";
                
                if (call.name === "banUser") {
                    actionResult = performBan(call.args.username, call.args.reason);
                } else if (call.name === "unbanUser") {
                    actionResult = performUnban(call.args.username);
                }
                else if (call.name === "clearChat") {
                    actionResult = clearChat();
                }
                
                // Sonucu Admin'e (veya tüm sohbete) bildir
                const systemMsg = JSON.stringify({
                    type: "msggeldi",
                    mid: msgid,
                    sender: "Yapay Zeka",
                    msg: `🤖 İşlem Sonucu: ${actionResult}`,
                    time: Date.now()
                });
                
                // Herkese duyur
                saveMessage(msgid, "Yapay Zeka", `🤖 İşlem Sonucu: ${actionResult}`, Date.now());
                wss.clients.forEach(c => c.send(systemMsg));
            }
        } else {
            // Gemini fonksiyon çağırmadıysa, sadece sohbet ediyordur
            const text = response.text();
            adminSocket.send(JSON.stringify({
                type: "msggeldi",
                mid: msgid,
                sender: "Yapay Zeka",
                msg: text,
                time: Date.now()
            }));
            saveMessage(msgid, "Yapay Zeka", text, Date.now());
        }
    } catch (error) {
        console.error("Gemini Hatası:", error);
        adminSocket.send(JSON.stringify({
            type: "msggeldi",
            mid: "ERR",
            sender: "Sistem",
            msg: "Yapay zeka servisine ulaşılamadı.",
            time: Date.now()
        }));
    }
}

const wss = new WebSocket.Server({ port: SERVER_PORT });
let masterSocket;
const adminids = process.env.ADMIN_IDS;
const bannedusers = process.env.BANNED_IPS;
function connectToMaster() {
    if (process.env.ISPUBLIC == 0) {
        console.log("Sunucu gizli modda, master server'a bağlanılmıyor.");
        return;
    }
    try {
        const MASTER_SERVER = process.env.MASTER_SERVER || "ws://127.0.0.1:4000";
        masterSocket = new WebSocket(MASTER_SERVER);

        masterSocket.on('open', () => {
            console.log("Master server'a bağlandı");

            // İlk kayıt
            masterSocket.send(JSON.stringify({
                type: "registerServer",
                name: SERVER_NAME,
                motd: SERVER_MOTD,
                software: SERVER_SOFTWARE,
                port: SERVER_PORT,
                currentusers: currentusers,
                maxusers: maxusers,
                features: FEATURELIST
            }));

            // 10 saniyede bir heartbeat
            setInterval(() => {
                if (masterSocket.readyState === WebSocket.OPEN) {
                    masterSocket.send(JSON.stringify({
                        type: "heartbeat",
                        port: SERVER_PORT,
                        currentusers: currentusers,
                        maxusers: maxusers
                    }));
                }
            }, 10000);
        });

        masterSocket.on('close', () => {
            console.log("Master server bağlantısı koptu");

        });

        masterSocket.on('error', (err) => {
            console.error("Master server bağlantı hatası:", err.message);

        });

    } catch (err) {
        console.error("Master server'a bağlanırken hata:", err);

    }

}

connectToMaster();


function commandhandler(command, socket, username) {
  const users = readUsers();
  const user = users.find(u => u.username === username);
  var isAdmin = false;
  if (user) {
    const token = user.token;
    isAdmin = adminids.includes(token);
  }
  const rawData = fs.readFileSync(MESSAGES_FILE, 'utf8');
  const messages = JSON.parse(rawData);
 

    if (command.startsWith("/sil")) {
        const parts = command.split(" ");
        if (parts.length < 2) {
          return;
        }
        const msgId = parts[1];
        if (!msgId) {
          return;
        }
        const messageIndex = messages.findIndex(msg => msg.id === msgId);
        if (messageIndex !== -1 && (isAdmin )) {
            messages.splice(messageIndex, 1);
            fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
            wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "msg-sil",
                msgid: msgId
              }));
            }
          });
        }
    }
    if (command.startsWith("/duzenle")) {
    const parts = command.split(" ");
    if (parts.length < 3) {
        return;
    }
    const msgId = parts[1];
    const newMsg = parts.slice(2).join(" ");
    const messageIndex = messages.findIndex(msg => msg.id === msgId);
    if (messageIndex !== -1 && (isAdmin )) {
        messages[messageIndex].msg = newMsg; 
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: "msg-duzenle",
                    msgid: msgId,
                    newmsg: newMsg
                }));
            }
        });
    }
}
}





function readUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, 'utf8');
      return content ? JSON.parse(content) : [];
    }
  } catch (err) {
    console.error("Kullanıcıları okurken hata:", err);
  }
  return [];
}

function writeUsers(userList) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(userList, null, 2), 'utf8');
  } catch (err) {
    console.error("Kullanıcıları yazarken hata:", err);
  }
}

function saveMessage(id, sender, msg, time) {
  let messages = [];
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const rawData = fs.readFileSync(MESSAGES_FILE, 'utf8');
      messages = rawData ? JSON.parse(rawData) : [];
    }
  } catch (err) {
    console.error("Mesajları okurken hata:", err);
  }

  messages.push({
    id,
    sender,
    msg,
    timestamp: time || Date.now()
  });

  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (err) {
    console.error("Mesajları yazarken hata:", err);
  }
}


wss.on('connection', socket => {
  let username = null;
  let usertoken = null;
  currentusers = wss.clients.size;

  socket.on('close', () => {
  currentusers = wss.clients.size;
});

  socket.on('message', message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.error("Geçersiz JSON:", err);
      return;
    }

    switch (data.type) {
      case 'ping':
        socket.send(JSON.stringify({ type: 'pong', tstamp: data.current }));
        break;

      case 'requestmsg':
        try {
          if (fs.existsSync(MESSAGES_FILE)) {
            const rawData = fs.readFileSync(MESSAGES_FILE, 'utf8');
            const messages = JSON.parse(rawData);

            messages.forEach(msg => {
              socket.send(JSON.stringify({
                type: "msggeldi",
                mid: msg.id,
                sender: msg.sender,
                msg: msg.msg,
                time: msg.timestamp
              }));
            });
          }
        } catch (err) {
          console.error("Mesajlar gönderilemedi:", err);
        }
        break;

      case 'login':
          if (maxusers != 0 && currentusers >= maxusers) {
            socket.send(JSON.stringify({ type: 'login-no', hata: 'Sunucu Dolu :(' }));
            console.warn("❌ Maksimum kullanıcı sayısına ulaşıldı, login reddedildi");
            return;
          }
          if (bannedusers.includes(socket._socket.remoteAddress)) {
            socket.send(JSON.stringify({ type: 'login-no', hata: 'Banlısınız!' }));
            return;
          }
        username = data.username?.trim();
        const password = data.password?.trim();
        if (!username || !password) {
            socket.send(JSON.stringify({ type: 'login-no', hata: 'Geçersiz kullanıcı adı veya şifre' }));
            return;
        }

        const users = readUsers();
        let existingUser = users.find(u => u.username === username);

        if (existingUser) {

          if (existingUser.isBanned) {
                socket.send(JSON.stringify({ type: 'login-no', hata: 'Bu hesaptan erişiminiz yasaklanmıştır.' }));
                return;
            }

            // Şifreyi doğrula
            bcrypt.compare(password, existingUser.password, (err, result) => {
                if (result) {
                    usertoken = existingUser.token;
                    socket.send(JSON.stringify({ type: 'login-tmam', isim: username, token: usertoken, servername: SERVER_NAME }));
                } else {
                    socket.send(JSON.stringify({ type: 'login-no', hata: 'Şifre yanlış' }));
                }
            });
        } else {
            // Yeni kullanıcı: Şifreyi hash’le ve kaydet
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) {
                    socket.send(JSON.stringify({ type: 'login-no', hata: 'Kayıt hatası' }));
                    return;
                }
                usertoken = uuidv4();
                users.push({ username, password: hash, token: usertoken });
                writeUsers(users);
                socket.send(JSON.stringify({ type: 'login-tmam', isim: username, token: usertoken, servername: SERVER_NAME }));
            });
        }
        break;

      case 'sendmsg':
        const token = data.mytoken;
        const allUsers = readUsers();
        const user = allUsers.find(u => u.token === token);
        const isAdmin = adminids.includes(token);
        if (!user) {
          return;
        }
        if (data.msgdata.trim() === "") {
          return; // Boş mesaj gönderimini engelle
        }
        if (user.isBanned) {
          return; // Banlı kullanıcıların mesaj göndermesini engelle
        }
        if (data.msgdata.startsWith("/")) {
          commandhandler(data.msgdata, socket, user.username);
          return;
        }
          if (isAdmin && data.msgdata.startsWith("@bot")) {
              const prompt = data.msgdata.replace("@bot", "").trim();
              // AI işlemeye başlasın
              handleAICommand(prompt, socket);
          }
        msgid = uuidv4();
        const sendername = user.username;
        saveMessage(msgid, sendername, data.msgdata, Date.now());

        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "msggeldi",
              mid: msgid,
              sender: sendername,
              msg: data.msgdata,
              time: Date.now()
            }));
          }
        });
        break;
    }
  });

});
