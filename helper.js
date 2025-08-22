let ws;
const versaion = "0.2.0";
const software = "HChat vanilla 1.2.0";
// Tarayıcı bildirim izni
Notification.requestPermission();

if (!sessionStorage.getItem('chatServer') && !window.location.href.endsWith("servers.html")) {
    window.location.replace("./servers.html");
}
if (!sessionStorage.getItem('token') && !window.location.href.endsWith("oturum.html")) {
    window.location.replace("./oturum.html");
}
if (sessionStorage.getItem('token') && window.location.href.endsWith("oturum.html")) {
    window.location.replace("./index.html");
}

if (isindex) {
    document.getElementById("ism").innerHTML = sessionStorage.getItem('isim');
}

// Mesaj gönder
function sendmsg() {
    const msg = document.getElementById('mesajInput').value;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'sendmsg',
            mytoken: sessionStorage.getItem("token"),
            msgdata: msg
        }));
    }
}
function delmsg() {
    document.getElementById("context-menu").style.display = "none";
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'sendmsg',
            mytoken: sessionStorage.getItem("token"),
            msgdata: "/sil " + secilenid,
        }));
    }
}
function editmsg() {
    document.getElementById("context-menu").style.display = "none";
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'sendmsg',
            mytoken: sessionStorage.getItem("token"),
            msgdata: "/duzenle " + secilenid + " " + document.getElementById("mesajInput").value
        }));
    }
    document.getElementById('mesajInput').value='';
}

function reset() {
    sessionStorage.removeItem("chatServer");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("isim");
    window.location.replace("./servers.html");
}

function connectWithToken() {
    const serverAddress = sessionStorage.getItem("chatServer") || "127.0.0.1:3000";
    ws = new WebSocket(`ws://${serverAddress}`);
    ws.onmessage = handleMessage;
    ws.onopen = () => {
        console.log(`🔄 ${serverAddress} adresine yeniden bağlanıldı`);
        reqmsg();
    };
}

function login(userisim) {
    const serverAddress = sessionStorage.getItem("chatServer") || "127.0.0.1:3000";
    ws = new WebSocket(`ws://${serverAddress}`);
    ws.onmessage = handleMessage;
    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'login', username: userisim }));
    };
}


// Mesaj geçmişi iste
function reqmsg() {

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'requestmsg' }));
        
        document.getElementById('ism').innerHTML = sessionStorage.getItem('isim');
    }
}

// Ping kontrolü
function ping() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', current: Date.now() }));
    } else {
        clearInterval(pinger);
        let pingsayici = document.getElementById('cbum');
        console.warn("❌ Sunucu kapalı, ping atılamadı");
        pingsayici.innerHTML = "Bağlantı Yok!";
        pingsayici.style.color = "#FFAAAA";
    }
}

// Gelen mesajları yönet
function handleMessage(msg) {
    const data = JSON.parse(msg.data);
    switch (data.type) {
        case 'msggeldi':
            const d = new Date(data.time);
            if (data.sender !== sessionStorage.getItem("isim")) {
                const bbb = document.createElement('div');
                bbb.classList = ["msg-wrapper o"];
                bbb.innerHTML = `
                    <div class="msg-content" id="${data.mid}">
                        <div class="msg-username" id="usnm">${data.sender}</div>
                        <div class="msg-bubble" id="msgx">${data.msg}</div>
                        <div class="msg-time" style="text-align: left;">${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}</div>
                    </div>
                `;
                document.getElementById("chat").appendChild(bbb);
            } else {
                const aaa = document.createElement('div');
                aaa.classList = ["msg-wrapper me"];
                aaa.innerHTML = `
                    <div class="msg-content" id="${data.mid}">
                        <div class="msg-username" id="usnm">${data.sender}</div>
                        <div class="msg-bubble" id="msgx">${data.msg}</div>
                        <div class="msg-time" style="text-align: right;">${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}</div>
                    </div>
                `;
                document.getElementById("chat").appendChild(aaa);
            }
            document.getElementById("chat").scrollTo(0, document.getElementById("chat").scrollHeight);
            if (!document.hasFocus()) {
                new Notification(data.sender + ": " + data.msg);
            }
            break;

        case 'login-tmam':
            sessionStorage.setItem("token", data.token);
            sessionStorage.setItem("isim", data.isim);
            sessionStorage.setItem("servername", data.servername)
            window.location.replace("./index.html");
            break;

        case 'msg-sil':
            silinecek = data.msgid;
        
            document.getElementById(silinecek).parentElement.remove();
            break;
        case 'msg-duzenle':
            degsien = data.msgid;
            document.getElementById(degsien).children[1].innerText = data.newmsg;
            break;

        case 'login-no':
            document.getElementById("asf").innerHTML = data.hata;
            break;

        case 'pong':
            let pingsayici = document.getElementById('cbum');
            pingsayici.innerHTML = "Ping: " + (Date.now() - data.tstamp);
            if (Date.now() - data.tstamp < 50) pingsayici.style.color = "#AAEEAA";
            else if (Date.now() - data.tstamp < 150) pingsayici.style.color = "#DDDDAA";
            else if (Date.now() - data.tstamp >= 150) pingsayici.style.color = "#EEAAAA";
            break;
    }
}

// Eğer token varsa sayfa açıldığında bağlan
if (sessionStorage.getItem('token') && !window.location.href.endsWith("oturum.html")) {
    connectWithToken();
}
