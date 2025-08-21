# 💬 HChat

HTML, CSS, JavaScript ile websocket kullanılarak geliştirilmiş gerçek zamanlı sohbet protokolü.  
Temelde kullanıcıların anlık mesajlaşmasına olanak sağlar.

FRONTEND İÇİN BİR SUNUCU GEREKEBİLİR! (önerilen: apache http server)

---

## 🚀 Özellikler
- Gerçek zamanlı sohbet 💬
- Yetkilendirme sistemi 🔒
- Masterserver bağlantısı ile sunucu tarayıcısı 🌐
- Frontend: **HTML + CSS + JavaScript** ✨
- Backend: **Javascript** 🦾
- Masterserver: **Python** 🐍
- Genişletilebilir ve modüler yapı 🕸️
- Masaüstü bildirimleri 🔔
- Komut desteği (WIP) 🪄
- Eklenti desteği (WIP) 🧩
---

##Gereksinimler
1. Python >= 3.13 (opsiyonel)
2. node.js >= 22.17.1
3. bir web sunucusu (apache http server ,nginx)

##Nasıl Çalıştırılır?
1. Projeyi indirin.
2. helper.js de ve node/server.js dosyasındaki ip ve portları masterserver'i beltirtecek şekilde düzeltin.
3. Masterserver'i çalıştırın. (opsiyonel, websocket kütüphanesi kullanıyor.)
4. Backend sunucuyu çalıştırın. (node.js gerekli ve yine websocket dahil.)
5. servers.html dosyasını tarayıcıda çalıştırın. (http sunucusu ile test edildi. sunucu gerekebilir!)
6. Sunucu seçin. Bir sorun olursa ip ve port ile bağlantı kurabilirsiniz.
