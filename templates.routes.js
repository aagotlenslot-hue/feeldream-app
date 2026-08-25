const express = require('express');
const { read, write } = require('../db');
const { authMiddleware, ownerOnly } = require('../auth');

const router = express.Router();

router.get('/', (req, res) => {
  const db = read();
  res.json({ ok: true, templates: db.publicTemplates });
});

router.post('/', authMiddleware, ownerOnly, (req, res) => {
  const { title, desc, thumbnail, rawCode, customizableFields } = req.body;
  if (!title || !rawCode) return res.status(400).json({ error: 'Judul dan Coding HTML wajib diisi!' });

  const db = read();
  const tpl = {
    id: Date.now(),
    title: title.endsWith('.html') ? title : title + '.html',
    desc: desc || 'Template kustom hasil upload owner.',
    thumbnail: thumbnail || 'https://htmlku.com/0/panda/hiya.gif',
    rawCode,
    customizableFields: customizableFields || {}
  };
  db.publicTemplates.push(tpl);
  write(db);
  res.json({ ok: true, template: tpl });
});

router.put('/:index', authMiddleware, ownerOnly, (req, res) => {
  const db = read();
  const idx = Number(req.params.index);
  if (!db.publicTemplates[idx]) return res.status(404).json({ error: 'Template tidak ditemukan.' });

  const { title, desc, thumbnail, rawCode, customizableFields } = req.body;
  db.publicTemplates[idx] = {
    ...db.publicTemplates[idx],
    title: title.endsWith('.html') ? title : title + '.html',
    desc, thumbnail, rawCode,
    customizableFields: customizableFields || {}
  };
  write(db);
  res.json({ ok: true, template: db.publicTemplates[idx] });
});

router.delete('/:index', authMiddleware, ownerOnly, (req, res) => {
  const db = read();
  const idx = Number(req.params.index);
  if (!db.publicTemplates[idx]) return res.status(404).json({ error: 'Template tidak ditemukan.' });
  db.publicTemplates.splice(idx, 1);
  write(db);
  res.json({ ok: true });
});

module.exports = router;
