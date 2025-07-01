// === Firebase config ===
const firebaseConfig = {
  apiKey: "AIzaSyAun2CwLPEguSFdNbK3UJKzhBCYag8p08A",
  authDomain: "chattigo-464317.firebaseapp.com",
  projectId: "chattigo-464317",
  storageBucket: "chattigo-464317.firebasestorage.app",
  messagingSenderId: "462066177305",
  appId: "1:462066177305:web:ca0f2491365cebf6f9a188",
  measurementId: "G-6LH7TBYR05"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// === PWA ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}

// === Глобальные переменные ===
let currentUser = null;
let localStream = null;
let remoteStream = null;
let pc = null;
let roomId = null;
let callTimer = null;
let callStartTime = null;
let micEnabled = true;
let camEnabled = true;
let isSearching = false;
let myQueueRef = null;

// === DOM элементы ===
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const timerDisplay = document.getElementById('timerDisplay');
const micToggle = document.getElementById('micToggle');
const camToggle = document.getElementById('camToggle');
const endCallBtn = document.getElementById('endCallBtn');
const authModal = document.getElementById('authModal');
const searchModal = document.getElementById('searchModal');

// === Инициализация ===
async function init() {
  await initAuth();
  await startLocalVideo();
  setupEventListeners();
}

// === Авторизация ===
async function initAuth() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      showAuthModal();
      return;
    }
    
    currentUser = user;
    hideAuthModal();
    
    // Обновляем онлайн статус
    const onlineRef = db.ref(`online/${user.uid}`);
    onlineRef.set(true);
    onlineRef.onDisconnect().remove();
    
    // Начинаем поиск собеседника
    startSearching();
  });
}

function showAuthModal() {
  authModal.classList.remove('hidden');
}

function hideAuthModal() {
  authModal.classList.add('hidden');
}

// === Настройка обработчиков событий ===
function setupEventListeners() {
  // Авторизация
  document.getElementById('authForm').addEventListener('submit', handleLogin);
  document.getElementById('regBtn').addEventListener('click', handleRegister);
  document.getElementById('anonBtn').addEventListener('click', handleAnonymousLogin);
  document.getElementById('googleBtn').addEventListener('click', handleGoogleLogin);
  
  // Управление звонком
  micToggle.addEventListener('click', toggleMicrophone);
  camToggle.addEventListener('click', toggleCamera);
  endCallBtn.addEventListener('click', endCall);
  
  // Чат
  chatForm.addEventListener('submit', sendMessage);
  
  // Поиск
  document.getElementById('cancelSearch').addEventListener('click', cancelSearch);
}

// === Обработчики авторизации ===
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPass').value;
  
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    alert('Ошибка входа: ' + error.message);
  }
}

async function handleRegister() {
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPass').value;
  
  try {
    await auth.createUserWithEmailAndPassword(email, password);
  } catch (error) {
    alert('Ошибка регистрации: ' + error.message);
  }
}

async function handleAnonymousLogin() {
  try {
    await auth.signInAnonymously();
  } catch (error) {
    alert('Ошибка анонимного входа: ' + error.message);
  }
}

async function handleGoogleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (error) {
    alert('Ошибка входа через Google: ' + error.message);
  }
}

// === Работа с видео ===
async function startLocalVideo() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localVideo.srcObject = localStream;
  } catch (error) {
    console.error('Ошибка доступа к камере/микрофону:', error);
    alert('Не удалось получить доступ к камере и микрофону. Проверьте разрешения.');
  }
}

function toggleMicrophone() {
  micEnabled = !micEnabled;
  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = micEnabled;
    });
  }
  micToggle.style.opacity = micEnabled ? '1' : '0.5';
}

function toggleCamera() {
  camEnabled = !camEnabled;
  if (localStream) {
    localStream.getVideoTracks().forEach(track => {
      track.enabled = camEnabled;
    });
  }
  camToggle.style.opacity = camEnabled ? '1' : '0.5';
}

// === Поиск собеседника ===
function startSearching() {
  if (isSearching) return;
  
  isSearching = true;
  showSearchModal();
  
  const queueRef = db.ref('queue');
  myQueueRef = queueRef.push({
    uid: currentUser.uid,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
  
  myQueueRef.onDisconnect().remove();
  
  // Слушаем других пользователей в очереди
  queueRef.on('child_added', (snapshot) => {
    const data = snapshot.val();
    const key = snapshot.key;
    
    if (data.uid !== currentUser.uid && key !== myQueueRef.key) {
      // Найден собеседник
      connectWithPartner(data.uid, key);
    }
  });
}

function showSearchModal() {
  searchModal.classList.remove('hidden');
}

function hideSearchModal() {
  searchModal.classList.add('hidden');
}

function cancelSearch() {
  if (myQueueRef) {
    myQueueRef.remove();
    myQueueRef = null;
  }
  isSearching = false;
  hideSearchModal();
  
  // Можно добавить логику возврата к главному экрану
}

// === WebRTC соединение ===
async function connectWithPartner(partnerUid, partnerKey) {
  hideSearchModal();
  isSearching = false;
  
  // Удаляем записи из очереди
  if (myQueueRef) {
    myQueueRef.remove();
    myQueueRef = null;
  }
  db.ref(`queue/${partnerKey}`).remove();
  
  // Создаем ID комнаты
  roomId = [currentUser.uid, partnerUid].sort().join('_');
  
  // Настраиваем WebRTC
  await setupPeerConnection();
  
  // Начинаем таймер звонка
  startCallTimer();
  
  // Слушаем чат
  listenToChat();
}

async function setupPeerConnection() {
  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
  
  pc = new RTCPeerConnection(configuration);
  
  // Добавляем локальные треки
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }
  
  // Обрабатываем удаленные треки
  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };
  
  // Обрабатываем ICE кандидатов
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      db.ref(`rooms/${roomId}/candidates/${currentUser.uid}`).push(
        event.candidate.toJSON()
      );
    }
  };
  
  // Слушаем изменения состояния соединения
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || 
        pc.connectionState === 'failed' || 
        pc.connectionState === 'closed') {
      handlePeerDisconnection();
    }
  };
  
  // Инициируем соединение
  await initiateConnection();
}

async function initiateConnection() {
  const roomRef = db.ref(`rooms/${roomId}`);
  
  // Создаем offer если мы инициатор (по UID)
  const partnerUid = roomId.split('_').find(uid => uid !== currentUser.uid);
  const isInitiator = currentUser.uid < partnerUid;
  
  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await roomRef.child('offer').set({
      sdp: offer.sdp,
      type: offer.type
    });
    
    // Слушаем answer
    roomRef.child('answer').on('value', async (snapshot) => {
      const answer = snapshot.val();
      if (answer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });
  } else {
    // Слушаем offer
    roomRef.child('offer').on('value', async (snapshot) => {
      const offer = snapshot.val();
      if (offer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await roomRef.child('answer').set({
          sdp: answer.sdp,
          type: answer.type
        });
      }
    });
  }
  
  // Слушаем ICE кандидатов
  roomRef.child('candidates').on('child_added', (snapshot) => {
    const candidateData = snapshot.val();
    const senderId = snapshot.ref.parent.key;
    
    if (senderId !== currentUser.uid) {
      Object.values(candidateData).forEach(candidate => {
        pc.addIceCandidate(new RTCIceCandidate(candidate));
      });
    }
  });
}

function handlePeerDisconnection() {
  alert('Собеседник отключился');
  endCall();
}

// === Таймер звонка ===
function startCallTimer() {
  callStartTime = Date.now();
  callTimer = setInterval(updateTimer, 1000);
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function stopCallTimer() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
  timerDisplay.textContent = '00:00';
}

// === Чат ===
function sendMessage(e) {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message || !roomId) return;
  
  const messageData = {
    text: message,
    sender: currentUser.uid,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  
  db.ref(`rooms/${roomId}/messages`).push(messageData);
  chatInput.value = '';
}

function listenToChat() {
  if (!roomId) return;
  
  db.ref(`rooms/${roomId}/messages`).on('child_added', (snapshot) => {
    const message = snapshot.val();
    displayMessage(message);
  });
}

function displayMessage(message) {
  const messageElement = document.createElement('div');
  const isOwnMessage = message.sender === currentUser.uid;
  
  messageElement.className = `chat-message ${isOwnMessage ? 'sent' : 'received'}`;
  messageElement.innerHTML = `
    ${!isOwnMessage ? `
      <div class="message-avatar">
        <img src="https://i.pravatar.cc/32?u=${message.sender}" alt="Avatar">
      </div>
    ` : ''}
    <div class="message-content">
      <div class="message-text">${message.text}</div>
      <div class="message-time">${new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}</div>
    </div>
  `;
  
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// === Завершение звонка ===
function endCall() {
  // Останавливаем таймер
  stopCallTimer();
  
  // Закрываем соединение
  if (pc) {
    pc.close();
    pc = null;
  }
  
  // Удаляем комнату
  if (roomId) {
    db.ref(`rooms/${roomId}`).remove();
    roomId = null;
  }
  
  // Останавливаем локальное видео
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  // Перезагружаем страницу для нового поиска
  location.reload();
}

// === Обработка отключения ===
window.addEventListener('beforeunload', () => {
  if (roomId) {
    db.ref(`rooms/${roomId}`).remove();
  }
  if (myQueueRef) {
    myQueueRef.remove();
  }
});

// Запуск приложения
init();
