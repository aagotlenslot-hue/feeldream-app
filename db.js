// db.js
// Database file sederhana berbasis JSON yang tersimpan di disk SERVER.
// Ini nyata (persisten lintas device/browser) — berbeda dari localStorage
// versi lama yang hanya tersimpan di satu browser satu device saja.
//
// Untuk skala produksi besar, modul ini bisa diganti dengan PostgreSQL/
// MySQL/MongoDB tanpa mengubah kode di file route lain (cukup ganti isi
// fungsi read()/write() & helper di bawah).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      users: [],
      otps: {},           // contact -> { hash, expiresAt, attempts }
      resetTokens: {},     // resetToken -> { contact, expiresAt }
      publicTemplates: [
        {
          id: 1,
          title: 'template-romantis-standar.html',
          desc: 'Template Ucapan Interaktif dengan Struktur HTML Unik.',
          thumbnail: 'https://htmlku.com/0/panda/hiya.gif',
          rawCode: `<!DOCTYPE html><html><body style="background:#07060a;color:#fff;text-align:center;padding:50px;font-family:sans-serif;">
          <h1>{{title}}</h1>
          <img src="{{sticker}}" style="width:120px;border-radius:50%;margin:20px 0;">
          <p style="font-size:18px;max-width:500px;margin:0 auto;line-height:1.6;">{{msg}}</p>
          <h3 style="margin-top:30px;color:#d9b25c;">— {{sign}}</h3>
        </body></html>`,
          customizableFields: {
            title: { label: 'Judul Utama Halaman', value: 'Untuk Kamu', allow: true },
            sticker: { label: 'URL Stiker / Gambar', value: 'https://htmlku.com/0/panda/hiya.gif', allow: true },
            msg: { label: 'Pesan Utama', value: 'Terima kasih sudah selalu ada di setiap langkahku...', allow: true },
            sign: { label: 'Nama Pengirim', value: 'ALDO', allow: true }
          }
        }
      ],
      paymentRequests: [] // { id, contact, amount, status: pending|approved|rejected, proofFile, createdAt }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
  }
}

function read() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function write(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = { read, write };
