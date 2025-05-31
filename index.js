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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:3000', // For local development
  'https://easy2-share-client.vercel.app/', 
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

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/file-sharing', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('MongoDB Connected Successfully');
})
.catch((err) => {
    console.error('MongoDB Connection Error:', err.message);
});

const db = mongoose.connection;
db.on('error', (err) => {
    console.error('MongoDB Connection Error:', err.message);
});
db.once('open', () => {
    console.log('MongoDB Connection Established');
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

const uploadsDir = path.join(__dirname, 'uploads');
try {
    if (!fs.existsSync(uploadsDir)) {
        console.log('Creating uploads directory...');
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('Uploads directory created successfully');
    } else {
        console.log('Uploads directory already exists');
    }
} catch (error) {
    console.error('Error creating uploads directory:', error);
    process.exit(1); 
}

app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage });

app.post('/upload', upload.array('files'), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploadedFilesInfo = [];

  try {
    console.log('Received files:', req.files.map(f => ({ filename: f.filename, size: f.size })));
    
    for (const file of req.files) {
      console.log('Processing file:', file.originalname);
      
      const code = nanoid(6);
      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
      
      console.log('Generated code:', code);
      console.log('File URL:', fileUrl);
      
      const newFile = new File({
          filename: file.filename,
          originalName: file.originalname,
          path: file.path,
          size: file.size,
          code: code,
          fileUrl: fileUrl
      });

      console.log('Attempting to save file to database...');
      await newFile.save();
      console.log('File saved successfully');

      const fileDownloadUrl = `${req.protocol}://${req.get('host')}/download/${code}`;
      console.log('Generating QR code for:', fileDownloadUrl);
      const qr = await QRCode.toDataURL(fileDownloadUrl);

      uploadedFilesInfo.push({
          originalName: file.originalname,
          code: code,
          fileDownloadUrl: fileDownloadUrl,
          qr: qr
      });
    }

    res.json({ success: true, files: uploadedFilesInfo });

  } catch (error) {
    console.error('Detailed upload error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      success: false, 
      error: 'Server error during upload',
      details: error.message 
    });
  }
});

app.get('/download/:code', async (req, res) => {
  try {
    const file = await File.findOne({ code: req.params.code });
    if (!file) {
      return res.status(404).json({ success: false, error: 'Invalid code or file not found' });
    }
    
    res.redirect(file.fileUrl);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: 'Server error during download' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 