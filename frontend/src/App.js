import {useEffect, useState, useRef} from 'react';
import {Sparkles, Send, Mic, Search, Check, CheckCheck, Clock, Paperclip, X, Menu, LogOut, Settings, User, Plus, ArrowLeft, UserPlus, Bell, Moon, Sun, StopCircle} from 'lucide-react';
import io from 'socket.io-client';

const ChatApp = () => {
  const API = 'http://localhost:5001';
  const [usr, setUsr] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [showAuth, setShowAuth] = useState(true);
  
  // Auth
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState(''); 
  const [error, setError] = useState('');
  
  // Chat
  const [conversations, setConvs] = useState([]);
  const [sel, setSel] = useState(null);
  const [messages, setMessages] = useState({});
  const [msgIn, setMsgIn] = useState('');
  const [typingUsers,setTypingUsers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [searchQ, setSearchQ] = useState('');
  const [newChat, setNewChat] = useState(false);
  const [side, setSide] = useState(true);
  const [setting, setSetting] = useState(false);
  const [groupInf, setGroupInf] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  // const [showChatMenu,setChatMenu] = useState(false);
  const [scrollbottom, setScrollBottom] = useState(false);

  // const [availableUsers, setAvailableUsers] = useState([]);
  const [selUsers, setSelUsers] =useState([]);
  const [chatType, setChatType] = useState('private');
  const [groupName, setGroupName] = useState('');

  const [addMem, setAddMem] = useState(false);
  const [memToAdd, setMemToAdd] = useState([]);

  // Search feature
  const [chatSearch, setChatSearch] = useState(false);
  const [chatSQ, setChatSQ] = useState('');
  const [chatSearchMatch, setChatSearchMatch] = useState([]);
  const [matchInd, setMatchInd] = useState(0);

  // Friend
  const [friendReqs, setFriendReqs] = useState(false);
  const [frReqs, setFrReqs] = useState({received: [], sent: []});
  const [friends, setFriends] = useState([]);
  const [addFr, setAddFr] = useState(false);
  const [frSearchQ, setFrSearchQ] = useState('');
  const [frSeachR, setFrSeachR] = useState([]);

  // View profile
  const [showProf, setShowProf] = useState(null);
  
  // Media
  const [isRecording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  // const [uploadProgress,setUploadProgress] = useState(0);
  

  const [showRecms, setShowRecms] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);


  const endRef = useRef(null);
  const ws = useRef(null);
  const typeT0 = useRef(null);
  const medRec = useRef(null);
  const recInt = useRef(null);
  const audioChunks = useRef([]); 
  const fileRef = useRef(null);
  

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        try {
          const response = await fetch(`${API}/api/users/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            setUsr( {
              id: data.user.id, username: data.user.username, fullName: data.user.fullName, email: data.user.email, avatar: data.user.avatar || data.user.username[0].toUpperCase(), 
                bio: data.user.bio || ''
            });
            setShowAuth(false);
          } else {
            localStorage.removeItem('auth_token');
          }
        } catch {
          localStorage.removeItem('auth_token');
        }
      }
    };
    checkAuth();
  }, []);


  // Initialize app
  useEffect(() => {
    if (usr) {
      initSock();
      loadFriends();
      loadFrReqs();
      loadConvs();
    }
    
    return () => {
      if (ws.current) {
        ws.current.disconnect();
      }
    };
    }, [usr]);


  // setup webSocket connection
  const initSock = () => { 
    const SOCKET =  'http://localhost:5001';
    // process.env.REACT_APP_WS_URL
    try {
      const socket = io(SOCKET, {auth: {
          token: localStorage.getItem('auth_token'),
          userId: usr.id, username: usr.username
        }, reconnectionAttempts: 5
      });

      // socket.on('connect', () => {
      //     console.log('WebSocket connected');
      //   });

      // socket.on('disconnect', () => {
      // console.log('WebSocket disconnected');
      // });

      // Message
      socket.on('message:new', (data) => {
        newMsg(data.message, data.convId);
      });
      socket.on('message:status', (data) => {
        updateMsgStat(data.messageId, data.convId, data.status);
      });

      // Typing
      socket.on('typing:update', (data) => {
        setTypingUsers(prev => ({
          ...prev,
          [data.convId]: data.isTyping ? data.username : null
        }));
        });

      // Status
      socket.on('user:status', (data) => {
        setOnlineUsers(prev => {
          const newSet = new Set(prev);
          if (data.status === 'online') {
            newSet.add(data.userId);
          } 
          else {
            newSet.delete(data.userId);
          }
          return newSet;
        });
        
        setConvs(prev => prev.map(conv => {
          if (conv.type === 'private' && conv.participants.some(p => p.userId === data.userId)) {
            return { 
              ...conv, online: data.status === 'online'
            };
          }
          return conv;
        }));


        setSel(prev => {
          if (prev && prev.type === 'private' && prev.participants.some(p => p.userId === data.userId)) {
            return { 
              ...prev, online: data.status === 'online' 
            };
          }
          return prev;
  });

        });

        
        // New conversation event
        socket.on('conversation:new', (data) => {
        const conv = data.conversation;
        const isPrivate = conv.type === "private";
        const otherUser = isPrivate ? conv.participants.find(p => p.userId._id !== usr.id)?.userId : null;

      const newConv = {
        id: conv._id, type: conv.type, name: isPrivate ? (otherUser?.username) : conv.name,
        avatar: isPrivate ? (otherUser?.avatar || otherUser?.username?.[0]?.toUpperCase()) : (conv.avatar || conv.name?.[0]?.toUpperCase()),
        lastMessage: "", lastMsgTime: new Date(), unreadCount: 0,
        participants: conv.participants.map(p => ({
          userId: p.userId._id, username: p.userId.username, avatar: p.userId.avatar || p.userId.username[0].toUpperCase(),
            bio: p.userId.bio || '', role: p.role
        })),
        online: isPrivate ? (otherUser?.status === 'online') : false,
        createdBy: conv.createdBy
      };
      setConvs(prev => [newConv, ...prev]);
      setMessages(prev => ({ ...prev, [newConv.id]: []}));

      if (ws.current?.connected) {
        ws.current.emit('join:conversations', [newConv.id]);
      }
    });

      // Friend request events
      socket.on('friend:request', (data) => {
        loadFrReqs();
        // if (notifications) {
        //   new Notification('Friend Request', {
        //     body: `${data.request.senderId.username} sent you a friend request`
        //   });
        // }
      });

      socket.on('friend:accepted', (data) => {
        // if (notifications) {
        //   new Notification('Friend Request Accepted', {
        //     body: `${data.username} accepted your friend request`
        //   });
        // }
        loadFriends();
      });
      // Remove from sent requests when responded
      socket.on('friend:request:update', (data) => {
        setFrReqs(prev => ({
          ...prev,
          sent: prev.sent.filter(req => req._id !== data.requestId)
        }));
      });


      socket.on('friend:request:cancelled', (data) => {
        loadFrReqs(); 
      });
      ws.current = socket;
    } catch (e) {
      ////
    }


  };


  // Handle new message
  const newMsg = (message, convId) => {
    const styleMessage = {
      id: message._id, senderId: message.senderId._id || message.senderId,senderName: message.senderId.username || usr.username,
        content: message.content, timestamp: new Date(message.createdAt || Date.now()),
      status: message.status, type: message.type, fileUrl: message.fileUrl, fileName: message.fileName, fileSize: message.fileSize, mimeType: message.mimeType,duration: message.duration 
    };

    setMessages(prev => ( {
      ...prev,
      [convId]: [...(prev[convId] || []), styleMessage]
    }));

  setConvs(prev => prev.map(conv => 
    conv.id === convId ? { 
      ...conv, 
      lastMessage: message.content, 
      lastMsgTime: new Date(message.createdAt || Date.now()),
      unreadCount: sel?.id === convId ? 0 : (conv.unreadCount || 0) + 1
    }: conv
  ));


    // Delivered
    if (message.senderId._id !== usr.id && ws.current?.connected) {
      ws.current.emit('message:delivered', {
        messageId: message._id, convId: convId
      });
    }

    // // Show notification
    // if (notifications && sel?.id !== convId) {
    //   if ('Notification' in window && Notification.permission === 'granted') {
    //     new Notification(styleMessage.senderName, {
    //       body: message.content
    //     });
    //   }
    // }

  };

  // Update message status
  const updateMsgStat = (messageId, convId, status) => {
    setMessages(prev => ( {
      ...prev, 
      [convId]: (prev[convId] || []).map(msg => msg.id === messageId ? { ...msg, status } : msg)
    }  
  ));
  };


  const loadRecs = async () => {
  setLoadingRecs(true);
  try {
    const token = localStorage.getItem('auth_token');
    let response = await fetch(`${API}/api/friends/recommendations?limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      setRecommendations(data.recommendations || []);
    } else if (response.status === 503) {
      // Fallback
      response = await fetch(`${API}/api/friends/recommendations/fallback?limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setRecommendations(data.recommendations || []);
      }
    }
  } catch (error) {
    console.error('loading recs:  ', error);
  } finally {
    setLoadingRecs(false);
  }
};


// Auth handler
  const handleAuth = async (e) => {
    e?.preventDefault();
    setError('');
    
    try {
      if (authMode === 'login') {

        if (!email || !password) {
          setError('Please fill in all fields');
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          setError('Please enter a valid email address');
          return;
        }

        const response = await fetch(`${API}/api/auth/login`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({email, password})
        });

        if (!response.ok) {
          const data = await response.json();
          if (data.errors && Array.isArray(data.errors)) {
            setError(data.errors[0].msg);
          } else {
            setError(data.error || 'Login failed');
          }
          return;
        }

        const data = await response.json();
        localStorage.setItem('auth_token', data.token);
        setUsr({
          id: data.user.id, username: data.user.username, fullName: data.user.fullName || '', email: data.user.email, avatar: data.user.avatar || data.user.username[0].toUpperCase(),
            bio: data.user.bio || ''
        });
        
        setShowAuth(false);
        
        // if ('Notification' in window && Notification.permission === 'default') {
        //   Notification.requestPermission();
        // }

      } else {
        // Sign up
        if (!username || !fullName || !email || !password) {
          setError('Please fill in all fields');
          return;
        }
        if (username.length < 4 || username.length > 20) {
          setError('Username must be between 4 and 20 character');
          return;
        }
        
        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!usernameRegex.test(username)) {
          setError('Username can only contain letters, numbers, and underscore');
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          setError('Please enter a valid emai');
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 character');
          return;
        }
        if (password.length > 50) {
          setError('Password must not be longer than 50 characters');
          return;
        }
        if (fullName.length > 100) {
          setError('Full name must not be longer than 100 characters');
          return;
        }

        const response = await fetch(`${API}/api/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({username, fullName, email, password})
        });

        if (!response.ok) {
          const data = await response.json();
          if (data.errors && Array.isArray(data.errors)) {
            setError(data.errors[0].msg);
          } else if (data.error) {
            // Error from backend
            setError(data.error);
          } else {
            setError('Registration failed');
          }
          return;
        }

        const data = await response.json();
        localStorage.setItem('auth_token', data.token);
        
        // Set user
        setUsr({
          id: data.user.id, username: data.user.username, fullName: data.user.fullName || '', email: data.user.email, avatar: data.user.avatar || data.user.username[0].toUpperCase(),
            bio: data.user.bio || ''
        });
        
        setShowAuth(false);
        

        // if ('Notification' in window && Notification.permission === 'default') {
        //   Notification.requestPermission();
        // }
      }
    } catch {
      setError('network error. try later.');
    }
  };






  const loadFriends = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API}/api/friends`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setFriends(data.friends);
      }
    } catch {
      console.error('loadFriends error:');
    }
  };


  const loadFrReqs = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const [receivedRes, sentRes] = await Promise.all([
        fetch(`${API}/api/friends/requests/received`, {
          headers: {'Authorization': `Bearer ${token}`}
        }), fetch(`${API}/api/friends/requests/sent`, {
          headers: {'Authorization': `Bearer ${token}`}
        })
      ]);
      
      if (receivedRes.ok && sentRes.ok) {
        const received = await receivedRes.json();
        const sent = await sentRes.json();
        setFrReqs({
          received: received.requests, sent: sent.requests
        });
      }
    } catch {
      console.error('loadFrReqs');
    }
  };



  
  const loadConvs = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API}/api/conversations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // backend to frontend format
        const styleConvs = data.conversations.map(conv => {
          const isPrivate = conv.type === "private";
          const otherUser = isPrivate ? conv.participants.find(p => p.userId._id !== usr.id)?.userId: null;
        const cup = conv.participants.find(p => p.userId._id === usr.id);
        const unreadCount = cup?.unreadCount || 0;

          return {
            id: conv._id, type: conv.type, name: isPrivate ? (otherUser?.username): conv.name, avatar: isPrivate ?
              (otherUser?.avatar || otherUser?.username?.[0]?.toUpperCase()): (conv.avatar || conv.name?.[0]?.toUpperCase()),
            lastMessage: conv.lastMessage?.content || "", lastMsgTime: conv.lastMessage?.createdAt ? new Date(conv.lastMessage.createdAt): conv.lastMsgTime, 
            unreadCount: unreadCount,
            participants: conv.participants.map(p => ({userId: p.userId._id, username: p.userId.username, avatar: p.userId.avatar || p.userId.username[0].toUpperCase(), bio: p.userId.bio || '', 
               role: p.role
            })),
            // online: isPrivate && onlineUsers.has(otherUser?._id),
            online: isPrivate ? (otherUser?.status === 'online') : false,
            createdBy: conv.createdBy
          };

        });

        setConvs(styleConvs);
      }
    } catch {
      console.error('loadConvs error:');
    }
  };



  const loadMessages = async (convId) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API}/api/conversations/${convId}/messages?limit=50`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
    
        const newStyle = data.messages.map(msg => ( {
          id: msg._id, senderId: msg.senderId._id, senderName: msg.senderId.username, content: msg.content, timestamp: new Date(msg.createdAt),
            status: msg.status,type: msg.type, fileUrl: msg.fileUrl, fileName: msg.fileName, fileSize: msg.fileSize, mimeType: msg.mimeType, duration: msg.duration 
        }));
        
        setMessages(prev => ({
          ...prev,
          [convId]: newStyle
        }));

        // delivered for undelivered messages
        if (ws.current?.connected) {
          newStyle.forEach(msg => {
            if (msg.senderId !== usr.id && msg.status === 'sent') {
              ws.current.emit('message:delivered', {
                messageId: msg.id,
                convId: convId
              });
            }
          });
        }
      }
    } catch {
      console.error('loadMessages error:');
    }
  };


  // Search users for friend requests
  const searchhFriend = async (query) => {
    if (!query || query.length < 2) {
      setFrSeachR([]);
      return;
    }
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API}/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: {'Authorization': `Bearer ${token}`}
      });
      
      if (response.ok) {
        const data = await response.json();
        setFrSeachR(data.users);
      }
    } catch {
      console.error('searchhFriend ');
    }
  };

  // Send friend request
  const senddFriend = async (recipientId) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API}/api/friends/request`, {
        method: 'POST', headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }, body: JSON.stringify({recipientId})
      });
      
      if (response.ok) {
        const data = await response.json();
        loadFrReqs();
        // setFrReqs(prev => ({
        //   ...prev,
        //   sent: [data.request, ...prev.sent]
        // }));
      } else {
        const error = await response.json();
        alert(error.error);
      }
    } catch {
      console.error('senddFriend');
      alert('Failed to send friend request');
    }
  };

  // Accept friend request
  const accReq = async (requestId) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API}/api/friends/request/${requestId}/accept`, {
        method: 'POST', headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setFrReqs(prev => ({
          ...prev,
          received: prev.received.filter(req => req._id !== requestId)
        }));
        loadFriends(); //
        // alert('Friend request acepted');
      }
    } catch (error) {
      console.error('Accept friend request error:', error);
    }
  };

  // Decline friend request
  const declineReq = async (requestId) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API}/api/friends/request/${requestId}/decline`, {
        method: 'POST', headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setFrReqs(prev => ({
          ...prev,
          received: prev.received.filter(req => req._id !== requestId)
        }));
        // alert('Friend request declined');
      }
    } catch (e) {
      console.error('Decline friend request error:', e);
    }
  };

  // Cancel friend request
  const cancleReq = async (requestId) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API}/api/friends/request/${requestId}`, {
        method: 'DELETE', headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        loadFrReqs();
        // alert('Friend request canceled');
      }
    } catch {
      console.error('cancle req error');
    }
  };


  const avatarClick = () => {
  if (sel.type === 'private') {
    const otherUser = sel.participants.find(p => p.userId !== usr.id);
    if (otherUser) {
      setShowProf({
        fullName: otherUser.username, username: otherUser.username, bio: otherUser.bio || '', avatar: otherUser.avatar, status: sel.online ? 'online' : 'offline'
      });
    }
  }
};





  const handleLogout = () => {
    if (ws.current) {
      ws.current.disconnect();
    }
    setUsr(null);
    setConvs([]);
    setMessages({});
    setSel(null);
    setMsgIn('');
    setTypingUsers({});
    setOnlineUsers(new Set());
    setShowAuth(true);
    setSetting(false);
    setNewChat(false);
    setFriends([]);                    
    setFrReqs({received: [], sent: []});  
    setFriendReqs(false);    
    setAddFr(false);         

    localStorage.removeItem('auth_token');
  };



  // Send message
  const sendMsg = () => {
    if (!msgIn.trim() || !sel) return;
    const messageContent = msgIn;
    setMsgIn('');

    if (ws.current?.connected) {
      ws.current.emit('message:send', {
        convId: sel.id, content: messageContent, type: 'text'
      });
    } else {
      alert('Not connected to server');
    }
  };


  const updateProf = async (updates) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        const data = await response.json();
      setUsr({
        id: data.user.id, username: data.user.username, fullName: data.user.fullName || '', email: data.user.email, avatar: data.user.avatar || data.user.username[0].toUpperCase(),
          bio: data.user.bio || '', status: data.user.status
      });
        // alert('Profile updated successfully!');
      } else {
        const error = await response.json();
        alert(error.error);
      }
    } catch {
      alert('Failed to update profile');
    }
  };


  // Handle typing
  const handleTyping = () => {
    if (!sel) return;
    
    if (ws.current?.connected) { 
      ws.current.emit('typing:start', {convId: sel.id}); 
    }
    
    if (typeT0.current) { 
      clearTimeout(typeT0.current); }
    
    typeT0.current = setTimeout(() => {
      if (ws.current?.connected) {
        ws.current.emit('typing:stop', {convId: sel.id});
      }
    }, 3000);
  };


  // Scroll to bottom
  const scroll = (e) => {
    const element = e.target;
    const isAtBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    setScrollBottom(!isAtBottom);
  };
  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({behavior: 'smooth'});
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks.current = [];
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      
      const mediaRecorder = new MediaRecorder(stream, {mimeType});
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.current.push(e.data);
        }
      };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks.current, {type: mimeType});
      await usVoice(audioBlob);
      
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start();
    medRec.current = mediaRecorder;
    setRecording(true);
    setRecTime(0);
    
    recInt.current = setInterval(() => {
      setRecTime(prev => prev + 1);
    }, 1000);
    
  } catch (error) {
    console.error('Recording error:', error);
    alert('Could not access microphone. Please check permissions.');
  }
};

const stopRecording = () => {
  if (medRec.current && isRecording) {
    medRec.current.stop();
    setRecording(false);
    clearInterval(recInt.current);
  }
};


const usVoice = async (audioBlob) => {
  if (!sel) return;
  
  setIsUploading(true);
  
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'voice-message.webm');
    formData.append('duration', recTime.toString());

    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API}/api/upload/audio`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }


    const data = await response.json();


    if (ws.current?.connected) {
      ws.current.emit('message:send', {
        convId: sel.id,
        content: 'Voice message',
        type: 'audio',
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        duration: recTime
      });
    }
    
    setIsUploading(false);

  } catch {
    setIsUploading(false);
  }
};

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File size exceeds 25MB limit.');
      return;
    }

    if (!sel) return;
    
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API}/api/upload/file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }



      if (ws.current?.connected) {
        ws.current.emit('message:send', {
          convId: sel.id,
          content: file.name,
          type: 'file',
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileSize: data.fileSize,
          mimeType: data.mimeType
        });
      }
      
      setIsUploading(false);
      // Reset file input
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    } catch{
      setIsUploading(false);
      // Reset file input on error too
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  };

  const createConv = async () => {
    if (chatType === 'private' && selUsers.length !== 1) {
      alert('Please select one friend for private chat');
      return;
    }
    
    if (chatType === 'group' && (selUsers.length < 2 || !groupName.trim())) {
      alert('Please enter a group name and select at least 2 friends and');
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      let response;

      if (chatType === 'private') {
        const existingConv = conversations.find(conv => 
          conv.type === 'private' && 
          conv.participants.some(p => p.userId === selUsers[0].id)
        );
        if (existingConv) {
          setSel(existingConv);
          setNewChat(false);
          setSelUsers([]);
          setSide(false);
          return;
        }

        // Create or get existing private conversation
        response = await fetch(`${API}/api/conversations/private`, {
          method: 'POST', headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }, body: JSON.stringify({
            recipientId: selUsers[0].id
          })
        });
      } else {
        // Create group conversation
        response = await fetch(`${API}/api/conversations/group`, {
          method: 'POST', headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }, body: JSON.stringify({
            name: groupName,
            participantIds: selUsers.map(u => u.id)
          })
        });
      }

      if (response.ok) {
        const data = await response.json();
        const conv = data.conversation;
        const existInd = conversations.findIndex(c => c.id === conv._id);
        if (existInd !== -1) {
          setSel(conversations[existInd]);
          setNewChat(false);
          setSelUsers([]);
          setGroupName('');
          setSide(false);
          return;
        }

        // to frontend format
        const newConv = {
          id: conv._id, type: conv.type, name: conv.type === 'private' ? conv.participants.find(p => p.userId._id !== usr.id)?.userId.username || selUsers[0].username: conv.name,
          avatar: conv.type === 'private'? (conv.participants.find(p => p.userId._id !== usr.id)?.userId.avatar || selUsers[0].avatar): (conv.avatar || groupName[0].toUpperCase()),
          lastMessage: '', lastMsgTime: new Date(),
          unreadCount: 0,
          participants: conv.participants.map(p => ({userId: p.userId._id || p.userId, username: p.userId.username || selUsers.find(u => u.id === p.userId)?.username,
            avatar: p.userId.avatar || selUsers.find(u => u.id === p.userId)?.avatar, role: p.role
          })), online: selUsers.some(u => onlineUsers.has(u.id)), createdBy: conv.createdBy
        };

        // Add conversation to the list
        setConvs(prev => [newConv, ...prev]);
        setMessages(prev => ({ 
          ...prev, [newConv.id]: [] 
        }));
        setSel(newConv);
        
        if (ws.current?.connected) {
          ws.current.emit('join:conversations', [newConv.id]);
        }
        
        setNewChat(false);
        setSelUsers([]);
        setGroupName('');
        // setSide(false);

      } else {
        const error = await response.json();
        alert(error.error);
      }
    } catch{
      alert('Failed to create conversation');
    }
  };


  const addMembersToGroup = async () => {
  if (memToAdd.length === 0) {
    alert('Please select at least one member to add');
    return;
  }

  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API}/api/conversations/${sel.id}/members`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        participantIds: memToAdd.map(u => u.id)
      })
    });

    if (response.ok) {
      const data = await response.json();
      

      setConvs(prev => prev.map(conv => 
        conv.id === sel.id ? {
          ...conv,
          participants: data.conversation.participants.map(p => ({
            userId: p.userId._id, username: p.userId.username, avatar: p.userId.avatar || p.userId.username[0].toUpperCase(),
              bio: p.userId.bio || '', role: p.role
          }))
        } : conv
      ));

      setSel(prev => ({
        ...prev,
        participants: data.conversation.participants.map(p => ({
          userId: p.userId._id, username: p.userId.username, avatar: p.userId.avatar || p.userId.username[0].toUpperCase(),
            bio: p.userId.bio || '', role: p.role
        }))
      }));

      setAddMem(false);
      setMemToAdd([]);
      // alert('Members added successfully!');
    } else {
      const er = await response.json();
      alert(er.error);
    }
  } catch (er) {
    console.error(er);
    alert('Failed to add members');
  }
};


  const formatTime = (date) => {
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / 3600000);
    
    if (hours < 24) {
      return date.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
    } else if (hours < 48) {
      return 'Yesterday';
    } else {
      const d = new Date(date);
      return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
    }
  };


  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent':
        return <Check className="w-4 h-4 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="w-4 h-4 text-gray-400" />;
      case 'read':
        return <CheckCheck className="w-4 h-4 text-blue-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };


  const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};



  const filterConvs = conversations.filter(conv => {
    const searchLower = searchQ.toLowerCase();
    const nameMatch = conv.name.toLowerCase().includes(searchLower);
    const participantMatch = conv.participants.some(p => p.username.toLowerCase().includes(searchLower));
    const convMessages = messages[conv.id] || [];
    const messageMatch = convMessages.some(msg => msg.content.toLowerCase().includes(searchLower));
    
    return nameMatch || participantMatch || messageMatch;
  });


  // Search within chat
  useEffect(() => {
    if (!chatSQ.trim() || !sel) {
      setChatSearchMatch([]);
      setMatchInd(0);
      return;
    }
    
    const convMessages = messages[sel.id] || [];
    const matches = convMessages
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => msg.content.toLowerCase().includes(chatSQ.toLowerCase())
      );
    
    setChatSearchMatch(matches);
    setMatchInd(0);
  }, [chatSQ, sel, messages[sel?.id]]);

  // Scroll to current match
  useEffect(() => {
    if (chatSearchMatch.length > 0 && matchInd >= 0) {
      const matchId = chatSearchMatch[matchInd].msg.id;
      const element = document.getElementById(`msg-${matchId}`);
      if (element) {
        element.scrollIntoView({behavior: 'smooth', block: 'center'});
      }
    }
  }, [matchInd, chatSearchMatch]);

  useEffect(() => {
    endRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages, sel]);


  useEffect(() => {
    if (sel && sel.id) {
      loadMessages(sel.id);
    }
  }, [sel?.id]);


 



  useEffect(() => {
    if (!sel || !ws.current?.connected) return;
    const convMessages = messages[sel.id];
    if (!convMessages || convMessages.length === 0) return;

    convMessages.forEach(msg => {
      if (msg.senderId !== usr.id && msg.status !== 'read') {
        ws.current.emit('message:read', {
          messageId: msg.id,
          convId: sel.id
        });
      }
    });

    setConvs(prev => prev.map(conv => 
      conv.id === sel.id ? {...conv, unreadCount: 0} : conv
  ));

  }, [sel?.id, messages[sel?.id]?.length]);



  useEffect(() => {
    if (sel) {
      localStorage.setItem('selectedConvId', sel.id);
    }
  }, [sel]);


  useEffect(() => {
    if (conversations.length > 0 && !sel) {
      const savedConvId = localStorage.getItem('selectedConvId');
      if (savedConvId) {
        const conv = conversations.find(c => c.id === savedConvId);
        if (conv) {
          setSel(conv);
        }
      }
    }
  }, [conversations]);



  













// Auth Screen
if (showAuth) {
  return (
    <div className="h-screen bg-gray-800 flex items-center justify-between p-4 md:p-8 lg:p-16">
      <div className="hidden md:flex flex-1 flex-col items-center justify-center text-white px-8">
        <p className="text-xl text-white/90">Stay connected with your friends</p>
      </div>

      <div className="bg-white/30 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl w-full max-w-md  p-8 ">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">chatapp</h1>
          </div>

          <div className="flex mb-6 bg-white/20 rounded-lg p-1">
            <button
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 rounded-md transition-all ${
                authMode === 'login' ? 'bg-white/60 shadow text-gray-800 font-semibold': 'text-gray-600'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              className={`flex-1 py-2 rounded-md transition-all ${
                authMode === 'signup' ? 'bg-white/60 shadow text-gray-800 font-semibold': 'text-gray-600'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="space-y-4">
            {authMode === 'signup' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-3  border  border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your full name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your username"
                  />
                </div>
              </>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAuth(e)}
                className="w-full px-4 py-3  border  border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500  focus:border-transparent"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAuth(e)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your password"
              />
            </div>

        {error && (
          <div className="bg-red-50/80 border border-red-200 text-red-700 text-sm text-center  px-4 py-3 rounded-lg">
            {error}
          </div>
      )}

            <button
              onClick={handleAuth}
              className="w-full bg-gray-800 text-white py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all   shadow-lg"
            >
              {authMode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </div>

          {/* <div className="mt-6 text-center text-sm text-gray-600">
            <p>this is demo</p>
          </div> */}
        </div>
      </div>
    );
  }

  // Main Interface
  return (
    <div className={`h-screen flex ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Sidebar */}
      {/* <div className={`${side ? 'w-full md:w-96' : 'hidden'} ${darkMode ? 'bg-gray-800' : 'bg-white'} border-r flex flex-col`}> */}
      <div className={`${side ? 'w-full md:w-96' : 'hidden md:block md:w-0 md:min-w-0 overflow-hidden'} ${darkMode ? 'bg-gray-800' : 'bg-white'} border-r flex flex-col transition-all duration-300`}>
        {/* Header */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-gray-50'} p-4`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400  rounded-full flex items-center justify-center text-xl font-semibold">
                {usr.avatar || usr.username[0].toUpperCase()}
              </div>
              <div>
                <h2 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  {usr.username}
                </h2>

                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Online
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setSetting(!setting)}
                className={`p-2 rounded-lg transition-colors
                  ${setting
                    ? 'bg-blue-500 text-white': darkMode ? 'text-gray-300   hover:bg-gray-700' : 'text-gray-800 hover:bg-gray-100'
                  }
                `}
              >
                <Settings className="w-5 h-5" />
              </button>
              <button 
                onClick={handleLogout}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-800 hover:bg-gray-100'
                }`}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
            <div className={`relative overflow-hidden  transition-all duration-500 ${setting ? 'max-h-0 opacity-0': 'max-h-20 opacity-100'}`}>
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                  ${darkMode ? 'bg-gray-700 text-white placeholder-gray-400 focus:border focus:outline-none' : 'bg-gray-100 text-gray-800 placeholder-gray-500 border'
                  }
                `}
              />
            </div>
        </div>

       {/* Settings */}
        {/* <div 
          className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} border-b transition-all duration-300 overflow-hidden ${
            setting ? 'max-h-[1000px] p-4' : 'max-h-0 p-0'
          }`}
        > */}
        <div className={`${setting ? 'max-h-[1000px] py-4 px-4' : 'max-h-0 py-0 px-4'} ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} border-b overflow-hidden transition-all duration-500`}>
            <h3 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-800'}`}>Settings</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center  gap-2">
                  {darkMode ? <Moon className="w-5  h-5" /> : <Sun className="w-5 h-5" />}
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Dark Mode</span>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`w-12 h-6 rounded-full transition-colors ${ darkMode ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Notifications</span>
                </div>
                <button
                  onClick={() => setNotifications(!notifications)}
                  className={`w-12 h-6 rounded-full transition-colors ${notifications ? 'bg-blue-500': 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full   transition-transform ${notifications ? 'translate-x-6': 'translate-x-1'}`} />
                </button>
              </div>

              <div className={`pt-3 border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-5 h-5" />
                  <span className={darkMode ? 'text-gray-300': 'text-gray-700'}>Profile</span>
                </div>

                {/* Full Name*/}
                <div className="mb-3">
                  <label className={`text-xs  font-semibold mb-1 block ${darkMode ? 'text-gray-400': 'text-gray-600'}`}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={usr.fullName}
                    onChange={(e) => setUsr({...usr, fullName: e.target.value})}
                    placeholder="Enter full name..."
                    className={`w-full px-3 py-2 rounded-lg ${darkMode ? 'bg-gray-600 text-white placeholder-gray-400': 'bg-white border border-gray-300 text-gray-800'}`}
                  />
                </div>
                
                {/* Username */}
                <div className="mb-3">
                  <label className={`text-xs font-semibold mb-1 block ${darkMode ? 'text-gray-400': 'text-gray-600'}`}>
                    Username
                  </label>
                  <input
                    type="text"
                    value={usr.username}
                    onChange={(e) => setUsr({...usr, username: e.target.value})}
                    placeholder="Enter username"
                    className={`w-full px-3 py-2 rounded-lg ${darkMode ? 'bg-gray-600 text-white placeholder-gray-400': 'bg-white border border-gray-300 text-gray-800'}`}
                  />
                </div>

                {/* Bio */}
                <div className="mb-3">
                  <label className={`text-xs font-semibold mb-1 block ${darkMode ? 'text-gray-400': 'text-gray-600'}`}>
                    Bio
                  </label>
                  <textarea
                    value={usr.bio}
                    onChange={(e) => setUsr({...usr, bio: e.target.value})}
                    placeholder="Update your bio"
                    rows="3"
                    className={`w-full px-3 py-2 rounded-lg resize-none ${darkMode ? 'bg-gray-600 text-white placeholder-gray-400': 'bg-white border border-gray-300 text-gray-800'
                    }`}
                  />
                </div>

                <button
                  onClick={() => updateProf({username: usr.username, fullName: usr.fullName, bio: usr.bio})}
                  className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>

        {/* Conversations */}
        {!setting && (
          <>
            <div className="border-b">
              <button
                onClick={() => setAddFr(true)}
                className={`w-full p-4 flex items-center gap-3 transition-colors ${darkMode ? 'hover:bg-gray-700  border-gray-700': 'hover:bg-blue-50 border-gray-200'
                }`}
              >
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                  <UserPlus className="w-6 h-6  text-white" />
                </div>
                <span className={`font-semibold ${darkMode ? 'text-blue-400': 'text-blue-600'}`}>
                  Add Friend
                </span>
              </button>


              <button
              onClick={() => {
                setShowRecms(true);
                loadRecs();
              }}
              className={`w-full p-4 flex items-center gap-3 transition-colors border-t ${
                darkMode ? 'hover:bg-gray-700 border-gray-700' : 'hover:bg-blue-50 border-gray-200'
              }`}
            >
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                Friend Recommendations
              </span>
            </button>

              <button
                onClick={() => setFriendReqs(true)}
                className={`w-full p-4 flex items-center gap-3 transition-colors border-t ${darkMode ? 'hover:bg-gray-700 border-gray-700': 'hover:bg-blue-50 border-gray-200'}`}
              >
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center  relative">
                  <Bell className="w-6 h-6 text-white " />
                  {frReqs.received.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {frReqs.received.length}
                    </span>
                  )}
                </div>
                <span className={`font-semibold ${darkMode ? 'text-blue-400': 'text-blue-600'}`}>
                  Friend Requests
                </span>
              </button>

              <button
                onClick={() => setNewChat(true)}
                className={`w-full p-4 flex items-center gap-3 transition-colors border-t ${
                  darkMode 
                    ? 'hover:bg-gray-700 border-gray-700' 
                    : 'hover:bg-blue-50 border-gray-200'
                }`}
              >
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                  <Plus className="w-6 h-6 text-white" />
                </div>
                <span className={`font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                  New Conversation
                </span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filterConvs.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => {
                    setSel(conv);
                    // setSide(false);
                    setGroupInf(false);
                    setConvs(prev => prev.map(c => 
                      c.id === conv.id ? { ...c, unreadCount: 0 } : c
                    ));
                  }}
                  className={`p-4 flex items-center gap-3 cursor-pointer transition-colors border-b ${
                    darkMode ? 'border-gray-700' : 'border-gray-200'
                  } ${
                    sel?.id === conv.id 
                      ? darkMode ? 'bg-gray-700' : 'bg-blue-50'
                      : darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-2xl">
                      {conv.avatar}
                    </div>
                    {conv.online && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className={`font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                        {conv.name}
                      </h3>
                      <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {formatTime(conv.lastMsgTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {conv.lastMessage}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>



      {/* Add Friend */}
      {addFr && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${darkMode ? 'bg-gray-800/30' : 'bg-white/30'} backdrop-blur-lg border border-white/20 rounded-2xl w-full max-w-md p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Add Friend
              </h2>
              <button 
                onClick={() => {
                  setAddFr(false);
                  setFrSearchQ('');
                  setFrSeachR([]);
                }}
                className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <X className={`${darkMode ? 'text-gray-300' : 'text-gray-800'} w-5 h-5`} />
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={frSearchQ}
                onChange={(e) => {
                  setFrSearchQ(e.target.value);
                  searchhFriend(e.target.value);
                }}
                placeholder="Search by username..."
                className={`w-full pl-10 pr-4 py-3 rounded-lg bg-white/40 ${
                  darkMode 
                    ? 'bg-gray-700 text-white placeholder-gray-400' 
                    : 'bg-gray-100 text-gray-800'
                }`}
              />
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {frSeachR.map(user => {
                const isFriend = friends.some(f => f._id === user._id);
                const hasPendingRequest = frReqs.sent.some(req => req.recipientId._id === user._id);
                
                return (
                  <div
                    key={user._id}
                    className={`p-3 rounded-lg flex items-center gap-3 ${
                      darkMode ? 'bg-gray-700' : 'bg-white/60'
                    }`}
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-xl">
                      {user.avatar || user.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                        {user.username}
                      </div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} truncate`}>
                        {user.bio || user.email}
                      </div>
                    </div>
                    {isFriend ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                        Friends
                      </span>
                    ) : hasPendingRequest ? (
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm rounded-full">
                        Pending
                      </span>
                    ) : (
                      <button
                        onClick={() => senddFriend(user._id)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        Add
                      </button>
                    )}
                  </div>
                );
              })}
              
              {frSearchQ.length >= 2 && frSeachR.length === 0 && (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  No users found
                </div>
              )}
              
              {frSearchQ.length < 2 && (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Type at least 2 characters to search
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Friend Requests*/}
      {friendReqs && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${darkMode ? 'bg-gray-800/30' : 'bg-white/30'} backdrop-blur-lg border border-white/20 rounded-2xl w-full max-w-md p-6 max-h-[80vh] flex flex-col`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Friend Requests
              </h2>
              <button 
                onClick={() => setFriendReqs(false)}
                className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <X className={`${darkMode ? 'text-gray-300' : 'text-gray-800'} w-5 h-5`} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Received Requests */}
              <div>
                <h3 className={`font-semibold mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Received ({frReqs.received.length})
                </h3>
                {frReqs.received.length === 0 ? (
                  <p className={`text-sm text-center py-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    No pending requests
                  </p>
                ) : (
                  <div className="space-y-2">
                    {frReqs.received.map(request => (
                      <div
                        key={request._id}
                        className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-white/60'}`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-xl">
                            {request.senderId?.avatar || request.senderId?.username?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                              {request.senderId?.username || 'Unknown User'}
                            </div>
                            <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} truncate`}>
                              {request.senderId?.bio || request.senderId?.email || 'No bio'}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => accReq(request._id)}
                            className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => declineReq(request._id)}
                            className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sent Requests */}
              <div className={`pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <h3 className={`font-semibold mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Sent ({frReqs.sent.length})
                </h3>
                {frReqs.sent.length === 0 ? (
                  <p className={`text-sm text-center py-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    No pending requests
                  </p>
                ) : (
                  <div className="space-y-2">
                    {frReqs.sent.map(request => (
                      <div
                        key={request._id}
                        className={`p-3 rounded-lg flex items-center gap-3 ${
                          darkMode ? 'bg-gray-700' : 'bg-white/60'
                        }`}
                      >
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-xl">
                          {request.recipientId?.avatar || request.recipientId?.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                            {request.recipientId?.username || 'Unknown User'}
                          </div>
                          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Pending
                          </div>
                        </div>
                        <button
                          onClick={() => cancleReq(request._id)}
                          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Add Members */}
      {addMem && sel?.type === 'group' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${darkMode ? 'bg-gray-800/30' : 'bg-white/30'} backdrop-blur-lg border border-white/20 rounded-2xl w-full max-w-md p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Add Members to {sel.name}
              </h2>
              <button 
                onClick={() => {
                  setAddMem(false);
                  setMemToAdd([]);
                }}
                className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <X className={`${darkMode ? 'text-gray-300' : 'text-gray-800'} w-5 h-5`} />
              </button>
            </div>

            <div className={`mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <p className="text-sm mb-2">Select friends to add ({memToAdd.length})</p>
            </div>

            <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
              {friends.filter(friend => 
                !sel.participants.some(p => p.userId === friend._id)
              ).length === 0 ? (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p>All your friends are already in this group</p>
                </div>
              ) : (
                friends
                  .filter(friend => !sel.participants.some(p => p.userId === friend._id))
                  .map(friend => (
                    <div
                      key={friend._id}
                      onClick={() => {
                        setMemToAdd(prev => {
                          const exists = prev.find(u => u.id === friend._id);
                          if (exists) {
                            return prev.filter(u => u.id !== friend._id);
                          }
                          return [...prev, {
                            id: friend._id, username: friend.username, avatar: friend.avatar,
                              bio: friend.bio
                          }];
                        });
                      }}
                      className={`p-3 rounded-lg cursor-pointer transition-all flex items-center gap-3 ${
                        memToAdd.find(u => u.id === friend._id)
                          ? 'bg-blue-500 text-white'
                          : darkMode 
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-800'
                      }`}
                    >
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-xl">
                        {friend.avatar || friend.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold">{friend.username}</div>
                        <div className={`text-xs ${
                          memToAdd.find(u => u.id === friend._id) 
                            ? 'text-blue-100' 
                            : darkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          {friend.bio || 'No bio'}
                        </div>
                      </div>
                      {onlineUsers.has(friend._id) && (
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      )}
                    </div>
                  ))
              )}
            </div>

            <button
              onClick={addMembersToGroup}
              disabled={memToAdd.length === 0}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Selected Members
            </button>
          </div>
        </div>
      )}



      {/* New Chat*/}
      {newChat && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          {/* <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-2xl w-full max-w-md p-6`}> */}
          <div className={`${darkMode ? 'bg-gray-800/30' : 'bg-white/30'} backdrop-blur-lg border border-white/20 rounded-2xl w-full max-w-md p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                New Conversation
              </h2>
              <button 
                onClick={() => {
                  setNewChat(false);
                  setSelUsers([]);
                  setGroupName('');
                }}
                className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <X className={`${darkMode ? 'text-gray-300' : 'text-gray-800'} w-5 h-5`} />
              </button>
            </div>

            <div className="flex mb-6 bg-white/20 rounded-lg p-1">
              <button
                onClick={() => setChatType('private')}
                className={`flex-1 py-2 rounded-md transition-all ${
                  chatType === 'private' 
                    ? 'bg-white/60 shadow text-gray-800 font-semibold' 
                    : 'text-gray-600'
                }`}
              >
                Private
              </button>
              <button
                onClick={() => setChatType('group')}
                className={`flex-1 py-2 rounded-md transition-all ${
                  chatType === 'group' 
                    ? 'bg-white/60 shadow text-gray-800 font-semibold' 
                    : 'text-gray-600'
                }`}
              >
                Group
              </button>
            </div>

            {chatType === 'group' && (
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                className={`w-full px-4 py-2 rounded-lg bg-white/40 mb-4 ${
                  darkMode 
                    ? 'bg-gray-700 text-white placeholder-gray-400' 
                    : 'bg-gray-100 text-gray-800'
                }`}
              />
            )}

            <div className={`mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <p className="text-sm mb-2">
                Select {chatType === 'private' ? 'user' : 'users'} ({selUsers.length})
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
              {friends.length === 0 ? (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p>No friends yet</p>
                  <p className="text-sm mt-2">Add friends to start chatting</p>
                </div>
              ) : (
                friends.map(friend => (
                  <div
                    key={friend._id}
                    onClick={() => {
                      if (chatType === 'private') {
                        setSelUsers([{
                          id: friend._id,
                          username: friend.username,
                          avatar: friend.avatar,
                          bio: friend.bio
                        }]);
                      } else {
                        setSelUsers(prev => {
                          const exists = prev.find(u => u.id === friend._id);
                          if (exists) {
                            return prev.filter(u => u.id !== friend._id);
                          }
                          return [...prev, {
                            id: friend._id, username: friend.username, avatar: friend.avatar,
                              bio: friend.bio
                          }];
                        });
                      }
                    }}
                    className={`p-3 rounded-lg cursor-pointer transition-all flex items-center gap-3 ${
                      selUsers.find(u => u.id === friend._id)
                        ? 'bg-blue-500 text-white'
                        : darkMode 
                          ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-800'
                    }`}
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-xl">
                      {friend.avatar || friend.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{friend.username}</div>
                      <div className={`text-xs ${
                        selUsers.find(u => u.id === friend._id)? 'text-blue-100': darkMode ? 'text-gray-400': 'text-gray-500'
                      }`}>
                        {friend.bio || 'No bio'}
                      </div>
                    </div>
                    {onlineUsers.has(friend._id) && (
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    )}
                  </div>
                ))
              )}
            </div>

            <button
              onClick={createConv}
              disabled={selUsers.length === 0}
              className="w-full bg-black/60 text-white py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Conversation
            </button>
          </div>
        </div>
      )}



      {showRecms && (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`${darkMode ? 'bg-gray-800/95' : 'bg-white/95'} backdrop-blur-xl rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col`}>
        
        {/* Header */}
        <div className={`p-6 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h2 className={`text-2xl font-bold ${darkMode? 'text-white': 'text-gray-800'}`}>
                Friend Recommendations
              </h2>
            </div>
            <button onClick={() => setShowRecms(false)} className="p-2 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loadingRecs ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Loading...</p>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-12">
            <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>No recommendations yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div key={rec.userId} className={`p-4 rounded-xl flex items-center gap-4 ${
                darkMode ? 'bg-gray-700/50' : 'bg-white shadow-sm'
              }`}>
                <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-xl font-bold text-white relative">
                  {rec.avatar || rec.username[0].toUpperCase()}
                  {rec.score && (
                    <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      rec.score >= 0.8 ? 'bg-green-500' : rec.score >= 0.6 ? 'bg-blue-500' : 'bg-yellow-500'
                    } text-white`}>
                      {Math.round(rec.score * 100)}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold truncate ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                    {rec.username}
                  </h3>
                  <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {rec.bio || 'No bio'}
                  </p>
                  {rec.mutualFriends !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      {rec.mutualFriends} mutual {rec.mutualFriends === 1 ? 'friend' : 'friends'}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => senddFriend(rec.userId)}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
)}

      {/* Chat Area */}
      <div className="flex-1 flex-col flex">
        {sel ? (
          <>
            {/* Chat Header */}
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} border-b p-4 flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setSide(true);
                    setSel(null);
                  }}
                  className={`md:hidden p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setSide(!side)}
                  className={`hidden md:block p-2 rounded-lg ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                >
                  <Menu className="w-5 h-5" />
                </button>
                {/* <div 
                  className="relative cursor-pointer"
                  onClick={() => sel.type === 'group' && setGroupInf(!groupInf)}
                > */}
                <div 
                  className="relative cursor-pointer"
                  onClick={() => {
                    if (sel.type === 'group') {
                      setGroupInf(!groupInf);
                    } else {
                      avatarClick();
                    }
                  }}
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-xl">
                    {sel.avatar}
                  </div>
                  {sel.online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2  border-white "></div>
                  )}
                </div>
                <div>
                  <h3 className={`font-semibold ${darkMode? 'text-white': 'text-gray-800'}`}>
                    {sel.name}
                  </h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {typingUsers[sel.id] 
                      ? `${typingUsers[sel.id]} is typing...`
                      : sel.type === 'group'
                        ? `${sel.participants.length} members`
                        : sel.online ? 'online' : 'offline'
                    }
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setChatSearch(!chatSearch);
                    setChatSQ('');
                    setChatSearchMatch([]);
                  }}
                  className={`p-2 rounded-lg transition-colors text-gray-300 ${
                    chatSearch? 'bg-blue-500 text-white': darkMode? 'hover:bg-gray-700': 'text-black hover:bg-gray-100'
                  }`}
                >
                  <Search className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Chat Search Bar */}
            {chatSearch && (
              <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} border-b p-3`}>
                <div className="flex items-center gap-2">

                  <div className="flex-1 relative">
                    
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={chatSQ}
                      onChange={(e) => setChatSQ(e.target.value)}
                      placeholder="Search in conversation..."
                      className={`w-full pl-9 pr-3 py-2 rounded-lg ${darkMode? 'bg-gray-700 text-white placeholder-gray-400': 'bg-gray-100 text-gray-800'
                      }`}
                      autoFocus
                    />
                  </div>
                  
                  {chatSearchMatch.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        {matchInd + 1} / {chatSearchMatch.length}
                      </span>
                      <button
                        onClick={() => setMatchInd(prev => 
                          prev > 0 ? prev - 1 : chatSearchMatch.length - 1
                        )}
                        className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setMatchInd(prev => 
                          prev < chatSearchMatch.length - 1 ? prev + 1 : 0
                        )}
                        className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                      >
                        <ArrowLeft className="w-4 h-4 transform rotate-180" />
                      </button>
                    </div>
                  )}
                  
                  <button
                    onClick={() => {
                      setChatSearch(false);
                      setChatSQ('');
                    }}
                    className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                  >
                    <X className={`${darkMode ? 'text-gray-300' : 'text-gray-800'} w-4 h-4`} />
                  </button>
                </div>
                
                {chatSQ && chatSearchMatch.length === 0 && (
                  <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    No messages found
                  </p>
                )}
              </div>
            )}
          

            {/* Group Info */}
            {groupInf && sel.type === 'group' && (
              <div className={`absolute right-0 top-16 bottom-0 w-80 ${darkMode ? 'bg-gray-800' : 'bg-white'} border-l shadow-lg z-10 overflow-y-auto`}>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Group Info</h3>
                    <button onClick={() => setGroupInf(false)}>
                      <X className={`${darkMode ? 'text-gray-300' : 'text-gray-800'} w-5 h-5`} />
                    </button>
                  </div>

                  <div className="text-center mb-6">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-4xl mx-auto mb-2">
                      {sel.avatar}
                    </div>
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                      {sel.name}
                    </h2>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {sel.description}
                    </p>

                  </div>

                  <div className={`mb-4 pb-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <h4 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                      Members ({sel.participants.length})
                    </h4>
                    <div className="space-y-2">
                      {sel.participants.map(participant => (
                        <div key={participant.userId} className="flex items-center gap-3 p-2 rounded-lg">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-xl relative">
                            {participant.avatar}
                            {onlineUsers.has(participant.userId) && (
                              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                              {participant.username}
                            </div>
                            <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {participant.role === 'admin' ? 'Admin' : 'Member'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {sel.participants.find(p => p.userId === usr.id)?.role === 'admin' && (
                    <button 
                      onClick={() => setAddMem(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <UserPlus className="w-5 h-5" />
                      Add Members
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Profile */}
            {showProf && (
              <div 
                className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
                onClick={() => setShowProf(null)}
              >

                <div 
                  className={`${darkMode ? 'bg-gray-800/95' : 'bg-white/95'} backdrop-blur-xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-3xl w-full max-w-sm p-8 transform transition-all`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Close Button */}
                  <button
                    onClick={() => setShowProf(null)}
                    className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${
                      darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                    }`}
                  >
                    <X className={`${darkMode ? 'text-gray-300' : 'text-gray-800'} w-5 h-5`} />
                  </button>

                  <div className="text-center">
                    {/* Avatar */}
                    <div className="relative inline-block mb-4">
                      <div className="w-24 h-24 bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 rounded-full flex items-center justify-center text-4xl shadow-lg">
                        {showProf.avatar}
                      </div>
                      {showProf.status === 'online' && (
                        <div className="absolute bottom-2 right-2 w-5 h-5 bg-green-500 rounded-full border-4 border-white shadow-lg"></div>
                      )}
                    </div>

                    <h2 className={`text-2xl font-bold mb-1 ${darkMode? 'text-white': 'text-gray-800'}`}>
                      {showProf.fullName}
                    </h2>
                    <p className={`text-sm mb-4 ${darkMode? 'text-gray-400': 'text-gray-600'}`}>
                      @{showProf.username}
                    </p>
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 ${
                      showProf.status === 'online' 
                        ? 'bg-green-100 text-green-700' 
                        : darkMode ? 'bg-gray-700 text-gray-300': 'bg-gray-100 text-gray-700'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        showProf.status === 'online'? 'bg-green-500': 'bg-gray-400'
                      }`}></div>
                      <span className="text-sm font-medium capitalize">
                        {showProf.status}
                      </span>
                    </div>
                    <div className={`${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-2xl p-4 mb-6`}>
                      <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
                        darkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        Bio
                      </h3>
                      <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {showProf.bio}
                      </p>
                    </div>



                    <button
                      onClick={() => setShowProf(null)}
                      className="w-full py-3 bg-black/60 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}


            {/* Messages Area */}
            <div 
              className={`flex-1 overflow-y-auto p-4 space-y-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
              onScroll={scroll}
            >
              {(messages[sel.id] || []).map((msg, idx) => {
                const isCurrentUser = msg.senderId === usr.id;
                const showAvatar = idx === 0 || messages[sel.id][idx - 1].senderId !== msg.senderId;
                const isMatch = chatSearchMatch.some(match => match.msg.id === msg.id);
                const isCurrentMatch = chatSearchMatch[matchInd]?.msg.id === msg.id;
                
                return (
                  <div 
                    key={msg.id} 
                    id={`msg-${msg.id}`}
                    className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} transition-all ${
                      isCurrentMatch ? 'scale-105' : ''
                    }`}
                  >
                    <div className={`flex gap-2 max-w-md ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                      {!isCurrentUser && showAvatar && (
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                          {sel.avatar}
                        </div>
                      )}
                      {!isCurrentUser && !showAvatar && <div className="w-8"></div>}
                      
                      <div>
                        {!isCurrentUser && showAvatar && sel.type === 'group' && (
                          <p className={`text-xs mb-1 ml-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {msg.senderName}
                          </p>
                        )}
                        <div className={`px-4 py-2 rounded-2xl ${
                          isCurrentMatch? 'ring-2 ring-yellow-400 bg-yellow-100': isMatch? 'ring-1 ring-yellow-300': 
                            darkMode ? isCurrentUser ? 'bg-gray-800 text-white': 'bg-gray-800 text-white': 'bg-white text-gray-800 shadow-sm'}`}>
                          {msg.type === 'text' && <p>{msg.content}</p>}
                          
                          {msg.type === 'audio' && (
                            <div className="flex items-center gap-2">
                              <audio controls className="max-w-xs">
                                <source src={msg.fileUrl} type="audio/webm" />
                                <source src={msg.fileUrl} type="audio/mp4" />
                                Your browser does not support the audio element.
                              </audio>
                              <span className="text-sm">{formatDuration(msg.duration || 0)}</span>
                            </div>
                          )}

                          {msg.type === 'file' && (
                            <div className="flex items-center gap-3 min-w-[200px]">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold truncate">
                                  {msg.fileName || msg.content}
                                </div>
                                <div className={`text-xs ${
                                  isCurrentUser ? 'text-blue-100' : darkMode ? 'text-gray-400' : 'text-gray-500'
                                }`}>
                                  {formatFileSize(msg.fileSize || 0)}
                                </div>
                              </div>
                              <a
                                href={msg.fileUrl}
                                download={msg.fileName}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-2 rounded-lg transition-colors ${isCurrentUser ? 'hover:bg-white/20': darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ArrowLeft className="w-5 h-5 transform rotate-[-90deg]" />
                              </a>
                            </div>
                          )}
                          
                            <div className={`flex items-center gap-1 mt-1 text-xs ${
                              darkMode ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                            <span>{formatTime(msg.timestamp)}</span>
                            {isCurrentUser && getStatusIcon(msg.status)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            {/* Scroll to Bottom */}
            {scrollbottom && (
              <div className="absolute bottom-24 right-8 z-20">
                <button
                  onClick={scrollToBottom}
                  className={`p-3 rounded-full shadow-lg transition-all hover:scale-110 ${
                    darkMode 
                      ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                      : 'bg-white hover:bg-gray-50 text-gray-800'
                  }`}
                  title="Scroll to bottom"
                >
                  <ArrowLeft className="w-5 h-5 transform rotate-[-90deg]" />
                </button>
              </div>
            )}



            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} border-t p-4`}>
              {(isRecording || isUploading) && (
                <div className={`mb-3 flex items-center gap-3 p-3 rounded-lg ${
                  isUploading ? 'bg-blue-100' : 'bg-red-100'
                }`}>
                  <div className={`w-3 h-3 rounded-full ${
                    isUploading ? 'bg-blue-500' : 'bg-red-500 animate-pulse'
                  }`}></div>
                  <span className={`font-semibold ${
                    isUploading ? 'text-blue-600' : 'text-red-600'
                  }`}>
                    {isUploading ? 'Uploading...' : `Recording: ${formatDuration(recTime)}`}
                  </span>
                  {isRecording && (
                    <button
                      onClick={stopRecording}
                      className="ml-auto p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <StopCircle className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-end gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading || isRecording}
                />
                
                {/* ADD FILE BUTTON */}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={isUploading || isRecording}
                  className={`p-3 rounded-full transition-all ${
                    darkMode 
                      ? 'hover:bg-gray-700 text-gray-300' 
                      : 'hover:bg-gray-100 text-gray-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="Send file (max 25MB)"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                
                <div className={`flex-1 rounded-2xl px-4 py-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <textarea
                    value={msgIn}
                    onChange={(e) => {
                      setMsgIn(e.target.value);
                      handleTyping();
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMsg();
                      }
                    }}
                    placeholder="Type a message..."
                    className={`w-full bg-transparent resize-none focus:outline-none ${darkMode ? 'text-white' : 'text-gray-800'}`}
                    rows="1"
                    disabled={isUploading || isRecording}
                  />
                </div>
                
                {msgIn.trim() ? (
                  <button
                    onClick={sendMsg}
                    disabled={isUploading || isRecording}
                    className="p-3 bg-blue-500 rounded-full text-white hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={isRecording ? stopRecording: startRecording}
                    disabled={isUploading}
                    className={`p-3 rounded-full transition-all ${
                      isRecording 
                        ? 'bg-red-500 text-white hover:bg-red-600' 
                        : 'bg-blue-500 text-white hover:from-blue-600 hover:to-purple-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className={`flex-1 flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="text-center">
              <p className={`${darkMode ? 'text-gray-400': 'text-gray-600'}`}>
                Select a conversation to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatApp;