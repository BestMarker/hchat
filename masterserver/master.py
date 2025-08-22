import asyncio
import websockets
import json
import time

port = 4000  # Master server port

servers = {}  # { "ip:port": { "name": "test sunucusu", "info":"günün mesajı!", "ip": "ws nin gördüğü", "port": 25565, "maxusers": 8, "last_heartbeat": 35.7 } }

async def handler(websocket):


    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                print("❌ Geçersiz JSON")
                continue

            # Sunucu kaydı
            if data.get("type") == "registerServer":
                key = f"{websocket.remote_address[0]}:{data['port']}"
                servers[key] = {
                    "name": data["name"],
                    "motd": data.get("motd", "Açıklama yok."),
                    "software": data.get("software", "Bilinmiyor"),
                    "ip": websocket.remote_address[0],  # WebSocket bağlantısından IP al
                    "port": data["port"],
                    "currentusers": data.get("currentusers", 0),
                    "maxusers": data["maxusers"],
                    "last_heartbeat": time.time()
                }
                print(f"✅ Sunucu eklendi/güncellendi: {key}")

            # Heartbeat (sunucu güncelleme)
            elif data.get("type") == "heartbeat":
                key = f"{websocket.remote_address[0]}:{data['port']}"
                if key in servers:
                    servers[key]["currentusers"] = data.get("currentusers", servers[key].get("currentusers", 0))
                    servers[key]["maxusers"] = data["maxusers"]  # kullanıcı sayısını güncelle
                    servers[key]["last_heartbeat"] = time.time()


            # İstemci sunucu listesi istediğinde
            elif data.get("type") == "getServers":
                server_list = [
                    {
                        "name": s["name"],
                        "motd": s["motd"],
                        "software": s["software"],
                        "ip": s["ip"],
                        "port": s["port"],
                        "currentusers": s.get("currentusers", 0),
                        "maxusers": s["maxusers"]
                    }
                    for s in servers.values()
                ]
                await websocket.send(json.dumps({
                    "type": "serverList",
                    "servers": server_list
                }))

    except websockets.exceptions.ConnectionClosed:
        print(f"❌ Bağlantı kapandı: {websocket.remote_address}")

async def cleanup_task():
    while True:
        now = time.time()
        to_remove = [key for key, srv in servers.items() if now - srv["last_heartbeat"] > 20]
        for key in to_remove:
            print(f"🗑️ Sunucu listeden silindi: {key}")
            del servers[key]
        await asyncio.sleep(5)

async def main():
    asyncio.create_task(cleanup_task())
    async with websockets.serve(handler, "0.0.0.0", port):
        print("🚀 Master Server başlatıldı: ws://0.0.0.0:" + str(port))
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
