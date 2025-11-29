// gat friend recommendation service

const {spawn} = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class gatRecom {
  constructor(pythonPath = 'python3', modelPath = './models/gat_model.pt') {
    this.pythonPath = pythonPath;
    this.modelPath = modelPath;
    this.scriptPath = path.join(__dirname, 'gat_model.py');
    console.log(this.scriptPath);
    this.isTraining = false;
    this.lastTrain = null;
  }

  async getFeatures(User, Message, Conversation) {
    const users = await User.find({}).lean();
    const features = [];

    for (const user of users) {
      const userId = user._id.toString();
      const agee = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 1000 * 60));
      const messages = await Message.find({senderId: user._id }).lean();
      const conversations = await Conversation.find({'participants.userId': user._id}).lean();
      const userFriends = await User.findById(user._id).populate('friends').lean();
      const numFriends = userFriends.friends?.length || 0;
      const numGroups = conversations.filter(c => c.type === 'group').length;
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 1000 * 60);
      const recentMsgs = messages.filter(m => new Date(m.createdAt).getTime() > sevenDaysAgo).length;
      let avgMsgLength = 0, morning = 0, afternoon = 0, evening = 0, night = 0;
      
      if (messages.length > 0) {
        avgMsgLength = messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length;
        messages.forEach(m => {
          const hour = new Date(m.createdAt).getHours();
          if (hour >= 6 && hour < 12) morning++;
          else if (hour >= 12 && hour < 18) afternoon++;
          else if (hour >= 18) evening++;
          else night++;
        });
      }
      
      features.push({
        userId, features: [
          agee, user.bio ? 1 : 0, user.avatar ? 1 : 0, messages.length, conversations.length, numGroups, avgMsgLength, messages.reduce((sum, m) => sum + m.content.length, 0),
          recentMsgs, morning, afternoon, evening, night, numFriends,
          /////
          new Set(messages.map(m => m.recipientId?.toString()).filter(Boolean)).size
        ]
      });
    }
    return features;
  }

  async buildGraph(User) {
    const users = await User.find({}).populate('friends').lean();
    const userToIdx = {};
    const edges = [];

    users.forEach((user, idx) => {
      userToIdx[user._id.toString()] = idx;
    });

    users.forEach(user => {
      const userId = user._id.toString();
      const userIdx = userToIdx[userId];
      user.friends?.forEach(friend => {
        const friendIdx = userToIdx[friend._id.toString()];
        if (friendIdx !== undefined) edges.push([userIdx, friendIdx]);
      });
    });

    return {edges, userToIdx, users};
    
  }

  async runPython(mode, dataPath) {
    return new Promise((resolve, reject) => {
      const process = spawn(this.pythonPath, [this.scriptPath, mode, dataPath, this.modelPath]);
      let output = '', error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
        console.log(data.toString());
      });
      process.stderr.on('data', (data) => {
        error += data.toString();
        console.error(data.toString());
      });
      process.on('close', async (code) => {
        try { await fs.unlink(dataPath); } catch (e) {}
        code === 0 ? resolve(output) : reject(new Error(error));
      });
    });
  }

  async trainModel(User, Message, Conversation) {
    if (this.isTraining) throw new Error('Training in progress');
    this.isTraining = true;

    try {
      console.log('Getting features');
      const userFeatures = await this.getFeatures(User, Message, Conversation);
      const {edges, userToIdx, users} = await this.buildGraph(User);

      const data = {
        features: userFeatures.map(uf => uf.features), edges, userToIdx,
          users: users.map(u => ({ id: u._id.toString(), username: u.username }))
      };

      const tempPath = path.join(__dirname, `train_${Date.now()}.json`);
      await fs.writeFile(tempPath, JSON.stringify(data));
      
      await this.runPython('train', tempPath);
      this.lastTrain = Date.now();
      this.isTraining = false;
      return { 
        success: true 
      };
    } catch (er) {
      this.isTraining = false;
      throw er;
    }
  }

  async getRecomms(userId, User, Message, Conversation, topK = 10) {
    try {
      await fs.access(this.modelPath);
    } catch {
      throw new Error('Model not trained yet');
    }

    const userFeatures = await this.getFeatures(User, Message, Conversation);
    const {edges, userToIdx, users} = await this.buildGraph(User);

    const data = {
      features: userFeatures.map(uf => uf.features), edges, userToIdx,
      targetUs: userId, topK,
      users: users.map(u => ({
        id: u._id.toString(), username: u.username, avatar: u.avatar, bio: u.bio
      }
    ))
    };

    const tempPath = path.join(__dirname, `infer_${Date.now()}.json`);
    await fs.writeFile(tempPath, JSON.stringify(data));
    
    const output = await this.runPython('infer', tempPath);
    return JSON.parse(output);
  }

  scheduleRet(User, Message, Conversation, hours = 24) {
    setInterval(async () => {
      try {
        await this.trainModel(User, Message, Conversation);
      } catch (e) {
        console.error('Retraining failed:', e);
      }
    }, hours * 3600000);
  }
}

module.exports = gatRecom;
