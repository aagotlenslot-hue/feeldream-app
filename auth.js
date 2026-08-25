const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-JANGAN-DIPAKAI-DI-PRODUKSI';

function signToken(user) {
  return jwt.sign(
    { contact: user.contact, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Silakan masuk (login) terlebih dahulu.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.authContact = payload.contact;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesi login tidak valid atau kedaluwarsa. Silakan masuk kembali.' });
  }
}

function ownerOnly(req, res, next) {
  const OWNER_CONTACT = process.env.OWNER_CONTACT;
  if (req.authContact !== OWNER_CONTACT) {
    return res.status(403).json({ error: 'Khusus untuk Owner/Admin.' });
  }
  next();
}

module.exports = { signToken, authMiddleware, ownerOnly, JWT_SECRET };
