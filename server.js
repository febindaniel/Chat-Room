const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Import models
const Room = require('./models/Room');
const Message = require('./models/Message');

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for development
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage, 
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatroom')
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Room management
const activeUsers = new Map(); // socketId -> userInfo
const typingUsers = new Map(); // roomCode -> Set of usernames

// API Routes
app.post('/api/rooms', async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim().length === 0) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const roomCode = Math.floor(Math.random() * 900000) + 100000;

    const room = new Room({
      code: roomCode.toString(),
      name: `${username.trim()}'s Room`,
      creator: username.trim(),
      users: []
    });

    await room.save();
    console.log(`🏠 Room created: ${roomCode} by ${username}`);
    res.json({ roomCode: roomCode.toString() });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/rooms/:code', async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code, isActive: true });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json(room);
  } catch (error) {
    console.error('Error getting room:', error);
    res.status(500).json({ error: 'Failed to get room' });
  }
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';

  console.log(`📁 File uploaded: ${req.file.originalname} (${fileType})`);

  res.json({
    filename: req.file.originalname,
    url: fileUrl,
    type: fileType,
    size: req.file.size
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Join room
  socket.on('join-room', async (data) => {
    const { roomCode, username } = data;

    try {
      if (!roomCode || !username) {
        socket.emit('join-error', 'Room code and username are required');
        return;
      }

      const room = await Room.findOne({ code: roomCode, isActive: true });
      if (!room) {
        socket.emit('join-error', 'Room not found');
        return;
      }

      // Leave previous room if any
      const prevUserInfo = activeUsers.get(socket.id);
      if (prevUserInfo) {
        socket.leave(prevUserInfo.roomCode);
      }

      // Add user to room
      socket.join(roomCode);
      activeUsers.set(socket.id, { username: username.trim(), roomCode, socketId: socket.id });

      // Update room users
      const existingUser = room.users.find(user => user.username === username.trim());
      if (!existingUser) {
        room.users.push({ 
          username: username.trim(), 
          joinedAt: new Date(),
          socketId: socket.id
        });
        await room.save();
      }

      // Get recent messages (limit to 50)
      const messages = await Message.find({ roomCode })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      // Reverse to show oldest first
      messages.reverse();

      socket.emit('join-success', { 
        room: room.toObject(),
        messages: messages
      });

      // Notify others
      socket.to(roomCode).emit('user-joined', { username: username.trim() });

      // Update user list for all users in room
      const activeRoomUsers = Array.from(activeUsers.values())
        .filter(user => user.roomCode === roomCode)
        .map(user => ({ username: user.username }));

      io.to(roomCode).emit('users-update', activeRoomUsers);

      console.log(`👤 ${username} joined room ${roomCode}`);

    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('join-error', 'Failed to join room');
    }
  });

// Send message
socket.on('send-message', async (data) => {
  const userInfo = activeUsers.get(socket.id);
  if (!userInfo) {
    console.error('❌ User not authenticated for message sending');
    socket.emit('message-error', 'User not authenticated');
    return;
  }

  const { message, type = 'text', mediaUrl, mediaName } = data;
  
  console.log('📝 Attempting to send message:', {
    user: userInfo.username,
    room: userInfo.roomCode,
    message: message,
    type: type
  });

  try {
    if (type === 'text' && (!message || message.trim().length === 0)) {
      socket.emit('message-error', 'Message cannot be empty');
      return;
    }

    const newMessage = new Message({
      roomCode: userInfo.roomCode,
      sender: userInfo.username,
      message: message ? message.trim() : '',
      type,
      mediaUrl,
      mediaName,
      reactions: {}, // Use plain object instead of Map
      edited: false,
      deleted: false
    });
    
    const savedMessage = await newMessage.save();
    console.log('✅ Message saved successfully:', savedMessage._id);
    
    // Convert to plain object safely
    const messageObj = {
      _id: savedMessage._id,
      roomCode: savedMessage.roomCode,
      sender: savedMessage.sender,
      message: savedMessage.message,
      type: savedMessage.type,
      mediaUrl: savedMessage.mediaUrl,
      mediaName: savedMessage.mediaName,
      reactions: savedMessage.reactions || {},
      edited: savedMessage.edited,
      deleted: savedMessage.deleted,
      createdAt: savedMessage.createdAt
    };
    
    // Emit to all users in the room
    io.to(userInfo.roomCode).emit('new-message', messageObj);
    
    console.log(`💬 Message sent in room ${userInfo.roomCode} by ${userInfo.username}`);
    
  } catch (error) {
    console.error('❌ Error sending message:', error);
    socket.emit('message-error', `Failed to send message: ${error.message}`);
  }
});

// Edit message
socket.on('edit-message', async (data) => {
  const { messageId, newMessage } = data;
  const userInfo = activeUsers.get(socket.id);
  
  if (!userInfo) {
    socket.emit('edit-error', 'User not authenticated');
    return;
  }

  try {
    if (!newMessage || newMessage.trim().length === 0) {
      socket.emit('edit-error', 'Message cannot be empty');
      return;
    }

    const message = await Message.findOne({ 
      _id: messageId, 
      sender: userInfo.username,
      deleted: false 
    });
    
    if (!message) {
      socket.emit('edit-error', 'Message not found or not authorized');
      return;
    }

    // Check if message is too old to edit (5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (message.createdAt < fiveMinutesAgo && !message.edited) {
      socket.emit('edit-error', 'Message too old to edit');
      return;
    }

    message.originalMessage = message.originalMessage || message.message;
    message.message = newMessage.trim();
    message.edited = true;
    message.editedAt = new Date();
    await message.save();
    
    // Convert to plain object safely
    const messageObj = {
      _id: message._id,
      roomCode: message.roomCode,
      sender: message.sender,
      message: message.message,
      type: message.type,
      mediaUrl: message.mediaUrl,
      mediaName: message.mediaName,
      reactions: message.reactions || {},
      edited: message.edited,
      editedAt: message.editedAt,
      originalMessage: message.originalMessage,
      deleted: message.deleted,
      createdAt: message.createdAt
    };
    
    io.to(userInfo.roomCode).emit('message-edited', messageObj);
    
    console.log(`✏️ Message edited by ${userInfo.username}`);
    
  } catch (error) {
    console.error('❌ Error editing message:', error);
    socket.emit('edit-error', 'Failed to edit message');
  }
});

  // Delete message
socket.on('delete-message', async (data) => {
  const { messageId } = data;
  const userInfo = activeUsers.get(socket.id);
  
  if (!userInfo) {
    socket.emit('delete-error', 'User not authenticated');
    return;
  }

  try {
    const message = await Message.findOne({ 
      _id: messageId, 
      sender: userInfo.username,
      deleted: false 
    });
    
    if (!message) {
      socket.emit('delete-error', 'Message not found or not authorized');
      return;
    }

    message.deleted = true;
    message.deletedAt = new Date();
    await message.save();
    
    // Convert to plain object safely
    const messageObj = {
      _id: message._id,
      roomCode: message.roomCode,
      sender: message.sender,
      message: message.message,
      type: message.type,
      mediaUrl: message.mediaUrl,
      mediaName: message.mediaName,
      reactions: message.reactions || {},
      edited: message.edited,
      editedAt: message.editedAt,
      originalMessage: message.originalMessage,
      deleted: message.deleted,
      deletedAt: message.deletedAt,
      createdAt: message.createdAt
    };
    
    io.to(userInfo.roomCode).emit('message-deleted', messageObj);
    
    console.log(`🗑️ Message deleted by ${userInfo.username}`);
    
  } catch (error) {
    console.error('❌ Error deleting message:', error);
    socket.emit('delete-error', 'Failed to delete message');
  }
});

  // Add/remove reaction
  socket.on('toggle-reaction', async (data) => {
    const { messageId, reaction } = data;
    const userInfo = activeUsers.get(socket.id);

    if (!userInfo) return;

    try {
      const message = await Message.findById(messageId);
      if (!message || message.deleted) return;

      if (!message.reactions) {
        message.reactions = new Map();
      }

      const currentReactions = message.reactions.get(reaction) || [];
      const userIndex = currentReactions.indexOf(userInfo.username);

      if (userIndex === -1) {
        // Add reaction
        currentReactions.push(userInfo.username);
        message.reactions.set(reaction, currentReactions);
      } else {
        // Remove reaction
        currentReactions.splice(userIndex, 1);
        if (currentReactions.length === 0) {
          message.reactions.delete(reaction);
        } else {
          message.reactions.set(reaction, currentReactions);
        }
      }

      await message.save();

      const reactionsObj = Object.fromEntries(message.reactions);

      io.to(userInfo.roomCode).emit('reaction-updated', {
        messageId,
        reactions: reactionsObj
      });

    } catch (error) {
      console.error('Reaction error:', error);
    }
  });

  // Typing indicators
  socket.on('typing-start', () => {
    const userInfo = activeUsers.get(socket.id);
    if (!userInfo) return;

    if (!typingUsers.has(userInfo.roomCode)) {
      typingUsers.set(userInfo.roomCode, new Set());
    }

    typingUsers.get(userInfo.roomCode).add(userInfo.username);

    socket.to(userInfo.roomCode).emit('typing-update', {
      typingUsers: Array.from(typingUsers.get(userInfo.roomCode))
    });
  });

  socket.on('typing-stop', () => {
    const userInfo = activeUsers.get(socket.id);
    if (!userInfo) return;

    if (typingUsers.has(userInfo.roomCode)) {
      typingUsers.get(userInfo.roomCode).delete(userInfo.username);

      socket.to(userInfo.roomCode).emit('typing-update', {
        typingUsers: Array.from(typingUsers.get(userInfo.roomCode))
      });
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    const userInfo = activeUsers.get(socket.id);
    if (userInfo) {
      // Remove from typing users
      if (typingUsers.has(userInfo.roomCode)) {
        typingUsers.get(userInfo.roomCode).delete(userInfo.username);
        socket.to(userInfo.roomCode).emit('typing-update', {
          typingUsers: Array.from(typingUsers.get(userInfo.roomCode))
        });
      }

      // Notify others of user leaving
      socket.to(userInfo.roomCode).emit('user-left', { username: userInfo.username });

      // Update active users list
      activeUsers.delete(socket.id);

      const activeRoomUsers = Array.from(activeUsers.values())
        .filter(user => user.roomCode === userInfo.roomCode)
        .map(user => ({ username: user.username }));

      io.to(userInfo.roomCode).emit('users-update', activeRoomUsers);

      console.log(`👋 ${userInfo.username} left room ${userInfo.roomCode}`);
    }

    console.log(`🔌 User disconnected: ${socket.id}`);
  });
});

// Error handling
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }

  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`💾 MongoDB: ${process.env.MONGODB_URI}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ Server and MongoDB connection closed');
      process.exit(0);
    });
  });
});