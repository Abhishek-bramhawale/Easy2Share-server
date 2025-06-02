# Easy2Share Server

A robust backend server for the Easy2Share file sharing application. Built with Node.js and Express, this server handles file uploads, storage, and downloads with MongoDB integration for file metadata management.

## Features

- **File Upload Management**
  - Multiple file upload support
  - File size limit of 150MB per file
  - Automatic file naming and storage
  - Progress tracking for uploads

- **File Sharing**
  - Unique 6-character share codes using nanoid
  - QR code generation for easy sharing
  - Batch file handling
  - Secure file downloads

- **Database Integration**
  - MongoDB integration for file metadata
  - Efficient file tracking and retrieval
  - Automatic file grouping by share code

- **Security Features**
  - CORS protection with allowed origins
  - Secure file streaming
  - Environment variable configuration

## Technical Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- Multer for file handling
- QRCode for QR code generation
- nanoid for unique code generation

## Environment Variables

Create a `.env` file in the server directory with:

PORT=5000
MONGODB_URI=mongodb://localhost:27017/file-sharing or your Mongodb atlas url string.
CLIENT_URL=https://easy2-share-client.vercel.app 


## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

## API Endpoints

### Upload Files
- **POST** `/upload`
  - Accepts multiple files
  - Returns share code and file information

### Download Files
- **GET** `/download/:code`
  - Downloads files associated with the share code
  - Supports single file download with `?file=filename` query parameter

### Upload Progress
- **GET** `/upload-progress/:uploadId`
  - Tracks upload progress for large files

## File Storage

- Files are stored in the `uploads` directory
- Each file is renamed with a timestamp prefix
- Original filenames are preserved in the database

## Security Considerations

- CORS is configured to allow specific origins only
- File size limits are enforced
- Secure file streaming implementation
- Environment variables for sensitive configuration

## Note

This server is designed to work with the Easy2Share client application. Make sure to configure the correct client URL in the environment variables. Github link of client repo is - https://github.com/Abhishek-bramhawale/Easy2Share-client
