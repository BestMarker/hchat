const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { server } = require('websocket');
const bcrypt = require('bcrypt');
const { features } = require('process');

const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const USERS_FILE = path.join(__dirname, 'users.json');


dotenv.config();

const SERVER_NAME = process.env.SERVER_NAME || "Sohbet sunucusu";
const SERVER_MOTD = process.env.SERVER_MOTD || "HChat sunucusuna hoş geldiniz!";
const SERVER_SOFTWARE = "HChat vanilla 1.2.2";
const FEATURELIST = ["Kayıt", "Çevrimiçi", "Şifreleme"];
const maxusers = process.env.MAXUERS || 8 ; // 0 ise sınırsız kullanıcı
const SERVER_PORT = process.env.SERVER_PORT || 6968;
var currentusers = 0;

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

        if (!user) {
          return;
        }
        if (data.msgdata.trim() === "") {
          return; // Boş mesaj gönderimini engelle
        }
        if (data.msgdata.startsWith("/")) {
          commandhandler(data.msgdata, socket, user.username);
          return;
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
