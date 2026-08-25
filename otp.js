const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { read, write } = require('./db');

const OTP_TTL_MS = 5 * 60 * 1000;      // OTP berlaku 5 menit
const OTP_MAX_ATTEMPTS = 5;             // maksimal 5x salah coba
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // token reset password berlaku 10 menit

function generateOtp() {
  // 6 digit acak yang aman secara kriptografis (bukan Math.random seperti versi simulasi)
  return crypto.randomInt(100000, 999999).toString();
}

// Normalisasi nomor HP Indonesia ke format 62xxxxxxxxxx (dibutuhkan Fonnte)
function normalizePhone(raw) {
  let p = raw.replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = '62' + p.slice(1);
  if (p.startsWith('8')) p = '62' + p;
  return p;
}

function isEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

/**
 * Mengirim OTP sungguhan ke WhatsApp user via Fonnte API.
 * Butuh FONNTE_TOKEN di .env (daftar & scan QR device WA di https://fonnte.com).
 * Jika contact yang didaftarkan berupa email, kita tetap kirim OTP ke
 * WhatsApp NOMOR OWNER (karena tidak ada akses ke WA pribadi user itu) —
 * sebaiknya user daftar pakai nomor WhatsApp mereka sendiri.
 */
async function sendOtpWhatsApp(targetPhoneRaw, otp) {
  const token = process.env.FONNTE_TOKEN;
  if (!token || token.includes('isi-token')) {
    throw new Error(
      'FONNTE_TOKEN belum diisi di file .env. Daftar gratis di https://fonnte.com, ' +
      'hubungkan WhatsApp Anda, lalu salin token ke .env agar OTP bisa terkirim sungguhan.'
    );
  }
  const target = normalizePhone(targetPhoneRaw);
  const message = `Kode OTP pemulihan sandi FeelDream Anda: *${otp}*\n\nJangan berikan kode ini kepada siapa pun. Berlaku 5 menit.`;

  const resp = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ target, message })
  });

  const result = await resp.json().catch(() => ({}));
  if (!resp.ok || result.status === false) {
    throw new Error('Gagal mengirim WhatsApp OTP: ' + (result.reason || resp.statusText));
  }
  return result;
}

async function requestOtp(contact) {
  const db = read();
  const OWNER_CONTACT = process.env.OWNER_CONTACT;
  const OWNER_PHONE = process.env.OWNER_PHONE;

  const isOwner = contact === OWNER_CONTACT || contact === OWNER_PHONE;
  const user = db.users.find(u => u.contact === contact);
  if (!isOwner && !user) {
    // Jangan bocorkan apakah akun ada atau tidak (keamanan), tapi tetap beri pesan wajar
    throw new Error('Akun dengan kontak tersebut tidak ditemukan.');
  }

  const otp = generateOtp();
  const hash = await bcrypt.hash(otp, 10);
  db.otps[contact] = { hash, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 };
  write(db);

  // Nomor WA tujuan: kalau contact berupa nomor HP, pakai itu. Kalau email, pakai nomor
  // yang tersimpan di profil user (field waNumber) jika ada, atau nomor owner untuk akun owner.
  let targetPhone = contact;
  if (isEmail(contact)) {
    targetPhone = (user && user.waNumber) || OWNER_PHONE;
  }

  await sendOtpWhatsApp(targetPhone, otp);
  return true;
}

async function verifyOtp(contact, code) {
  const db = read();
  const record = db.otps[contact];
  if (!record) throw new Error('Belum ada kode OTP yang diminta untuk kontak ini.');
  if (Date.now() > record.expiresAt) {
    delete db.otps[contact];
    write(db);
    throw new Error('Kode OTP sudah kedaluwarsa. Silakan minta kode baru.');
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    delete db.otps[contact];
    write(db);
    throw new Error('Terlalu banyak percobaan salah. Silakan minta kode OTP baru.');
  }

  const match = await bcrypt.compare(code, record.hash);
  if (!match) {
    record.attempts += 1;
    write(db);
    throw new Error('Kode OTP salah.');
  }

  // OTP benar -> hapus OTP, buat reset token sekali pakai
  delete db.otps[contact];
  const resetToken = crypto.randomBytes(24).toString('hex');
  db.resetTokens[resetToken] = { contact, expiresAt: Date.now() + RESET_TOKEN_TTL_MS };
  write(db);
  return resetToken;
}

function consumeResetToken(resetToken) {
  const db = read();
  const record = db.resetTokens[resetToken];
  if (!record) throw new Error('Token reset tidak valid. Ulangi proses lupa password dari awal.');
  if (Date.now() > record.expiresAt) {
    delete db.resetTokens[resetToken];
    write(db);
    throw new Error('Token reset sudah kedaluwarsa. Ulangi proses lupa password dari awal.');
  }
  delete db.resetTokens[resetToken];
  write(db);
  return record.contact;
}

module.exports = { requestOtp, verifyOtp, consumeResetToken };
