const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    index: true
  },
  sender: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  message: {
    type: String,
    required: true,
    maxlength: 2000
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'file'],
    default: 'text'
  },
  mediaUrl: {
    type: String,
    default: null,
    maxlength: 500
  },
  mediaName: {
    type: String,
    default: null,
    maxlength: 255
  },
  mediaSize: {
    type: Number,
    default: null
  },
  reactions: {
    type: Map,
    of: [String],
    default: new Map()
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  originalMessage: {
    type: String,
    default: null,
    maxlength: 2000
  },
  deleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  replyTo: {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    senderName: {
      type: String,
      default: null
    },
    snippet: {
      type: String,
      default: null,
      maxlength: 100
    }
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
messageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compound indexes for efficient queries
messageSchema.index({ roomCode: 1, createdAt: -1 });
messageSchema.index({ roomCode: 1, deleted: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

// Virtual for reaction count
messageSchema.virtual('reactionCount').get(function() {
  if (!this.reactions) return 0;
  let count = 0;
  for (let users of this.reactions.values()) {
    count += users.length;
  }
  return count;
});

// Virtual for formatted timestamp
messageSchema.virtual('formattedTime').get(function() {
  return this.createdAt.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
});

// Method to check if user can edit (within 5 minutes and not deleted)
messageSchema.methods.canEdit = function(username) {
  if (this.sender !== username || this.deleted) return false;

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.createdAt > fiveMinutesAgo;
};

// Method to check if user can delete
messageSchema.methods.canDelete = function(username) {
  return this.sender === username && !this.deleted;
};

// Method to add reaction
messageSchema.methods.addReaction = function(emoji, username) {
  if (!this.reactions) {
    this.reactions = new Map();
  }

  const currentReactions = this.reactions.get(emoji) || [];
  if (!currentReactions.includes(username)) {
    currentReactions.push(username);
    this.reactions.set(emoji, currentReactions);
  }

  return this;
};

// Method to remove reaction
messageSchema.methods.removeReaction = function(emoji, username) {
  if (!this.reactions) return this;

  const currentReactions = this.reactions.get(emoji) || [];
  const index = currentReactions.indexOf(username);

  if (index > -1) {
    currentReactions.splice(index, 1);
    if (currentReactions.length === 0) {
      this.reactions.delete(emoji);
    } else {
      this.reactions.set(emoji, currentReactions);
    }
  }

  return this;
};

// Static method to get recent messages for a room
messageSchema.statics.getRecentMessages = function(roomCode, limit = 50) {
  return this.find({ 
    roomCode: roomCode,
    deleted: false 
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .lean();
};

// Static method to get message statistics
messageSchema.statics.getRoomStats = function(roomCode) {
  return this.aggregate([
    { $match: { roomCode: roomCode } },
    {
      $group: {
        _id: null,
        totalMessages: { $sum: 1 },
        deletedMessages: { 
          $sum: { $cond: ['$deleted', 1, 0] } 
        },
        editedMessages: { 
          $sum: { $cond: ['$edited', 1, 0] } 
        },
        mediaMessages: { 
          $sum: { $cond: [{ $ne: ['$type', 'text'] }, 1, 0] } 
        }
      }
    }
  ]);
};

// Ensure virtual fields are included in JSON output
messageSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    // Convert Map to Object for JSON serialization
    if (ret.reactions instanceof Map) {
      ret.reactions = Object.fromEntries(ret.reactions);
    }
    return ret;
  }
});

messageSchema.set('toObject', { 
  virtuals: true,
  transform: function(doc, ret) {
    // Convert Map to Object for object serialization
    if (ret.reactions instanceof Map) {
      ret.reactions = Object.fromEntries(ret.reactions);
    }
    return ret;
  }
});

module.exports = mongoose.model('Message', messageSchema);