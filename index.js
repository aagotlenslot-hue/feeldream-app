require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const paymentRoutes = require('./routes/payment.routes');
const templateRoutes = require('./routes/templates.routes');
const customsRoutes = require('./routes/customs.routes');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/customs', customsRoutes);

// Foto bukti transfer (hanya untuk admin lihat lewat panel, path acak/tidak ditebak)
app.use('/uploads/payment-proof', express.static(path.join(__dirname, '..', 'uploads', 'payment-proof')));

// Frontend statis
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ FeelDream server berjalan di http://localhost:${PORT}`);
  if (!process.env.FONNTE_TOKEN || process.env.FONNTE_TOKEN.includes('isi-token')) {
    console.warn('⚠️  FONNTE_TOKEN belum diisi — fitur kirim OTP WhatsApp belum akan berfungsi sampai diisi di .env');
  }
});
