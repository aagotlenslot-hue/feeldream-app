const express = require('express');
const bcrypt = require('bcryptjs');
const { read, write } = require('../db');
const { signToken, authMiddleware } = require('../auth');
const { requestOtp, verifyOtp, consumeResetToken } = require('../otp');

const router = express.Router();

function publicUser(u) {
  return {
    name: u.name,
    contact: u.contact,
    waNumber: u.waNumber || null,
    isPremium: u.isPremium,
    premiumExpiry: u.premiumExpiry,
    isOwner: u.contact === process.env.OWNER_CONTACT
  };
}

// ---------- REGISTER ----------
router.post('/register', async (req, res) => {
  try {
    const { name, contact, password, waNumber } = req.body;
    if (!name || !contact || !password) {
      return res.status(400).json({ error: 'Semua kolom wajib diisi!' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Kata sandi minimal harus terdiri dari 6 karakter!' });
    }

    const db = read();
    if (contact === process.env.OWNER_CONTACT || contact === process.env.OWNER_PHONE) {
      return res.status(400).json({ error: 'Kontak ini sudah dipakai sistem.' });
    }
    if (db.users.find(u => u.contact === contact)) {
      return res.status(409).json({ error: 'Akun dengan No HP/Email ini sudah terdaftar.' });
    }

    const passHash = await bcrypt.hash(password, 10);
    const newUser = {
      name,
      contact,
      waNumber: waNumber || (/^[0-9+]{8,15}$/.test(contact) ? contact : null),
      passHash,
      isPremium: false,
      premiumExpiry: null,
      customList: []
    };
    db.users.push(newUser);
    write(db);

    res.json({ ok: true, message: 'Pendaftaran berhasil! Silakan masuk.' });
  } catch (e) {
    res.status(500).json({ error: 'Terjadi kesalahan server: ' + e.message });
  }
});

// ---------- LOGIN ----------
router.post('/login', async (req, res) => {
  try {
    const { contact, password } = req.body;
    const db = read();

    const OWNER_CONTACT = process.env.OWNER_CONTACT;
    const OWNER_PHONE = process.env.OWNER_PHONE;

    if (contact === OWNER_CONTACT || contact === OWNER_PHONE) {
      let owner = db.users.find(u => u.contact === OWNER_CONTACT);
      if (!owner) {
        // Buat akun owner otomatis saat pertama kali dijalankan
        const passHash = await bcrypt.hash(process.env.OWNER_INITIAL_PASSWORD || 'owner123w', 10);
        owner = {
          name: 'Aldo (Owner Utama)',
          contact: OWNER_CONTACT,
          waNumber: OWNER_PHONE,
          passHash,
          isPremium: true,
          premiumExpiry: 9999999999999,
          customList: []
        };
        db.users.push(owner);
        write(db);
      }
      const match = await bcrypt.compare(password, owner.passHash);
      if (!match) return res.status(401).json({ error: 'No HP / Email atau Kata Sandi salah!' });
      const token = signToken(owner);
      return res.json({ ok: true, token, user: publicUser(owner) });
    }

    const user = db.users.find(u => u.contact === contact);
    if (!user) return res.status(401).json({ error: 'No HP / Email atau Kata Sandi salah!' });

    const match = await bcrypt.compare(password, user.passHash);
    if (!match) return res.status(401).json({ error: 'No HP / Email atau Kata Sandi salah!' });

    // Cek & update status premium kadaluarsa
    if (user.isPremium && user.premiumExpiry && Date.now() > user.premiumExpiry) {
      user.isPremium = false;
      user.premiumExpiry = null;
      write(db);
    }

    const token = signToken(user);
    res.json({ ok: true, token, user: publicUser(user) });
  } catch (e) {
    res.status(500).json({ error: 'Terjadi kesalahan server: ' + e.message });
  }
});

// ---------- ME ----------
router.get('/me', authMiddleware, (req, res) => {
  const db = read();
  const user = db.users.find(u => u.contact === req.authContact);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
  res.json({ ok: true, user: publicUser(user) });
});

// ---------- LUPA PASSWORD: KIRIM OTP (NYATA lewat WhatsApp) ----------
router.post('/forgot/send-otp', async (req, res) => {
  try {
    const { contact } = req.body;
    if (!contact) return res.status(400).json({ error: 'Masukkan nomor WhatsApp atau Email yang valid!' });
    await requestOtp(contact.trim());
    res.json({ ok: true, message: 'Kode OTP telah dikirim ke WhatsApp Anda.' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- LUPA PASSWORD: VERIFIKASI OTP ----------
router.post('/forgot/verify-otp', async (req, res) => {
  try {
    const { contact, otp } = req.body;
    if (!contact || !otp) return res.status(400).json({ error: 'Kontak dan kode OTP wajib diisi.' });
    const resetToken = await verifyOtp(contact.trim(), otp.trim());
    res.json({ ok: true, resetToken });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- LUPA PASSWORD: SIMPAN PASSWORD BARU ----------
router.post('/forgot/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter!' });
    }
    const contact = consumeResetToken(resetToken);
    const db = read();

    if (contact === process.env.OWNER_CONTACT || contact === process.env.OWNER_PHONE) {
      let owner = db.users.find(u => u.contact === process.env.OWNER_CONTACT);
      const passHash = await bcrypt.hash(newPassword, 10);
      if (owner) {
        owner.passHash = passHash;
      } else {
        db.users.push({
          name: 'Aldo (Owner Utama)',
          contact: process.env.OWNER_CONTACT,
          waNumber: process.env.OWNER_PHONE,
          passHash,
          isPremium: true,
          premiumExpiry: 9999999999999,
          customList: []
        });
      }
      write(db);
      return res.json({ ok: true, message: 'Kata sandi Owner berhasil diperbarui.' });
    }

    const user = db.users.find(u => u.contact === contact);
    if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    user.passHash = await bcrypt.hash(newPassword, 10);
    write(db);
    res.json({ ok: true, message: 'Kata sandi baru berhasil disimpan! Silakan masuk kembali.' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
