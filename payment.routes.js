const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { read, write } = require('../db');
const { authMiddleware, ownerOnly } = require('../auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'payment-proof');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!/image\/(png|jpe?g|webp)/.test(file.mimetype)) {
      return cb(new Error('File harus berupa gambar (png/jpg/webp).'));
    }
    cb(null, true);
  }
});

// ---------- USER: buat permintaan pembayaran ----------
router.post('/request', authMiddleware, (req, res) => {
  const db = read();
  const amount = Number(process.env.PREMIUM_PRICE || 5000);
  const id = crypto.randomBytes(6).toString('hex');

  const paymentReq = {
    id,
    contact: req.authContact,
    amount,
    status: 'pending', // pending | approved | rejected
    proofFile: null,
    createdAt: Date.now()
  };
  db.paymentRequests.push(paymentReq);
  write(db);

  const danaNumber = process.env.DANA_NUMBER;
  const danaOwnerName = process.env.DANA_OWNER_NAME;
  const note = encodeURIComponent(`FeelDream-${id}`);

  res.json({
    ok: true,
    paymentId: id,
    amount,
    danaNumber,
    danaOwnerName,
    // Deep link DANA dengan nominal otomatis terisi + catatan kode unik agar mudah dicocokkan admin
    danaDeepLink: `https://link.dana.id/qr/v2/31300000000000000000?amount=${amount}&note=${note}`,
    instruksi: `Transfer tepat Rp ${amount} ke DANA ${danaNumber} (a.n. ${danaOwnerName}). ` +
      `Cantumkan kode "FeelDream-${id}" di catatan transfer, lalu upload bukti transfer di sini.`
  });
});

// ---------- USER: upload bukti transfer ----------
router.post('/:id/proof', authMiddleware, upload.single('proof'), (req, res) => {
  const db = read();
  const reqPay = db.paymentRequests.find(p => p.id === req.params.id && p.contact === req.authContact);
  if (!reqPay) return res.status(404).json({ error: 'Permintaan pembayaran tidak ditemukan.' });
  if (reqPay.status !== 'pending') return res.status(400).json({ error: 'Permintaan ini sudah diproses.' });
  if (!req.file) return res.status(400).json({ error: 'File bukti transfer wajib diupload.' });

  reqPay.proofFile = req.file.filename;
  write(db);
  res.json({ ok: true, message: 'Bukti transfer diterima. Menunggu konfirmasi Admin (biasanya cepat).' });
});

// ---------- USER: cek status ----------
router.get('/:id/status', authMiddleware, (req, res) => {
  const db = read();
  const reqPay = db.paymentRequests.find(p => p.id === req.params.id && p.contact === req.authContact);
  if (!reqPay) return res.status(404).json({ error: 'Tidak ditemukan.' });
  res.json({ ok: true, status: reqPay.status });
});

// ---------- ADMIN: lihat semua permintaan pending ----------
router.get('/admin/pending', authMiddleware, ownerOnly, (req, res) => {
  const db = read();
  const list = db.paymentRequests
    .filter(p => p.status === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ok: true, list });
});

// ---------- ADMIN: setujui pembayaran -> aktifkan premium ----------
router.post('/admin/:id/approve', authMiddleware, ownerOnly, (req, res) => {
  const db = read();
  const reqPay = db.paymentRequests.find(p => p.id === req.params.id);
  if (!reqPay) return res.status(404).json({ error: 'Tidak ditemukan.' });

  const user = db.users.find(u => u.contact === reqPay.contact);
  if (!user) return res.status(404).json({ error: 'User pemilik permintaan tidak ditemukan.' });

  const durationDays = Number(process.env.PREMIUM_DURATION_DAYS || 60);
  user.isPremium = true;
  user.premiumExpiry = Date.now() + durationDays * 24 * 60 * 60 * 1000;
  reqPay.status = 'approved';

  write(db);
  res.json({ ok: true, message: `Premium ${durationDays} hari diaktifkan untuk ${user.contact}.` });
});

// ---------- ADMIN: tolak pembayaran ----------
router.post('/admin/:id/reject', authMiddleware, ownerOnly, (req, res) => {
  const db = read();
  const reqPay = db.paymentRequests.find(p => p.id === req.params.id);
  if (!reqPay) return res.status(404).json({ error: 'Tidak ditemukan.' });
  reqPay.status = 'rejected';
  write(db);
  res.json({ ok: true, message: 'Permintaan pembayaran ditolak.' });
});

module.exports = router;
