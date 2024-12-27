// === server.js ===
// Mengimpor modul WebSocket dan crypto untuk koneksi real-time dan keamanan
const WebSocket = require('ws');
const crypto = require('crypto');

// Menghasilkan kunci enkripsi yang aman untuk komunikasi (gunakan manajemen kunci di produksi)
const ENCRYPTION_KEY = crypto.randomBytes(32);

// Membuat server WebSocket pada port 8080
const wss = new WebSocket.Server({ port: 8080 });

// Map untuk menyimpan klien aktif dengan ID unik mereka
const clients = new Map();

// Map untuk menyimpan pesan dengan timestamp untuk pembersihan otomatis
const messages = new Map();

// Durasi waktu hidup pesan sebelum dihapus otomatis (5 menit)
const MESSAGE_LIFETIME = 5 * 60 * 1000; 

// Event listener untuk koneksi baru ke server WebSocket
wss.on('connection', (ws) => {
  // Menghasilkan ID unik untuk setiap klien yang terhubung
  const clientId = crypto.randomUUID();
  
  // Menyimpan koneksi klien ke dalam Map
  clients.set(ws, clientId);
  console.log(`Klien baru terhubung: ${clientId}`);

  // Mengirimkan kunci enkripsi ke klien baru dalam format Base64
  ws.send(JSON.stringify({
    type: 'key',
    key: ENCRYPTION_KEY.toString('base64')
  }));

  // Event listener untuk menerima pesan dari klien
  ws.on('message', (message) => {
    try {
      // Mengurai pesan JSON yang diterima dari klien
      const messageObj = JSON.parse(message);
      const messageId = crypto.randomUUID(); // Menghasilkan ID unik untuk pesan
      
      // Menyimpan pesan ke Map dengan timestamp
      messages.set(messageId, {
        timestamp: Date.now(),
        content: messageObj.content, // Isi pesan terenkripsi
        iv: messageObj.iv, // Vector inisialisasi untuk dekripsi
        authTag: messageObj.authTag // Tag autentikasi untuk integritas pesan
      });

      // Menyiarkan pesan ke semua klien kecuali pengirim
      clients.forEach((id, client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'message',
            messageId: messageId, // ID unik pesan
            senderId: clientId, // ID pengirim pesan
            content: messageObj.content, // Isi pesan
            iv: messageObj.iv, // Vector inisialisasi
            authTag: messageObj.authTag // Tag autentikasi
          }));
        }
      });
    } catch (error) {
      // Menangkap dan mencetak kesalahan jika pesan tidak dapat diproses
      console.error('Error processing message:', error);
    }
  });

  // Event listener untuk menangani klien yang terputus
  ws.on('close', () => {
    console.log(`Klien terputus: ${clientId}`);
    // Menghapus klien dari Map
    clients.delete(ws);
  });
});

// Interval untuk membersihkan pesan yang sudah kedaluwarsa
setInterval(() => {
  const now = Date.now();
  for (const [messageId, messageData] of messages.entries()) {
    if (now - messageData.timestamp >= MESSAGE_LIFETIME) {
      // Menyiarkan informasi penghapusan pesan ke semua klien
      clients.forEach((id, client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'delete', // Tipe pesan untuk penghapusan
            messageId: messageId // ID pesan yang dihapus
          }));
        }
      });
      // Menghapus pesan dari Map
      messages.delete(messageId);
    }
  }
}, 60000); // Interval pembersihan setiap 1 menit

console.log('Server WebSocket dimulai pada port 8080');
