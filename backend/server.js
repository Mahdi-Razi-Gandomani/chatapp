

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const onlineUsers = new Map();
const socks = new Map();


const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: {
    origin: process.env.CLIENT_URL}
  });

const redis = new Redis( {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD
});


const uploadsDir = path.join(__dirname, 'uploads');
const audioDir = path.join(uploadsDir, 'audio');
const filesDir = path.join(uploadsDir, 'files');

[audioDir, filesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
});

// multer for audio file uploads
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, audioDir),
  filename: (req, file, cb) => { const us = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'voice-' + us + path.extname(file.originalname));
  }
});


const modelsDir = path.join(__dirname, 'models');
if (!fs.existsSync(modelsDir)){
  fs.mkdirSync(modelsDir, {recursive: tru});
}

const audioUpload = multer({
  storage: audioStorage, limits: {fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ok = ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg'];
    if (ok.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// multer for general file uploads
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, filesDir),
  filename: (req, file, cb) => {
    const us = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const name = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, us + '-' + name);
  }
});

const fileUpload = multer({
  storage: fileStorage,
  limits: {fileSize: 25 * 1024 * 1024},
  fileFilter: (req, file, cb) => {
    const block = ['.exe', '.bat', '.cmd', '.sh', '.app', '.dmg', '.deb', '.rpm'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (block.includes(fileExt)) {
      cb(new Error('Executable files are not allowed.'));
    } else {
      cb(null, true);
    }
  }
});


// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(helmet());
app.use(cors({origin: process.env.CLIENT_URL,credentials: true}));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({extended: true, limit: '10mb'}));



const authLimiter = rateLimit({windowMs:600000,max: 5});

const apiLimiter = rateLimit({windowMs:60000, max: 100});


// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));


// Mongoose schema
// User Schema
const userSchema = new mongoose.Schema({
  username: {type: String, required: true, unique: true, trim: true}, fullName: {type: String, trim: true, required: true},
  email: {type: String, required: true, unique: true, lowercase: true, trim: true},
  password: {type: String, required: true, select: false },
  avatar: {type: String, default: '' },
  status: {type: String, enum: ['online', 'offline'], default: 'offline'},
  lastSeen: {type: Date, default: Date.now },
  bio: {type: String, default: ''},
  // blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friends: [{type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: {type: Date, default: Date.now}, updatedAt: {type: Date, default: Date.now}
});

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  this.updatedAt = Date.now();
  next();
});

userSchema.methods.comparePassword = async function(p) {
  return await bcrypt.compare(p, this.password);
};

const User = mongoose.model('User', userSchema);


// Message Schema
const messaegeSch = new mongoose.Schema( {
  convId: {type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true},
  senderId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  content: {type: String, required: true, maxlength: 10000},
  type: {type: String, enum: ['text', 'audio', 'file'], default: 'text'},
  fileUrl: {type: String}, fileName: {type: String}, fileSize: {type: Number} , mimeType: {type: String}, duration: {type: Number}, 
  status: {type: String, enum: ['sent', 'delivered', 'read'], default: 'sent'},
  deliveredTo: [{ 
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    deliveredAt: {type: Date, default: Date.now }
  }],
  readBy: [{ 
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    readAt: {type: Date, default: Date.now}
    }
  ],replyTo: {type: mongoose.Schema.Types.ObjectId, ref: 'Message'},
  createdAt: {type: Date, default: Date.now}
});
messaegeSch.index({convId: 1, createdAt: -1});
messaegeSch.index({senderId: 1, createdAt: -1 });
const Message = mongoose.model('Message', messaegeSch);

// Conversation Schema
const convSh = new mongoose.Schema( {
  type: {type: String, enum: ['private', 'group'], required: true},
  name: {type: String}, description: {type: String}, avatar: {type: String},
  participants: [{
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    role: {type: String, enum: ['admin', 'member'], default: 'member'},
    joinedAt: {type: Date, default: Date.now}, unreadCount: {type: Number, default: 0}
    // mutedUntil: { type: Date }
  }],
  lastMessage: {type: mongoose.Schema.Types.ObjectId, ref: 'Message'}, lastmsgTime: { type: Date, default: Date.now },
  createdBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'}, createdAt: {type: Date, default: Date.now },
  updatedAt: {type: Date, default: Date.now }
});

convSh.index({participants: 1, lastmsgTime: -1});
convSh.index({type: 1, participants: 1});
const Conversation = mongoose.model('Conversation', convSh);

// Friend Request Schema
const frienRequestSch = new mongoose.Schema({
  senderId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  recipientId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  status: {type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending'},
  createdAt: {type: Date, default: Date.now}, respondedAt: {type: Date}
});

frienRequestSch.index({senderId: 1, recipientId: 1});
frienRequestSch.index({recipientId: 1, status: 1});
const FriendRequest = mongoose.model('FriendRequest', frienRequestSch);


// JWT middleware
const authToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    //401?
    return res.status(401).json({error: 'Access token required'});
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({error: 'user not found'});
    }
    req.userDoc = user;
    next();
  } catch {
    return res.status(403).json({error: 'Invalid token'});
  }
};




// Health API
app.get('/health', (req, res) => {
  res.json( { 
    status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: redis.status === 'ready' ? 'connected' : 'disconnected'
  });
});


// User registration
app.post('/api/auth/register', authLimiter, [
  body('username').trim().isLength({min: 4, max: 20}).withMessage('Username must be between 4 and 20 character').matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscore'),
  body('fullName').trim().isLength({max: 100}), 
  body('email').isEmail().withMessage('Must be a valid email').normalizeEmail(),
  body('password').isLength({min: 8, max: 50}).withMessage('Password must be between 8 and 50 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({error: errors.array()[0].msg, errors: errors.array()});
  }

  try {
    const {username, fullName, email, password, avatar} = req.body;
    
    // Check if user already exists
    const existing = await User.findOne({$or: [{email}, {username}]});
    if (existing) {
      return res.status(409).json({error: 'User already exists with this email or username'});
    }

    // Create new user
    const user = new User({username, fullName, email, password, avatar});
    await user.save();
    const token = jwt.sign(
      {userId: user._id, username: user.username},
      process.env.JWT_SECRET,
      {expiresIn: '7d'}
    );

    res.status(201).json({
      message: 'User registered succesfully', token, user: {
        id: user._id, username: user.username, fullName: user.fullName, email: user.email, avatar: user.avatar, status: user.status
      }
    });
  } catch{
    res.status(500).json({error: 'Server error while registration'});
  }
});


// User Login
app.post('/api/auth/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }

  try {
    const {email, password} = req.body;
    const user = await User.findOne({email}).select('+password');
    if (!user) {
      return res.status(401).json({error: 'Invalid email or password'});
    }

    // Verify password
    const validPass = await user.comparePassword(password);
    if (!validPass) {
      return res.status(401).json({error: 'Invalid password'});
    }

    // Update last seen
    user.lastSeen = Date.now();
    await user.save();

    // Generate jwt token
    const token = jwt.sign({userId: user._id, username: user.username},
      process.env.JWT_SECRET,
      {expiresIn: '7d'}
    );

    res.json(
      {
      message: 'Login succesful', token, user: {
        id: user._id, username: user.username,  fullName: user.fullName, email: user.email, avatar: user.avatar, status: user.status, bio: user.bio
      }
    });
  } catch{
    res.status(500).json({error: 'Server error in login'});
  }
});


// Get profle
app.get('/api/users/me', authToken, async (req, res) => {
  try {
    res.json({
      user:{
        id: req.userDoc._id, username: req.userDoc.username, fullName: req.userDoc.fullName, email: req.userDoc.email, avatar: req.userDoc.avatar, status: req.userDoc.status,
        bio: req.userDoc.bio, lastSeen: req.userDoc.lastSeen
      }
    });
  } catch
    {
    res.status(500).json({error: 'Server error'});
    }
  });

// Update profile
app.put('/api/users/me', authToken, [
  body('username').optional().trim().isLength({min: 4, max: 20}),
  body('fullName').optional().trim().isLength({max: 100}),
  body('bio').optional().trim().isLength({max: 500}),
  body('avatar').optional().trim()], async (req, res) => {
    const errors = validationResult(req);
  if (!errors.isEmpty()) {
      return res.status(400).json({errors: errors.array()});
    }

  try {
    const {username, fullName, bio, avatar} = req.body;
    const updates = {};
    if (username) updates.username = username;
    if (fullName !== undefined) updates.fullName = fullName;
    if (bio !== undefined) updates.bio = bio;
    if (avatar) updates.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.user.userId, updates, {new: true, runValidators: true});

    // res.json({
    //   message: 'Profile updated succesfully', user: {
    //     id: user._id, username: user.username, fullName: user.fullName,email: user.email, avatar: user.avatar, bio: user.bio, status: user.status
    //   }
    // });
  } catch (e) {
    res.status(500).json(e);
  }
});

// Search Users
app.get('/api/users/search', authToken, apiLimiter, async (req, res) => {
  try {
    const {q} = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({error: 'Enter at least 2 characters'});
    }

    const users = await User.find({
      _id: { $ne: req.user.userId },
      $or: [
        {username: {$regex: q, $options: 'i'}},
        {email: {$regex: q, $options: 'i'}}
      ]
    })
    .select('username email avatar status lastSeen bio')
    .limit(20);

    res.json({users});

  } catch {
    res.status(500).json({error: 'Server error'});
  }
});



////////FRIENDS

// Send friend request
app.post('/api/friends/request', authToken, [
  body('recipientId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }

  try {
    const {recipientId} = req.body;
    

    // Check if user exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({error: 'User not found'});
    }

    // Check if already friends
    const cu = await User.findById(req.user.userId);
    if (cu.friends.includes(recipientId)) {
      return res.status(400).json({error: 'Already friends with this user'});
    }

    // Check if request already exists
    const existRequest = await FriendRequest.findOne( {
      $or:[ {senderId: req.user.userId, recipientId: recipientId, status: 'pending'}, {senderId: recipientId, recipientId: req.user.userId, status: 'pending'}]
    });

    if (existRequest) {
      return res.status(400).json({ error: 'friend request already exists.'});
    }

    // Create friend request
    const friendRequest = new FriendRequest({senderId: req.user.userId, recipientId: recipientId});

    await friendRequest.save();
    await friendRequest.populate('senderId', 'username avatar bio');

    // Send notification
    const recSock = onlineUsers.get(recipientId);
    if (recSock) {
      io.to(recSock).emit('friend:request', {request: friendRequest});
    }

    res.status(201).json({message: 'Friend request sent', request: friendRequest});
  } catch (e) {
    res.status(500).json(e);
  }
});

// Get friend requests from received
app.get('/api/friends/requests/received', authToken, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      recipientId: req.user.userId, status: 'pending'
    })
    .populate('senderId', 'username avatar bio status lastSeen bio')
    .sort({createdAt: -1});

    res.json({requests});

  } catch (e) {
    res.status(500).json(e);
  }
});

app.get('/api/friends/requests/sent', authToken, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      senderId: req.user.userId, status: 'pending'
    })
    .populate('recipientId', 'username avatar bio status lastSeen bio')
    .sort({createdAt: -1});

    res.json({ requests });

  } catch (e) {
    res.status(500).json(e);
  }
});

// Accept friend request
app.post('/api/friends/request/:requestId/accept', authToken, async (req, res) => {
  try {
    const {requestId} = req.params;
    const friendRequest = await FriendRequest.findOne({_id: requestId, recipientId: req.user.userId, status: 'pending'});

    if (!friendRequest) {
      return res.status(404).json({error: 'Friend request not found'});
    }

    friendRequest.status = 'accepted';
    friendRequest.respondedAt = Date.now();
    await friendRequest.save();

    // Add both to each other's friends
    await User.findByIdAndUpdate(req.user.userId, {$addToSet: {friends: friendRequest.senderId}});
    await User.findByIdAndUpdate(friendRequest.senderId, {$addToSet: {friends: req.user.userId}});


    const sendSock = onlineUsers.get(friendRequest.senderId.toString());
    if (sendSock) {
      io.to(sendSock).emit('friend:accepted', {userId: req.user.userId,username: req.userDoc.username});
    }

    res.json({message: 'Friend request accepted'});

  } catch (er) {
    res.status(500).json(er);
  }
});

// Decline friend request
app.post('/api/friends/request/:requestId/decline', authToken, async (req, res) => {
  try {
    const {requestId} = req.params;
    const friendRequest = await FriendRequest.findOne({
      _id: requestId, recipientId: req.user.userId, status: 'pending'
    });

    if (!friendRequest) {
      return res.status(404).json({error: 'friend request not found'});
    }

    friendRequest.status = 'declined';
    friendRequest.respondedAt = Date.now();

    await friendRequest.save();
    res.json({message: 'Friend request declined'});

  } catch (er) {
    res.status(500).json(er);
  }
});

// Get friend list
app.get('/api/friends', authToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('friends', 'username avatar bio status lastSeen bio');

    res.json({friends: user.friends || []});
  } catch (er) {
    res.status(500).json(er);
  }
});

// Cancel request for sender
app.delete('/api/friends/request/:requestId', authToken, async (req, res) => {
  try {
    const {requestId} = req.params;
    const friendRequest = await FriendRequest.findOne( {
      _id: requestId, senderId: req.user.userId,status: 'pending'
    });

    if (!friendRequest) {
      return res.status(404).json( {error: 'Friend request not found'});
    }

    const recipientId = friendRequest.recipientId.toString();
    await friendRequest.deleteOne();
    
    const recSock = onlineUsers.get(recipientId);
    if (recSock) {
      io.to(recSock).emit('friend:request:cancelled', {requestId: requestId});
    }
    
    res.json({message: 'Friend request cancelled'});

  } catch (er) {
    res.status(500).json(er);
  }
});



// Get User Conversations
app.get('/api/conversations', authToken, apiLimiter, async (req, res) => {
  try {
    const conversations = await Conversation.find({'participants.userId': req.user.userId})
    .populate('participants.userId', 'username avatar status lastSeen bio')
    .populate('lastMessage').sort({lastmsgTime: -1}).limit(50);
    res.json({conversations});
    
  } catch (e) {
    // console.error('errrrrr: ', e);
    res.status(500).json(e);
    }
});


// Private chat
app.post('/api/conversations/private', authToken, [
  body('recipientId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }

  try {
    const {recipientId} = req.body;
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({error: 'User not found'});
    }

    const existingConv = await Conversation.findOne( {
      type: 'private', 'participants.userId': {$all: [req.user.userId, recipientId]}
    });

    if (existingConv) {
      return res.json({conversation: existingConv});
    }


    // Create new conversation
    const conversation = new Conversation({
      type: 'private', participants:[{userId: req.user.userId}, {userId: recipientId}], createdBy: req.user.userId
    });

    await conversation.save();
    await conversation.populate('participants.userId', 'username avatar status');

    // Notify the recipient to join the conversation room
    const recSock = onlineUsers.get(recipientId);
    if (recSock) {
      io.to(recSock).emit('conversation:new', {conversation});
    }

    res.status(201).json({conversation});

  } catch (er) {
    res.status(500).json(er);
    }
});


// Group API
app.post('/api/conversations/group', authToken, [
  body('name').trim().isLength({min: 1, max: 100}),
  body('participantIds').isArray({min: 1, max: 100})
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }

  try {
    const {name, description, participantIds, avatar} = req.body;
    const participants = await User.find({ _id: {$in: participantIds}});
    if (participants.length !== participantIds.length) {
      return res.status(400).json({error: 'Some participant not found'});
    }

    const conversation = new Conversation({
      type: 'group', name, description, avatar: avatar,
      participants: [{userId: req.user.userId, role: 'admin' }, 
        ...participantIds.map(id => ({userId: id, role: 'member'}))],
        createdBy: req.user.userId
    });

    await conversation.save();
    await conversation.populate('participants.userId', 'username avatar status');


    // Notify all participants to join the conversation
    conversation.participants.forEach(p => {
      const participantId = p.userId._id.toString();
      if (participantId !== req.user.userId) {
        const participantSock = onlineUsers.get(participantId);
        if (participantSock) {io.to(participantSock).emit('conversation:new', {conversation});
        }
      }
    });

    res.status(201).json({ conversation });
  } catch (er) {
    res.status(500).json(er);
    }
});

// Add members to group
app.post('/api/conversations/:convId/members', authToken, [
  body('participantIds').isArray({min: 1, max: 50})
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }

  try {
    const { convId } = req.params;
    const { participantIds } = req.body;
    const conversation = await Conversation.findOne({
      _id: convId, type: 'group', 'participants.userId': req.user.userId
    });

    if (!conversation) {
      return res.status(404).json({error:'Group not found'});
    }

    // Check if user is admin
    const userParticipant = conversation.participants.find(p => p.userId.toString() === req.user.userId);

    if (userParticipant.role !== 'admin') {
      return res.status(403).json({error: 'Only admins can add members'});
    }

    // Verify users
    const newmems = await User.find({ _id: { $in: participantIds } });
    if (newmems.length !== participantIds.length) {
      return res.status(400).json({error: 'Some users not found'});
    }
    const existingIds = conversation.participants.map(p => p.userId.toString());
    const newIds = participantIds.filter(id => !existingIds.includes(id));

    if (newIds.length === 0) {
      return res.status(400).json({ error: 'All users are already members' });
    }

    // Add
    newIds.forEach(id => {
      conversation.participants.push({ userId: id, role: 'member' });
    });

    await conversation.save();
    await conversation.populate('participants.userId', 'username avatar status');

    // Notify new members
    newIds.forEach(id => {
      const socketId = onlineUsers.get(id);
      if (socketId) {
        io.to(socketId).emit('conversation:new', { conversation });
      }
    });

    // Notify existing members
    io.to(`conv:${convId}`).emit('conversation:updated', {conversation});

    res.json({message: 'Members added successfully', conversation});
  } catch (er) {
    res.status(500).json(er);
  }
});


// Mark as read
app.post('/api/conversations/:convId/read', authToken, async (req, res) => {
  try {
    const { convId } = req.params;
    
    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: convId,
        'participants.userId': req.user.userId
      },
      {
        $set: { 'participants.$.unreadCount': 0 }
      },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({error: 'Conversation not found'});
    }

    res.json({message: 'Marked as read'});

  } catch (er) {
    res.status(500).json(er);
  }
});

// Get messages for a conversation
app.get('/api/conversations/:convId/messages', authToken, apiLimiter, async (req, res) => {
  try {
    const {convId} = req.params;
    const {limit = 50, before} = req.query;
    const conversation = await Conversation.findOne( {
      _id: convId,
      'participants.userId': req.user.userId
    });

    if (!conversation) {
      return res.status(404).json({error: 'Conversation not found'});
    }

    const query = { 
      convId
      // deleted: false
    };

    if (before) {
      query.createdAt = {$lt: new Date(before)};
    }

    const messages = await Message.find(query).populate('senderId', 'username avatar')
      .populate('replyTo')
      .sort({createdAt: -1}).limit(parseInt(limit));

    res.json({ messages: messages.reverse() });

  } catch (e) {
    res.status(500).json(e);
  }
});


// Upload audio file
app.post('/api/upload/audio', authToken, audioUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({error: 'No file uploaded'});
    }

    const fileUrl = `/uploads/audio/${req.file.filename}`;
    const fileSize = req.file.size;
    const duration = req.body.duration;

    res.json({
      success: true,
      fileUrl: `${process.env.API_URL}${fileUrl}`,
      fileName: req.file.filename,
      fileSize: fileSize,
      duration: duration
    });
  } catch {
    res.status(500).json({ error: 'Failed to upload audio file' });
  }
});


// Upload general file
app.post('/api/upload/file', authToken, fileUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({error: 'No file uploaded'});
    }

    const fileUrl = `/uploads/files/${req.file.filename}`;
    const fileSize = req.file.size;

    res.json({
      success: true,
      fileUrl: `${process.env.API_URL}${fileUrl}`,
      fileName: req.file.originalname,
      fileSize: fileSize,
      mimeType: req.file.mimetype
    });
  } catch (e) {
    console.error('File upload error:', e);
    if (e.message.includes('File too large')) {
      return res.status(413).json({error: 'File size exceeds 25MB limit'});
    }
    if (e.message.includes('Executable files')) {
      return res.status(400).json(e);
    }
    res.status(500).json(e);
  }
});


// --------------------------------------------

// authMiddleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch {
    next(new Error('authentication error'));
  }
});

io.on('connection', async (socket) => {
  console.log(`User connected: ${socket.username} (${socket.userId})`);

  onlineUsers.set(socket.userId, socket.id);
  socks.set(socket.id, socket.userId);

  // Update user status to online
  await User.findByIdAndUpdate(socket.userId, { status: 'online', lastSeen: Date.now()});

  // Cache it in Redis
  await redis.setex(`user:${socket.userId}:online`, 3600, '1');

  // Join conversatioons
  try {
    const userConversations = await Conversation.find({
      'participants.userId': socket.userId
    }).select('_id');
    
    const convIds = userConversations.map(conv => conv._id.toString());
    
    convIds.forEach(convId => {
      socket.join(`conv:${convId}`);
    });
    
    console.log(`User ${socket.username} joined ${convIds.length} conversations`);
  } catch (e) {
    // console.error(e);
  }

  // Notify contacts of online status
  const conversations = await Conversation.find({
    'participants.userId': socket.userId
  }).select('participants');

  conversations.forEach(conv => {
    conv.participants.forEach(p => {
      const participantSock = onlineUsers.get(p.userId.toString());
      if (participantSock && p.userId.toString() !== socket.userId) {
        io.to(participantSock).emit('user:status', {userId: socket.userId, status: 'online'});
        }
    });
  });



  // Join for when new conversations are created
  socket.on('join:conversations', async (convIds) => {
    if (!convIds || !Array.isArray(convIds)) return;
    
    convIds.forEach(id => {
      if (id) {
        socket.join(`conv:${id}`);
        console.log(`User ${socket.username} joined conversation ${id}`);
      }
    });
  });


  // Handle new message
  socket.on('message:send', async (data) => {
    try { const { convId, content, type = 'text', replyTo, fileUrl, fileName, fileSize, mimeType, duration} = data;
      const conversation = await Conversation.findOne( {
        _id: convId, 
        'participants.userId': socket.userId
      });

      // if (!conversation) {return socket.emit('error', { message: 'Not a participant'});}

      const message = new Message({convId, senderId: socket.userId, content, type, replyTo, fileUrl,fileName, fileSize, mimeType, duration});

      await message.save();
      await message.populate('senderId', 'username avatar');

      // Update conversations last message
      conversation.lastMessage = message._id;
      conversation.lastmsgTime = message.createdAt;

      // increment unread count
    conversation.participants.forEach(p => {
      if (p.userId.toString() !== socket.userId) {
        p.unreadCount = (p.unreadCount || 0) + 1;
      }
    });
      await conversation.save();

      io.to(`conv:${convId}`).emit('message:new', {
        convId, message
      });


    } catch (e) {
      // console.error('Message send error:', e);
      socket.emit('error', {message: 'Failed to send message'});
    }
  });



  // Handle friend request response notification
  socket.on('friend:request:response', async ({ requestId, response }) => {
    try {
      const friendRequest = await FriendRequest.findById(requestId);
      if (!friendRequest) return;

      const recSock = onlineUsers.get(friendRequest.senderId.toString());
      if (recSock) {
        io.to(recSock).emit('friend:request:update', {requestId, response, userId: socket.userId});
      }
    } catch (e) {
      // console.error('?  ', e);
    }
  });


  // typing indicator
  socket.on('typing:start', ({ convId }) => {
    socket.to(`conv:${convId}`).emit('typing:update', {
        convId, userId: socket.userId, username: socket.username, isTyping: true
      });
  });

  socket.on('typing:stop', ({ convId }) => {
    socket.to(`conv:${convId}`).emit('typing:update', {
        convId, userId: socket.userId, isTyping: false
      });
  });

  // Message read receipts
  socket.on('message:read', async ({ messageId, convId }) => {
    try {const message = await Message.findById(messageId);
      if (!message) return;

      const alreadyRead = message.readBy.some(r => r.userId.toString() === socket.userId);
      if (!alreadyRead) {
        message.readBy.push({ userId: socket.userId, readAt: Date.now()});
        message.status = 'read';
        await message.save();

        const sendSock = onlineUsers.get(message.senderId.toString());
        if (sendSock) {
          io.to(sendSock).emit('message:status', {
            messageId, convId, status: 'read', readBy: socket.userId
          });
        }
      }

    await Conversation.findOneAndUpdate(
      {
        _id: convId,
        'participants.userId': socket.userId
      },
      {
        $set: { 'participants.$.unreadCount': 0 }
      }
    );

    } catch (e) {
      console.error(e);
    }
  });

  // Handle message delivery confirmation
  socket.on('message:delivered', async ({messageId, convId}) => {
    try {const message = await Message.findById(messageId);
      if (!message) return;

      const alreadyDel = message.deliveredTo.some(d => d.userId.toString() === socket.userId);
      if (!alreadyDel) {
        message.deliveredTo.push({ userId: socket.userId, deliveredAt: Date.now() });
        if (message.status === 'sent') {
          message.status = 'delivered';
        }
        await message.save();

        const sendSock = onlineUsers.get(message.senderId.toString());
        if (sendSock) {
          io.to(sendSock).emit('message:status', {
            messageId, convId, status: 'delivered', deliveredTo: socket.userId
          });
        }
      }
    } 
    catch (e) {
      console.error(e);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.username} (${socket.userId})`);


    onlineUsers.delete(socket.userId);
    socks.delete(socket.id);

    await User.findByIdAndUpdate(socket.userId, {
      status: 'offline', lastSeen: Date.now()
    });


    await redis.del(`user:${socket.userId}:online`);


    const conversations = await Conversation.find({
      'participants.userId': socket.userId
    }).select('participants');

    conversations.forEach(conv => {
      conv.participants.forEach(p => {
        const participantSock = onlineUsers.get(p.userId.toString());
        if (participantSock && p.userId.toString() !== socket.userId) {
          io.to(participantSock).emit('user:status', {
            userId: socket.userId, status: 'offline', lastSeen: Date.now()
          });
        }
      });
    });
  });
});



let isShuttingDown = false;

const shutDown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`${signal} received. Shutting down`);
  
  try {
    await User.updateMany({}, {status: 'offline'});
    console.log('All users set to offline');
    
    io.close(() => {
      console.log('WebSocket closed');
    });
    server.close(() => {
      console.log('HTTP closed');
      mongoose.connection.close(false, () => {
        console.log('MongoDB closed');
        process.exit(0);
      });
    });

    
  } catch (e) {
    console.error('shutdown:  ', e);
    process.exit(1);
  }
};
process.once('SIGTERM', () => shutDown('SIGTERM'));
process.once('SIGINT', () => shutDown('SIGINT'));




// gat for friend recom

const gatRecom = require('./gat-service');
const gatService = new gatRecom('python3', './models/gat_model.pt');

// Schedule for 24 hours
gatService.scheduleRet(User, Message, Conversation, 24);

// Train gat
app.post('/api/gat/train', authToken, async (req, res) => {
  try {
    await gatService.trainModel(User, Message, Conversation);
    res.json({ success: true, message: 'Model trained successfully'});
  } catch (e) {
    // console.error('first train gat :', error);
    res.status(500).json({error: e.message});
  }
});

// Get recomms
app.get('/api/friends/recommendations', authToken, apiLimiter, async (req, res) => {
  try {
    const topK = Math.min(parseInt(req.query.limit) || 10, 50);
    const result = await gatService.getRecomms(req.user.userId, User, Message, Conversation, topK);
    
    // Filter pending requests
    const requests = await FriendRequest.find({
      $or:[
        {senderId: req.user.userId, status: 'pending'},
        {recipientId: req.user.userId, status: 'pending'}
      ]
    });
    
    const pendingIds = new Set(requests.map(fr => 
      fr.senderId.toString() === req.user.userId ? fr.recipientId.toString() : fr.senderId.toString()
    ));
    
    const filtered = result.recomms.filter(r => !pendingIds.has(r.userId));
    res.json({recomms: filtered, allCands: result.allCands});
  } catch (e) {
    if (e.message.includes('Model not trained')) {
      return res.status(503).json({error: 'Model not ready', fallback: true});
    }
    res.status(500).json(e);
  }
});


// Model status
app.get('/api/gat/status', authToken, async (req, res) => {
  try {
    let modelExists = false;
    try {
      await require('fs').promises.stat(gatService.modelPath);
      modelExists = true;
    } catch (e) {}
    
    res.json({
      isTraining: gatService.isTraining,
      lastTrain: gatService.lastTrain,
      modelExists
    });
  } catch (e) {
    res.status(500).json(e);
  }
});

console.log('gat initialized');








const PORT = 5001;
server.listen(PORT, () => {
  console.log(`Server: ${PORT}`);
});