const express = require('express');
const { read, write } = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

function getUser(db, contact) {
  return db.users.find(u => u.contact === contact);
}

router.get('/', authMiddleware, (req, res) => {
  const db = read();
  const user = getUser(db, req.authContact);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
  res.json({ ok: true, customList: user.customList || [] });
});

router.post('/', authMiddleware, (req, res) => {
  const db = read();
  const user = getUser(db, req.authContact);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

  const isOwner = user.contact === process.env.OWNER_CONTACT;
  if (!user.isPremium && !isOwner) {
    return res.status(403).json({ error: 'Simpan kustomisasi khusus akun Premium (60 Hari).' });
  }

  const { index, templateId, projectTitle, fieldValues, rawCode } = req.body;
  const newData = { templateId, projectTitle, fieldValues, rawCode };

  if (!user.customList) user.customList = [];
  let savedIndex;
  if (index === undefined || index === null || index === '') {
    user.customList.push(newData);
    savedIndex = user.customList.length - 1;
  } else {
    user.customList[index] = newData;
    savedIndex = index;
  }
  write(db);
  res.json({ ok: true, index: savedIndex, message: 'Kustomisasi berhasil disimpan.' });
});

router.delete('/:index', authMiddleware, (req, res) => {
  const db = read();
  const user = getUser(db, req.authContact);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
  const idx = Number(req.params.index);
  if (!user.customList || !user.customList[idx]) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  user.customList.splice(idx, 1);
  write(db);
  res.json({ ok: true });
});

module.exports = router;
