
import express from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage });

const fileStore = {};

app.post('/upload', upload.array('files'), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploaded = await Promise.all(
    req.files.map(async (file) => {
      const code = nanoid(6).toUpperCase();
      const qr = await QRCode.toDataURL(`${process.env.BASE_URL}/download/${code}`);
      fileStore[code] = { ...file, qr };
      return { filename: file.originalname, code, qr };
    })
  );

  res.json({ files: uploaded });
});

app.get('/download/:code', (req, res) => {
  const file = fileStore[req.params.code];
  if (!file) return res.status(404).send('File not found');
  res.setHeader('Content-Disposition', `attachment; filename=${file.originalname}`);
  res.send(file.buffer);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
