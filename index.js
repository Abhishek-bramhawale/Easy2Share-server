
import express from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  'http://localhost:3000', 
  
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

  app.use(express.json());

  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/file-sharing', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

const fileSchema = new mongoose.Schema({
    filename: String,
    originalName: String,
    path: String, 
    size: Number,
    code: { type: String, unique: true }, 
    fileUrl: String, 
    createdAt: { type: Date, default: Date.now }
});

const File = mongoose.model('File', fileSchema);


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
