const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 50,
    index: true
  },
  currentRoom: {
    type: String,
    default: null,
    maxlength: 6
  },
  socketId: {
    type: String,
    default: null
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    soundEnabled: {
      type: Boolean,
      default: true
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  stats: {
    totalMessages: {
      type: Number,
      default: 0
    },
    roomsJoined: {
      type: Number,
      default: 0
    },
    lastMessageAt: {
      type: Date,
      default: null
    }
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt and lastActive fields before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.isOnline) {
    this.lastActive = Date.now();
  }
  next();
});

// Indexes for efficient queries
userSchema.index({ username: 1 });
userSchema.index({ currentRoom: 1 });
userSchema.index({ socketId: 1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ isOnline: 1, lastActive: -1 });

// Virtual for user status
userSchema.virtual('status').get(function() {
  if (!this.isOnline) return 'offline';

  const now = new Date();
  const lastActive = new Date(this.lastActive);
  const minutesAgo = (now - lastActive) / (1000 * 60);

  if (minutesAgo < 5) return 'online';
  if (minutesAgo < 30) return 'away';
  return 'offline';
});

// Virtual for display name (can be enhanced later)
userSchema.virtual('displayName').get(function() {
  return this.username;
});

// Method to update user activity
userSchema.methods.updateActivity = function() {
  this.lastActive = new Date();
  this.isOnline = true;
  return this.save();
};

// Method to set user offline
userSchema.methods.setOffline = function() {
  this.isOnline = false;
  this.currentRoom = null;
  this.socketId = null;
  return this.save();
};

// Method to join room
userSchema.methods.joinRoom = function(roomCode, socketId) {
  this.currentRoom = roomCode;
  this.socketId = socketId;
  this.isOnline = true;
  this.lastActive = new Date();
  this.stats.roomsJoined += 1;
  return this.save();
};

// Static method to find online users in room
userSchema.statics.findOnlineUsersInRoom = function(roomCode) {
  return this.find({
    currentRoom: roomCode,
    isOnline: true
  }).select('username lastActive preferences.theme');
};

// Static method to cleanup offline users (older than 30 minutes)
userSchema.statics.cleanupOfflineUsers = function() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  return this.updateMany(
    { 
      lastActive: { $lt: thirtyMinutesAgo },
      isOnline: true 
    },
    { 
      $set: { 
        isOnline: false,
        currentRoom: null,
        socketId: null
      } 
    }
  );
};

// Static method to get user statistics
userSchema.statics.getUserStats = function(username) {
  return this.findOne({ username: username })
    .select('stats preferences lastActive createdAt');
};

// Ensure virtual fields are included in JSON output
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// Run cleanup every 5 minutes
if (mongoose.connection.readyState === 1) {
  setInterval(() => {
    mongoose.model('User').cleanupOfflineUsers()
      .then(result => {
        if (result.modifiedCount > 0) {
          console.log(`🧹 Cleaned up ${result.modifiedCount} offline users`);
        }
      })
      .catch(err => console.error('Error cleaning up offline users:', err));
  }, 5 * 60 * 1000); // 5 minutes
}

module.exports = mongoose.model('User', userSchema);