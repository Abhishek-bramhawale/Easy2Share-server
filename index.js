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

// Configure Express to trust proxy headers
app.set('trust proxy', true);

const allowedOrigins = [
  'http://localhost:3000',
  'https://easy2-share-client.vercel.app', 
  'https://easy2share-server.onrender.com',
  process.env.AZURE_APP_URL 
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    if (process.env.WEBSITE_INSTANCE_ID) {
      return callback(null, true);
    }
    
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  credentials: true, 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    files: [{
        filename: String,
        originalName: String,
        path: String,
        size: Number,
        fileUrl: String
    }],
    code: { type: String, unique: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 60 * 60 * 1000) } // 1 hour from now
});

fileSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const File = mongoose.model('File', fileSchema);

const isAzure = process.env.WEBSITE_INSTANCE_ID !== undefined;
const uploadsDir = isAzure 
    ? (process.platform === 'win32' ? path.join('D:', 'home', 'uploads') : path.join('/home', 'uploads'))
    : path.join(__dirname, 'uploads'); 

try {
    if (!fs.existsSync(uploadsDir)) {
        console.log('Creating uploads directory...');
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('Uploads directory created successfully at:', uploadsDir);
    } else {
        console.log('Uploads directory already exists at:', uploadsDir);
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

const upload = multer({ 
  storage,
  limits: {
    fileSize: 150 * 1024 * 1024 // 150MB limit
  }
});

async function cleanupExpiredFiles() {
  try {
    const now = new Date();
    const expiredFiles = await File.find({ 
      expiresAt: { $lt: new Date(now.getTime() - 5 * 60 * 1000) } 
    });
    
    for (const fileGroup of expiredFiles) {
      for (const file of fileGroup.files) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log('Deleted expired file:', file.path);
          }
        } catch (err) {
          console.error('Error deleting file:', file.path, err);
        }
      }
    }
    
    if (expiredFiles.length > 0) {
      console.log(`Cleanup completed. Deleted ${expiredFiles.length} expired file groups.`);
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

setInterval(cleanupExpiredFiles, 10 * 60 * 1000);

// Add a route to check upload progress
const uploadProgress = new Map();

app.post('/upload', upload.array('files'), async (req, res) => {
  console.log('Upload endpoint hit:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    hasFiles: !!req.files,
    filesCount: req.files?.length || 0
  });
  
  if (!req.files || req.files.length === 0) {
    console.log('Upload attempt with no files.');
    return res.status(400).json({ error: 'No files uploaded' });
  }

  console.log('Received files for batch upload:', req.files.map(f => ({ filename: f.filename, size: f.size })));
  
  // Generate a single code for multiple files
  const code = nanoid(6);
  console.log('Generated single code for batch:', code);

  // Map all uploaded files to the schema format
  const filesData = req.files.map(file => ({
    filename: file.filename,
    originalName: file.originalname,
    path: file.path,
    size: file.size,
    fileUrl: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
  }));
  
  try {
    // Create a single database entry for the file group
    const newFileGroup = new File({
      files: filesData,
      code: code
    });

    console.log('Attempting to save file group to database with code:', code);
    await newFileGroup.save();
    console.log('File group saved successfully.');

    // Generate download URL and QR code using the single code for the batch
    const fileDownloadUrl = `${req.protocol}://${req.get('host')}/download/${code}`;
    console.log('Generating QR code for batch URL:', fileDownloadUrl);
    const qr = await QRCode.toDataURL(fileDownloadUrl);

    // Prepare the response for the frontend: a single object with batch info
    const batchResponseInfo = {
      // This `files` key holds an array of original names, as expected by frontend rendering
      files: filesData.map(file => file.originalName),
      code: code,
      fileDownloadUrl: fileDownloadUrl,
      qr: qr
    };

    console.log('Sending batch upload response data to frontend:', batchResponseInfo);
    res.json({ 
      success: true, 
      files: [batchResponseInfo]  
    });

  } catch (error) {
    console.error('Detailed upload error during batch processing:', { 
      message: error.message, 
      stack: error.stack, 
      name: error.name,
      code: error.code
    });
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation error', 
        details: error.message 
      });
    }
    
    if (error.code === 'ENOENT') {
      return res.status(500).json({ 
        success: false, 
        error: 'Upload directory not found', 
        details: 'Please check server configuration' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Server error during batch upload', 
      details: error.message 
    });
  }
});

app.get('/upload-progress/:uploadId', (req, res) => {
  const progress = uploadProgress.get(req.params.uploadId);
  if (!progress) {
    return res.status(404).json({ error: 'Upload not found' });
  }
  res.json(progress);
});

app.get('/download/:code', async (req, res) => {
  try {
    console.log('Download request for code:', req.params.code);
    const fileGroup = await File.findOne({ code: req.params.code });
    if (!fileGroup) {
      console.log('No files found for code:', req.params.code);
      return res.status(404).json({ success: false, error: 'Invalid code or files not found' });
    }
    
    if (fileGroup.expiresAt && new Date() > fileGroup.expiresAt) {
      console.log('File expired for code:', req.params.code);
      for (const file of fileGroup.files) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (err) {
          console.error('Error deleting expired file:', file.path, err);
        }
      }
      await File.deleteOne({ code: req.params.code });
      return res.status(410).json({ success: false, error: 'Files have expired (1 hour limit)' });
    }
    
    console.log('Found files:', fileGroup.files.map(f => f.originalName));
    
    // Check if this is a direct browser access (no file parameter and no Accept header for JSON)
    if (!req.query.file && (!req.headers.accept || !req.headers.accept.includes('application/json'))) {
      // Redirect to the client app with the code
      return res.redirect(`${process.env.CLIENT_URL || 'https://easy2-share-client.vercel.app'}?code=${req.params.code}`);
    }
    
    // If no specific file is requested, return the file list
    if (!req.query.file) {
      console.log('Returning file list');
      return res.json({
        success: true,
        files: fileGroup.files.map(file => ({
          filename: file.filename,
          originalName: file.originalName
        }))
      });
    }
    
    // If specific file is requested, stream it
    const fileToDownload = fileGroup.files.find(f => f.filename === req.query.file);
    if (!fileToDownload) {
      console.log('File not found');
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    console.log('Streaming file:', fileToDownload.originalName);
    res.setHeader('Content-Disposition', `attachment; filename="${fileToDownload.originalName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    const fileStream = fs.createReadStream(fileToDownload.path);
    fileStream.pipe(res);
    
    fileStream.on('end', () => {
      console.log('Finished streaming file:', fileToDownload.originalName);
    });
    
    fileStream.on('error', (streamErr) => {
      console.error('Error streaming file:', fileToDownload.originalName, streamErr);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Server error during file streaming' });
      }
    });

  } catch (error) {
    console.error('Download error in catch block:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Server error during download process' });
    }
  }
});

app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Easy2Share Server is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${isAzure ? 'Azure' : 'Local'}`);
  console.log(`Uploads directory: ${uploadsDir}`);
}); 