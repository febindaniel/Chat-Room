const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    length: 6,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  creator: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  users: [{
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    joinedAt: { 
      type: Date, 
      default: Date.now 
    },
    socketId: {
      type: String,
      default: null
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  maxUsers: {
    type: Number,
    default: 50
  },
  settings: {
    allowFileUploads: {
      type: Boolean,
      default: true
    },
    allowReactions: {
      type: Boolean,
      default: true
    },
    allowEditing: {
      type: Boolean,
      default: true
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
roomSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
roomSchema.index({ code: 1, isActive: 1 });
roomSchema.index({ createdAt: -1 });

// Virtual for active user count
roomSchema.virtual('activeUserCount').get(function() {
  return this.users ? this.users.length : 0;
});

// Ensure virtual fields are included in JSON output
roomSchema.set('toJSON', { virtuals: true });
roomSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Room', roomSchema);
