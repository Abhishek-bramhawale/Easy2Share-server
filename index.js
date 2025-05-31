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

// Explicitly configure CORS for your frontend origin
const allowedOrigins = [
  'http://localhost:3000', // For local development
  'https://file-sharing-frontend-gold.vercel.app', // YOUR ACTUAL VERCEL FRONTEND URL
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin 
    // (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/file-sharing', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// File Schema (Reverted to include individual code)
const fileSchema = new mongoose.Schema({
    filename: String,
    originalName: String,
    path: String, // Storing the path on the server filesystem
    size: Number,
    code: { type: String, unique: true }, // Individual unique code
    fileUrl: String, // Storing the public URL
    createdAt: { type: Date, default: Date.now }
});

const File = mongoose.model('File', fileSchema);

// Remove Upload Session Schema
// const uploadSessionSchema = new mongoose.Schema({
//     code: { type: String, unique: true },
//     files: [{ type: mongoose.Schema.Types.ObjectId, ref: 'File' }],
//     createdAt: { type: Date, default: Date.now }
// });
// const UploadSession = mongoose.model('UploadSession', uploadSessionSchema);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

// Change to upload.array to handle multiple files
const upload = multer({ storage });

app.post('/upload', upload.array('files'), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploadedFilesInfo = [];

  try {
    for (const file of req.files) {
      const code = nanoid(6); // Generate unique code for each file
       // Construct the public file URL using the determined host and filename
      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
      
      const newFile = new File({
          filename: file.filename,
          originalName: file.originalname,
          path: file.path, // Save the server file path
          size: file.size,
          code: code, // Assign the individual file code
          fileUrl: fileUrl // Save the public URL
      });

      await newFile.save();

      // Generate QR code for the individual file download link
      const fileDownloadUrl = `${req.protocol}://${req.get('host')}/download/${code}`;
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
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: 'Server error during upload' });
  }
});

// This endpoint now fetches a single file by code and redirects
app.get('/download/:code', async (req, res) => {
  try {
    const file = await File.findOne({ code: req.params.code });
    if (!file) {
      return res.status(404).json({ success: false, error: 'Invalid code or file not found' });
    }
    
    // Redirect the user to the static file URL
    res.redirect(file.fileUrl);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: 'Server error during download' });
  }
});

// Remove the /api/session/:sessionCode endpoint
/*
app.get('/api/session/:sessionCode', async (req, res) => {
    try {
        const session = await UploadSession.findOne({ code: req.params.code }).populate('files');
        if (!session) {
            return res.status(404).json({ success: false, error: 'Invalid session code or session not found' });
        }
        res.json({ success: true, files: session.files });

    } catch (error) {
        console.error('Fetch session files error:', error);
        res.status(500).json({ success: false, error: 'Server error fetching session files' });
    }
});
*/

app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 