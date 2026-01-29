// Full-Featured Chat Application - Client Side
class ChatApp {
  constructor() {
    this.socket = null;
    this.currentUser = { username: '', roomCode: null };
    this.currentTheme = 'light';
    this.soundEnabled = true;
    this.audioContext = null;
    this.typingTimeout = null;
    this.selectedFile = null;
    this.selectedMessageId = null;
    this.isTyping = false;

    this.init();
  }

  init() {
    this.initializeSocket();
    this.bindEvents();
    this.loadSettings();
    this.showScreen('login');
  }

  initializeSocket() {
    this.socket = io('http://localhost:3000', {
    transports: ['websocket', 'polling']
  });
  
    this.socket.on('connect', () => {
    console.log('✅ Connected to server with ID:', this.socket.id);
    this.hideLoading();
  });

     this.socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error);
    this.showToast('Connection failed. Please refresh the page.', 'error');
    this.hideLoading();
  });

     this.socket.on('disconnect', (reason) => {
    console.log('🔌 Disconnected:', reason);
    this.showToast('Connection lost. Reconnecting...', 'error');
  });


    this.socket.on('join-success', (data) => {
  console.log('✅ Join success received:', data);
  this.hideLoading(); // Hide loading first
  
  if (data && data.room) {
    this.currentUser.roomCode = data.room.code;
    this.setupChatRoom(data);
    this.showScreen('chat');
    this.playSound('join');
  } else {
    console.error('Invalid join success data:', data);
    this.showToast('Invalid room data received', 'error');
  }
});

    this.socket.on('join-error', (error) => {
      console.error('Join error:', error);
      this.showError('joinRoomError', error);
    });

    this.socket.on('new-message', (message) => {
      this.addMessageToChat(message);
      if (message.sender !== this.currentUser.username) {
        this.playSound('message');
      }
    });

    this.socket.on('message-edited', (message) => {
      this.updateMessageInChat(message);
    });

    this.socket.on('message-deleted', (message) => {
      this.updateMessageInChat(message);
    });

    this.socket.on('reaction-updated', (data) => {
      this.updateMessageReactions(data.messageId, data.reactions);
    });

    this.socket.on('user-joined', (data) => {
      this.showSystemMessage(`${data.username} joined the room`, 'join');
      this.playSound('join');
    });

    this.socket.on('user-left', (data) => {
      this.showSystemMessage(`${data.username} left the room`, 'leave');
      this.playSound('leave');
    });

    this.socket.on('users-update', (users) => {
      this.updateUsersList(users);
    });

    this.socket.on('typing-update', (data) => {
      this.updateTypingIndicator(data.typingUsers);
    });

    this.socket.on('message-error', (error) => {
      this.showToast(error, 'error');
    });

    this.socket.on('edit-error', (error) => {
      this.showToast(error, 'error');
    });

    this.socket.on('delete-error', (error) => {
      this.showToast(error, 'error');
    });
  }

  bindEvents() {
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', () => {
      this.toggleTheme();
    });

    // Sound toggle
    document.getElementById('soundToggle').addEventListener('click', () => {
      this.toggleSound();
    });

    // Navigation
    document.getElementById('createRoomBtn').addEventListener('click', () => {
      this.showScreen('createRoom');
    });

    document.getElementById('joinRoomBtn').addEventListener('click', () => {
      this.showScreen('joinRoom');
    });

    // Back buttons
    document.getElementById('backToLoginFromCreate').addEventListener('click', () => {
      this.showScreen('login');
    });

    document.getElementById('backToLoginFromJoin').addEventListener('click', () => {
      this.showScreen('login');
    });

    document.getElementById('backToLoginFromCreated').addEventListener('click', () => {
      this.showScreen('login');
    });

    // Forms
    document.getElementById('createRoomForm').addEventListener('submit', (e) => {
      this.handleCreateRoom(e);
    });

    document.getElementById('joinRoomForm').addEventListener('submit', (e) => {
      this.handleJoinRoom(e);
    });

    // Chat functionality
    document.getElementById('enterChatBtn').addEventListener('click', () => {
      this.joinRoom(this.currentUser.roomCode, this.currentUser.username);
    });

    document.getElementById('leaveChatBtn').addEventListener('click', () => {
      this.leaveRoom();
    });

    document.getElementById('copyRoomCodeBtn').addEventListener('click', () => {
      this.copyRoomCode();
    });

    document.getElementById('copyRoomCodeInChat').addEventListener('click', () => {
      this.copyRoomCode();
    });

    // Message sending
    document.getElementById('sendMessageBtn').addEventListener('click', () => {
      this.sendMessage();
    });

    document.getElementById('messageInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      } else {
        this.handleTyping();
      }
    });

    document.getElementById('messageInput').addEventListener('input', () => {
      this.handleTyping();
    });

    // File upload
    document.getElementById('attachFileBtn').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', (e) => {
      this.handleFileSelection(e);
    });

    document.getElementById('removeFileBtn').addEventListener('click', () => {
      this.removeSelectedFile();
    });

    // Modal events
    document.getElementById('closeMediaModal').addEventListener('click', () => {
      this.hideModal('mediaModal');
    });

    document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
      this.confirmDeleteMessage();
    });

    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
      this.hideModal('deleteModal');
    });

    // Context menu
    document.getElementById('editMessageBtn').addEventListener('click', () => {
      this.startEditMessage();
    });

    document.getElementById('deleteMessageBtn').addEventListener('click', () => {
      this.showDeleteConfirmation();
    });

    // Global click handler for context menu
    document.addEventListener('click', (e) => {
      this.hideContextMenu();
      this.hideReactionPicker();
    });

    // Sidebar toggle for mobile
    document.getElementById('toggleSidebar').addEventListener('click', () => {
      this.toggleSidebar();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        this.toggleTheme();
      } else if (e.key === 'm' && e.ctrlKey) {
        e.preventDefault();
        this.toggleSound();
      } else if (e.key === 'Escape') {
        this.hideModal('deleteModal');
        this.hideModal('mediaModal');
        this.hideContextMenu();
        this.hideReactionPicker();
        this.cancelEdit();
      }
    });
  }

  // Screen Management
  showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    document.getElementById(`${screenName}Screen`).classList.add('active');
  }

  showLoading(text = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    loadingText.textContent = text;
    overlay.classList.remove('hidden');
  }

  hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
  }

  // Settings Management
  loadSettings() {
    // In a real app, these would be loaded from localStorage or server
    this.applyTheme(this.currentTheme);
    this.updateSoundButton();
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(this.currentTheme);
    this.showToast(`Switched to ${this.currentTheme} mode`, 'success');
  }

  applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
    themeToggle.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    this.updateSoundButton();
    this.showToast(`Sound ${this.soundEnabled ? 'enabled' : 'disabled'}`, 'info');
  }

  updateSoundButton() {
    const soundToggle = document.getElementById('soundToggle');
    soundToggle.textContent = this.soundEnabled ? '🔊' : '🔇';
    soundToggle.title = this.soundEnabled ? 'Mute Sounds' : 'Enable Sounds';
  }

  // Room Management
  async handleCreateRoom(e) {
    e.preventDefault();
    const username = document.getElementById('createUsername').value.trim();

    if (!username) {
      this.showError('createRoomError', 'Username is required');
      return;
    }

    this.showLoading('Creating room...');

    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      const data = await response.json();

      if (response.ok) {
        this.currentUser.username = username;
        this.currentUser.roomCode = data.roomCode;
        document.getElementById('generatedRoomCode').textContent = data.roomCode;
        this.showScreen('roomCreated');
      } else {
        this.showError('createRoomError', data.error || 'Failed to create room');
      }
    } catch (error) {
      this.showError('createRoomError', 'Network error. Please try again.');
    } finally {
      this.hideLoading();
    }
  }

  async handleJoinRoom(e) {
    e.preventDefault();
    const username = document.getElementById('joinUsername').value.trim();
    const roomCode = document.getElementById('roomCodeInput').value.trim();

    if (!username || !roomCode) {
      this.showError('joinRoomError', 'Username and room code are required');
      return;
    }

    if (roomCode.length !== 6) {
      this.showError('joinRoomError', 'Room code must be 6 digits');
      return;
    }

    this.joinRoom(roomCode, username);
  }

  joinRoom(roomCode, username) {
    this.showLoading('Joining room...');
    this.currentUser.username = username;
    this.currentUser.roomCode = roomCode;

    this.socket.emit('join-room', { roomCode, username });
  }

  leaveRoom() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.connect();
    }
    this.currentUser = { username: '', roomCode: null };
    this.showScreen('login');
    this.showToast('Left the room', 'info');
  }

  setupChatRoom(data) {
    document.getElementById('chatRoomCode').textContent = data.room.code;
    document.getElementById('chatUsername').textContent = this.currentUser.username;

    // Load existing messages
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';

    data.messages.forEach(message => {
      this.addMessageToChat(message, false);
    });

    // Update users list
    this.updateUsersList(data.room.users || []);

    // Scroll to bottom
    this.scrollToBottom();
  }

  // Message Management
  sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message && !this.selectedFile) {
      return;
    }

    this.stopTyping();

    if (this.selectedFile) {
      this.sendMediaMessage(message);
    } else {
      this.socket.emit('send-message', { message, type: 'text' });
    }

    input.value = '';
    this.removeSelectedFile();
    input.focus();
  }

  async sendMediaMessage(message) {
    const formData = new FormData();
    formData.append('file', this.selectedFile);

    try {
      this.showLoading('Uploading file...');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        this.socket.emit('send-message', {
          message: message || `Shared ${data.type}`,
          type: data.type,
          mediaUrl: data.url,
          mediaName: data.filename
        });
      } else {
        this.showToast(data.error || 'Upload failed', 'error');
      }
    } catch (error) {
      this.showToast('Upload failed', 'error');
    } finally {
      this.hideLoading();
    }
  }

  addMessageToChat(message, animate = true) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageElement = this.createMessageElement(message);

    if (animate) {
      messageElement.style.opacity = '0';
      messageElement.style.transform = 'translateY(20px)';
    }

    messagesContainer.appendChild(messageElement);

    if (animate) {
      requestAnimationFrame(() => {
        messageElement.style.transition = 'all 0.3s ease';
        messageElement.style.opacity = '1';
        messageElement.style.transform = 'translateY(0)';
      });
    }

    this.scrollToBottom();
  }

  createMessageElement(message) {
    let actionButtons = ''; // default empty

    // Show reaction emoji button ONLY for messages NOT sent by current user
    if (message.sender !== this.currentUser.username && !message.deleted) {
    actionButtons = `
    <div class="message-actions">
      <button class="message-action-btn" onclick="chatApp.showReactionPicker(event)" title="Add Reaction">😊</button>
    </div>
    `;
    }
    const div = document.createElement('div');
    div.className = `message ${message.sender === this.currentUser.username ? 'message--own' : ''}`;
    div.setAttribute('data-message-id', message._id);

    if (message.deleted) {
      div.classList.add('message--deleted');
    }

    const timestamp = new Date(message.createdAt).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    let mediaContent = '';
    if (message.type === 'image' && message.mediaUrl) {
      mediaContent = `<div class="message__media">
        <img src="${message.mediaUrl}" alt="${message.mediaName}" onclick="chatApp.showMediaPreview('${message.mediaUrl}', 'image')">
      </div>`;
    } else if (message.type === 'video' && message.mediaUrl) {
      mediaContent = `<div class="message__media">
        <video controls>
          <source src="${message.mediaUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      </div>`;
    }

    const reactionsHTML = this.createReactionsHTML(message.reactions || {}, message._id);

    const editedIndicator = message.edited ? '<span class="message__edited">(edited)</span>' : '';

    const messageText = message.deleted ? 
      '<em>This message was deleted</em>' : 
      this.escapeHtml(message.message);

    div.innerHTML = `
    <div class="message__content">
    <div class="message__sender">${this.escapeHtml(message.sender)}</div>
    <div class="message__text">${messageText}</div>
    ${mediaContent}
    ${reactionsHTML}
    ${actionButtons}
    <div class="message__timestamp">${timestamp}${editedIndicator}</div>
    </div>
    `;

    // Add event listeners
    this.addMessageEventListeners(div, message);

    return div;
  }

  createMessageActionsHTML() {
    return `
      <div class="message-actions">
        <button class="message-action-btn" onclick="chatApp.showReactionPicker(event)" title="Add Reaction">😊</button>
        <button class="message-action-btn" onclick="chatApp.showMessageContextMenu(event)" title="More Options">⋮</button>
      </div>
    `;
  }

  createReactionsHTML(reactions, messageId) {
    if (!reactions || Object.keys(reactions).length === 0) {
      return '<div class="message__reactions"></div>';
    }

    const reactionsHTML = Object.entries(reactions)
      .filter(([, users]) => users.length > 0)
      .map(([emoji, users]) => {
        const isActive = users.includes(this.currentUser.username);
        return `
          <span class="reaction ${isActive ? 'reaction--active' : ''}" 
                onclick="chatApp.toggleReaction('${messageId}', '${emoji}')"
                title="${users.join(', ')}">
            ${emoji} ${users.length}
          </span>
        `;
      }).join('');

    return `<div class="message__reactions">${reactionsHTML}</div>`;
  }

  addMessageEventListeners(messageElement, message) {
    // Double-click to edit (own messages only)
    if (message.sender === this.currentUser.username && !message.deleted) {
      messageElement.addEventListener('dblclick', () => {
        this.startEditMessage(message._id);
      });
    }

    // Right-click context menu
    messageElement.addEventListener('contextmenu', (e) => {
      if (message.sender === this.currentUser.username && !message.deleted) {
        e.preventDefault();
        this.showMessageContextMenu(e, message._id);
      }
    });
  }

  updateMessageInChat(message) {
    const messageElement = document.querySelector(`[data-message-id="${message._id}"]`);
    if (messageElement) {
      const newElement = this.createMessageElement(message);
      messageElement.replaceWith(newElement);
    }
  }

  updateMessageReactions(messageId, reactions) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      const reactionsContainer = messageElement.querySelector('.message__reactions');
      if (reactionsContainer) {
        reactionsContainer.innerHTML = this.createReactionsHTML(reactions, messageId).replace('<div class="message__reactions">', '').replace('</div>', '');
      }
    }
  }

  // Message Actions
  showMessageContextMenu(event, messageId = null) {
    event.preventDefault();
    event.stopPropagation();

    this.selectedMessageId = messageId || event.target.closest('.message').getAttribute('data-message-id');

    const contextMenu = document.getElementById('messageContextMenu');
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.classList.remove('hidden');
  }

  hideContextMenu() {
    document.getElementById('messageContextMenu').classList.add('hidden');
  }

  startEditMessage(messageId = null) {
    this.hideContextMenu();

    const targetMessageId = messageId || this.selectedMessageId;
    const messageElement = document.querySelector(`[data-message-id="${targetMessageId}"]`);

    if (!messageElement) return;

    const textElement = messageElement.querySelector('.message__text');
    const originalText = textElement.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'message-edit-input';
    input.value = originalText;
    input.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 2px solid var(--color-primary);
      border-radius: 4px;
      background: var(--color-background);
      color: var(--color-text);
      font-size: inherit;
    `;

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '✓';
    saveBtn.className = 'btn btn--sm btn--primary';
    saveBtn.style.marginLeft = '8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '✗';
    cancelBtn.className = 'btn btn--sm btn--outline';
    cancelBtn.style.marginLeft = '4px';

    const editContainer = document.createElement('div');
    editContainer.appendChild(input);
    editContainer.appendChild(saveBtn);
    editContainer.appendChild(cancelBtn);

    textElement.replaceWith(editContainer);
    input.focus();
    input.select();

    const saveEdit = () => {
      const newText = input.value.trim();
      if (newText && newText !== originalText) {
        this.socket.emit('edit-message', {
          messageId: targetMessageId,
          newMessage: newText
        });
      }
      this.cancelEdit(editContainer, originalText);
    };

    const cancelEdit = () => {
      this.cancelEdit(editContainer, originalText);
    };

    saveBtn.addEventListener('click', saveEdit);
    cancelBtn.addEventListener('click', cancelEdit);

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    });
  }

  cancelEdit(editContainer, originalText) {
    if (!editContainer) {
      // Find any active edit containers
      const activeEdit = document.querySelector('.message-edit-input');
      if (activeEdit) {
        editContainer = activeEdit.parentElement;
        originalText = 'Message';
      } else {
        return;
      }
    }

    const textElement = document.createElement('div');
    textElement.className = 'message__text';
    textElement.textContent = originalText;
    editContainer.replaceWith(textElement);
  }

  showDeleteConfirmation() {
    this.hideContextMenu();
    this.showModal('deleteModal');
  }

  confirmDeleteMessage() {
    if (this.selectedMessageId) {
      this.socket.emit('delete-message', { messageId: this.selectedMessageId });
    }
    this.hideModal('deleteModal');
  }

  // Reactions
  showReactionPicker(event) {
    event.preventDefault();
    event.stopPropagation();

    this.selectedMessageId = event.target.closest('.message').getAttribute('data-message-id');

    const picker = document.getElementById('reactionPicker');
    picker.style.left = event.pageX + 'px';
    picker.style.top = (event.pageY - 50) + 'px';
    picker.classList.remove('hidden');

    // Add event listeners to reaction buttons
    picker.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.toggleReaction(this.selectedMessageId, btn.dataset.reaction);
        this.hideReactionPicker();
      };
    });
  }

  hideReactionPicker() {
    document.getElementById('reactionPicker').classList.add('hidden');
  }

  toggleReaction(messageId, reaction) {
    this.socket.emit('toggle-reaction', { messageId, reaction });
  }

  // File Handling
  handleFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      this.showToast('File too large. Maximum size is 10MB.', 'error');
      return;
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];
    if (!allowedTypes.includes(file.type)) {
      this.showToast('File type not supported.', 'error');
      return;
    }

    this.selectedFile = file;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('filePreview').classList.remove('hidden');
  }

  removeSelectedFile() {
    this.selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').classList.add('hidden');
  }

  showMediaPreview(mediaUrl, type) {
    const preview = document.getElementById('mediaPreview');

    if (type === 'image') {
      preview.innerHTML = `<img src="${mediaUrl}" alt="Preview">`;
    } else if (type === 'video') {
      preview.innerHTML = `<video controls><source src="${mediaUrl}"></video>`;
    }

    this.showModal('mediaModal');
  }

  // Typing Indicators
  handleTyping() {
    if (!this.isTyping) {
      this.isTyping = true;
      this.socket.emit('typing-start');
    }

    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.stopTyping();
    }, 3000);
  }

  stopTyping() {
    if (this.isTyping) {
      this.isTyping = false;
      this.socket.emit('typing-stop');
      clearTimeout(this.typingTimeout);
    }
  }

  updateTypingIndicator(typingUsers) {
    const indicator = document.getElementById('typingIndicator');
    const text = document.getElementById('typingText');

    // Remove current user from typing users
    const otherUsers = typingUsers.filter(user => user !== this.currentUser.username);

    if (otherUsers.length === 0) {
      indicator.classList.add('hidden');
      return;
    }

    let message = '';
    if (otherUsers.length === 1) {
      message = `${otherUsers[0]} is typing...`;
    } else if (otherUsers.length === 2) {
      message = `${otherUsers[0]} and ${otherUsers[1]} are typing...`;
    } else {
      message = `${otherUsers[0]}, ${otherUsers[1]}, and ${otherUsers.length - 2} others are typing...`;
    }

    text.textContent = message;
    indicator.classList.remove('hidden');
  }

  // User Management
  updateUsersList(users) {
    const usersList = document.getElementById('usersList');
    const usersCount = document.getElementById('activeUsersCount');

    usersCount.textContent = users.length;

    usersList.innerHTML = users.map(user => {
      const initial = user.username.charAt(0).toUpperCase();
      return `
        <div class="user-item">
          <div class="user-avatar">${initial}</div>
          <span class="user-name">${this.escapeHtml(user.username)}</span>
          <div class="user-status"></div>
        </div>
      `;
    }).join('');
  }

  showSystemMessage(message, type) {
    const messagesContainer = document.getElementById('messagesContainer');
    const systemMessage = document.createElement('div');
    systemMessage.className = 'system-message';
    systemMessage.style.cssText = `
      text-align: center;
      padding: 8px;
      margin: 8px 0;
      font-size: 0.875rem;
      color: var(--color-text-muted);
      font-style: italic;
    `;

    const icon = type === 'join' ? '👋' : type === 'leave' ? '🚪' : 'ℹ️';
    systemMessage.textContent = `${icon} ${message}`;

    messagesContainer.appendChild(systemMessage);
    this.scrollToBottom();
  }

  // Audio
  playSound(type) {
    if (!this.soundEnabled) return;

    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Different frequencies for different events
      const frequencies = {
        message: 800,
        join: 600,
        leave: 400
      };

      oscillator.frequency.setValueAtTime(frequencies[type] || 500, this.audioContext.currentTime);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.3);

    } catch (error) {
      console.log('Audio not supported or blocked');
    }
  }

  // UI Helpers
  showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    document.body.style.overflow = '';
  }

  showToast(message, type = 'success') {
    const toast = document.getElementById('copyToast');
    const toastMessage = toast.querySelector('.toast-message');

    toastMessage.textContent = message;

    // Update toast style based on type
    toast.className = `toast toast--${type}`;
    toast.classList.remove('hidden');

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }

  showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');

    setTimeout(() => {
      errorElement.classList.add('hidden');
    }, 5000);
  }

  copyRoomCode() {
    const roomCode = this.currentUser.roomCode || 
                    document.getElementById('generatedRoomCode').textContent ||
                    document.getElementById('chatRoomCode').textContent;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(roomCode).then(() => {
        this.showToast('Room code copied to clipboard!', 'success');
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = roomCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.showToast('Room code copied to clipboard!', 'success');
    }
  }

  toggleSidebar() {
    const sidebar = document.getElementById('usersSidebar');
    sidebar.classList.toggle('show');
  }

  scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.chatApp = new ChatApp();
});

// Add some CSS for toast types
const style = document.createElement('style');
style.textContent = `
  .toast--success { background: var(--color-success); }
  .toast--error { background: var(--color-danger); }
  .toast--info { background: var(--color-info); }
  .toast--warning { background: var(--color-warning); }

  .message-edit-input {
    width: 100%;
    padding: 8px;
    border: 2px solid var(--color-primary);
    border-radius: 4px;
    background: var(--color-background);
    color: var(--color-text);
    font-size: inherit;
  }
`;
document.head.appendChild(style);