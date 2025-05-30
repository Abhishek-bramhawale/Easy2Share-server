const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { nanoid } = require('nanoid');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});