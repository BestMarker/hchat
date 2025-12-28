import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Dosya yollarını ayarla (ESM modülü olduğu için __dirname'i manuel tanımlıyoruz)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_FILE = path.join(__dirname, 'users.json');

// Yardımcı Fonksiyon: Kullanıcıları Oku
function readUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, 'utf8');
      return content ? JSON.parse(content) : [];
    }
  } catch (err) {
    return [];
  }
}

// Yardımcı Fonksiyon: Kullanıcıları Yaz
function writeUsers(userList) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(userList, null, 2), 'utf8');
}

// MCP Sunucusunu Başlat
const server = new McpServer({
  name: "HChat-Yonetim",
  version: "1.0.0",
});

// --- ARAÇ (TOOL) TANIMI: KULLANICI BANLA ---
server.tool(
  "kullanici_banla",
  "Kullanıcı adını kullanarak bir kullanıcıyı sunucudan yasaklar (banlar).",
  {
    username: z.string().describe("Banlanacak kullanıcının tam kullanıcı adı"),
    reason: z.string().describe("Banlanma sebebi").optional(),
  },
  async ({ username, reason }) => {
    const users = readUsers();
    const userIndex = users.findIndex(u => u.username === username);

    if (userIndex === -1) {
      return {
        content: [{ type: "text", text: `Hata: '${username}' adında bir kullanıcı bulunamadı.` }],
        isError: true,
      };
    }

    // Kullanıcıyı banla (isBanned bayrağını true yap)
    users[userIndex].isBanned = true;
    users[userIndex].banReason = reason || "Sebep belirtilmedi";
    
    writeUsers(users);

    return {
      content: [{ type: "text", text: `BAŞARILI: ${username} kullanıcısı yasaklandı. Sebep: ${reason || "Belirtilmedi"}` }],
    };
  }
);

// --- ARAÇ (TOOL) TANIMI: BAN KALDIR ---
server.tool(
    "ban_kaldir",
    "Bir kullanıcının yasağını kaldırır.",
    {
      username: z.string().describe("Yasağı kaldırılacak kullanıcı adı"),
    },
    async ({ username }) => {
      const users = readUsers();
      const userIndex = users.findIndex(u => u.username === username);
  
      if (userIndex === -1) {
        return { content: [{ type: "text", text: `Kullanıcı bulunamadı.` }], isError: true };
      }
  
      users[userIndex].isBanned = false;
      delete users[userIndex].banReason;
      
      writeUsers(users);
  
      return { content: [{ type: "text", text: `${username} kullanıcısının yasağı kaldırıldı.` }] };
    }
  );

// Sunucuyu STDIO üzerinden dinlemeye başlat
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HChat MCP Sunucusu Hazır.");
}

main();