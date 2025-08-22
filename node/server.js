const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { server } = require('websocket');

const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const USERS_FILE = path.join(__dirname, 'users.json');

const MASTER_SERVER = "ws://127.0.0.1:4000"; // ne yaptığını bilmiyorsan değiştirme!


const SERVER_NAME = "Chatozom";
const SERVER_MOTD = "Resmi Hchat Sohbet Sunucusu [DEV] Refe33d tarafından. muck.";
const SERVER_SOFTWARE = "HChat vanilla 1.2.0";
const maxusers = 0; // 0 ise sınırsız kullanıcı
const SERVER_PORT = 6968;
var currentusers = 0;

const wss = new WebSocket.Server({ port: SERVER_PORT });
let masterSocket;
const adminids = ["231704de-e98e-4ab4-8f75-a0786f13d1df"]; // Admin kullanıcı idleri
function connectToMaster() {
    try {
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
                maxusers: maxusers
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

// Sohbet sunucusundaki kullanıcı sayısını döndür
function registeredusers() {
    // Örnek: kendi server.js içindeki user listesine göre döndür
    return readUsers()?.length || 0; 
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
        if (messageIndex !== -1 && (isAdmin )) { // || messages[messageIndex].sender === username
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
    // Mesaj içeriği: 3. parçadan itibaren hepsini birleştir
    const newMsg = parts.slice(2).join(" ");
    const messageIndex = messages.findIndex(msg => msg.id === msgId);
    if (messageIndex !== -1 && (isAdmin )) { // || messages[messageIndex].sender === username
        messages[messageIndex].msg = newMsg; // Mesajı güncelle
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
    console.log("📁 Kullanıcılar dosyaya yazıldı:", userList);
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
  if (maxusers != 0 && currentusers >= maxusers) {
    socket.close(1008, "Sunucu dolu!");
    console.warn("❌ Maksimum kullanıcı sayısına ulaşıldı, yeni bağlantı reddedildi");
    return;
  }
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
        username = data.username?.trim();
        if (!username) {
          socket.send(JSON.stringify({ type: 'login-no', hata: 'Geçersiz kullanıcı adı' }));
          return;
        }

        const users = readUsers();
        let existingUser = users.find(u => u.username === username);

        if (existingUser) {
          // Kullanıcı zaten kayıtlı: Token'ını geri gönder
          usertoken = existingUser.token;
          socket.send(JSON.stringify({ type: 'login-tmam', isim: username, token: usertoken, servername: SERVER_NAME }));
        } else {
          // Yeni kullanıcı: Kayıt et
          usertoken = uuidv4();
          users.push({ username, token: usertoken });
          writeUsers(users);

          socket.send(JSON.stringify({ type: 'login-tmam', isim: username, token: usertoken, servername: SERVER_NAME }));
          console.log("🆕 Yeni kullanıcı eklendi:", username, usertoken);
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
