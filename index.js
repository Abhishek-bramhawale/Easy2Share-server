import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:3000',
  'https://easy2-share-client.vercel.app/'
];

app.use(cors({
  origin: function (origin, callback) {
    
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

const storage = multer.memoryStorage();
const upload = multer({ storage });

const filesDB = {};


function generateCode() {
  return nanoid(6).toUpperCase();
}

app.post('/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploadedFilesInfo = req.files.map(file => {
    const code = generateCode();

    filesDB[code] = {
      originalName: file.originalname,
      buffer: file.buffer, 
      mimeType: file.mimetype,
    };

    return {
      originalName: file.originalname,
      code,
      fileDownloadUrl: `http://localhost:${PORT}/download/${code}`,
    };
  });

  res.json({ files: uploadedFilesInfo });
});

app.get('/download/:code', (req, res) => {
  const code = req.params.code.toUpperCase();

  const fileData = filesDB[code];
  if (!fileData) {
    return res.status(404).send('File not found');
  }

  res.setHeader('Content-Disposition', `attachment; filename="${fileData.originalName}"`);
  res.setHeader('Content-Type', fileData.mimeType);
  res.send(fileData.buffer);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 