console.log('app.js loaded');
// === Firebase config ===
const firebaseConfig = {
  apiKey: "AIzaSyAun2CwLPEguSFdNbK3UJKzhBCYag8p08A",
  authDomain: "chattigo-464317.firebaseapp.com",
  projectId: "chattigo-464317",
  storageBucket: "chattigo-464317.appspot.com",
  messagingSenderId: "462066177305",
  appId: "1:462066177305:web:ca0f2491365cebf6f9a188",
  measurementId: "G-6LH7TBYR05",
  databaseURL: "https://chattigo-464317-default-rtdb.europe-west1.firebasedatabase.app/"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// === DOM ===
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const micBtn = document.getElementById('micBtn');
const camBtn = document.getElementById('camBtn');
const stopBtn = document.getElementById('stopBtn');
const nextBtn = document.getElementById('nextBtn');
const chatBtn = document.getElementById('chatBtn');
const chatPanel = document.getElementById('chatPanel');
const chatOverlay = document.getElementById('chatOverlay');
const chatCloseBtn = document.getElementById('chatCloseBtn');
const typingIndicator = document.getElementById('typingIndicator');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const authModal = document.getElementById('authModal');
const searchModal = document.getElementById('searchModal');
const onlineCountEl = document.getElementById('onlineCount');
const onlineDotEl = document.getElementById('onlineDot');
const splitBtn = document.getElementById('splitBtn');
const switchCamBtn = document.getElementById('switchCamBtn');
// === Split режим ===
let splitMode = false;
if (splitBtn) {
  splitBtn.onclick = () => {
    splitMode = !splitMode;
    document.body.classList.toggle('split-mode', splitMode);
  };
}

// === Смена камеры ===
let currentFacing = 'user';
if (switchCamBtn) {
  switchCamBtn.onclick = async () => {
    currentFacing = currentFacing === 'user' ? 'environment' : 'user';
    await startLocalVideo();
  };
}

let currentUser = null;
let localStream = null;
let remoteStream = null;
let pc = null;
let roomId = null;
let micEnabled = true;
let camEnabled = true;
let audioTrack = null;
let videoTrack = null;
let isSearching = false;
let myQueueRef = null;
let lastPartnerUid = null; // Для исключения повторов

// === Онлайн-статус пользователя ===
function setOnlineStatus(isOnline) {
  if (!auth.currentUser) return;
  db.ref('presence/' + auth.currentUser.uid).set(isOnline ? true : null);
  if (isOnline) db.ref('presence/' + auth.currentUser.uid).onDisconnect().remove();
}

// === Счётчик онлайн ===
function listenOnlineCount() {
  db.ref('presence').on('value', snap => {
    const count = snap.numChildren();
    if (onlineCountEl) onlineCountEl.textContent = count;
    if (onlineDotEl) {
      onlineDotEl.classList.toggle('online', count > 0);
      onlineDotEl.classList.toggle('offline', count === 0);
    }
  });
}

// === UI: Выход из профиля ===
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.onclick = () => auth.signOut();
}

// === Auth ===
auth.onAuthStateChanged(async user => {
  if (!user) {
    authModal.classList.remove('hidden');
    setOnlineStatus(false);
    return;
  }
  currentUser = user;
  setOnlineStatus(true);
  authModal.classList.add('hidden');
  await startLocalVideo();
  startSearching();
  chatPanel.classList.remove('open'); // Чат скрыт по умолчанию
  listenOnlineCount();
});

document.getElementById('authForm').onsubmit = async e => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  const pass = document.getElementById('authPass').value;
  try { await auth.signInWithEmailAndPassword(email, pass); } catch (err) { alert(err.message); }
};
document.getElementById('regBtn').onclick = async () => {
  const email = document.getElementById('authEmail').value;
  const pass = document.getElementById('authPass').value;
  try { await auth.createUserWithEmailAndPassword(email, pass); } catch (err) { alert(err.message); }
};
document.getElementById('anonBtn').onclick = async () => {
  try { await auth.signInAnonymously(); } catch (err) { alert(err.message); }
};
document.getElementById('googleBtn').onclick = async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try { await auth.signInWithPopup(provider); } catch (err) { alert(err.message); }
};

// === Video ===
async function startLocalVideo() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Ваш браузер не поддерживает getUserMedia.');
      return;
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      video: camEnabled ? { facingMode: { ideal: currentFacing } } : false,
      audio: micEnabled
    });
    // Сохраняем ссылки на треки для управления
    audioTrack = localStream.getAudioTracks()[0] || null;
    videoTrack = localStream.getVideoTracks()[0] || null;
    localVideo.srcObject = localStream;
    localVideo.classList.remove('hidden');
    updateMicUI();
    updateCamUI();
  } catch (e) {
    alert('Ошибка доступа к камере/микрофону: ' + e.message);
    console.error(e);
  }
}

function updateMicUI() {
  micBtn.setAttribute('aria-pressed', micEnabled);
  micBtn.style.opacity = micEnabled ? '1' : '0.5';
  if (audioTrack) audioTrack.enabled = micEnabled;
}
function updateCamUI() {
  camBtn.setAttribute('aria-pressed', camEnabled);
  camBtn.style.opacity = camEnabled ? '1' : '0.5';
  localVideo.style.opacity = camEnabled ? '0.85' : '0.2';
  if (videoTrack) videoTrack.enabled = camEnabled;
}

micBtn.onclick = async () => {
  micEnabled = !micEnabled;
  if (audioTrack) {
    audioTrack.enabled = micEnabled;
    if (!micEnabled) audioTrack.stop();
  } else if (micEnabled) {
    await startLocalVideo();
  }
  updateMicUI();
};
camBtn.onclick = async () => {
  camEnabled = !camEnabled;
  if (videoTrack) {
    videoTrack.enabled = camEnabled;
    if (!camEnabled) videoTrack.stop();
  }
  if (camEnabled && !videoTrack) {
    await startLocalVideo();
  }
  updateCamUI();
};

stopBtn.onclick = () => {
  endCall();
};
nextBtn.onclick = () => {
  endCall(true);
};

// Открытие чата
chatBtn.onclick = () => {
  if (!chatPanel) return;
  chatPanel.classList.add('open');
  setTimeout(() => {
    chatInput && chatInput.focus();
  }, 120);
};

// Закрытие чата по overlay или X
function closeChatPanel() {
  chatPanel.classList.remove('open');
}
if (chatOverlay) {
  chatOverlay.onclick = closeChatPanel;
}
if (chatCloseBtn) {
  chatCloseBtn.onclick = closeChatPanel;
}

// Закрытие свайпом вниз (только мобильные)
let touchStartY = null;
if (window.matchMedia('(max-width: 600px)').matches && chatPanel) {
  const content = document.querySelector('.chat-panel-content');
  if (content) {
    content.addEventListener('touchstart', e => {
      if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
    });
    content.addEventListener('touchmove', e => {
      if (touchStartY !== null && e.touches.length === 1) {
        const deltaY = e.touches[0].clientY - touchStartY;
        if (deltaY > 60) {
          closeChatPanel();
          touchStartY = null;
        }
      }
    });
    content.addEventListener('touchend', () => { touchStartY = null; });
  }
}

// === Темы ===
const themeBtn = document.getElementById('themeBtn');
if (themeBtn) {
  themeBtn.onclick = () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : '');
  };
  // При загрузке
  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
}

// === Поиск собеседника ===
// === Atomic Matching Queue ===
function startSearching() {
  if (isSearching) return;
  isSearching = true;
  searchModal.classList.remove('hidden');
  const queueRef = db.ref('queue');
  // Добавляем себя в очередь с уникальным ключом
  myQueueRef = queueRef.push({ uid: currentUser.uid, ts: Date.now(), looking: true, last: lastPartnerUid || null });
  myQueueRef.onDisconnect().remove();

  // Слушаем только свой элемент на предмет match
  myQueueRef.on('value', async snap => {
    const val = snap.val();
    if (!val) return; // удалён
    if (val.match && val.match.uid && val.match.key) {
      // Нас выбрали, соединяемся
      connectWith(val.match.uid, val.match.key, true);
    }
  });

  // Пытаемся найти другого ожидающего пользователя (атомарно)
  tryMatch();

  document.getElementById('cancelSearch').onclick = () => {
    isSearching = false;
    if (myQueueRef) myQueueRef.remove();
    searchModal.classList.add('hidden');
    myQueueRef && myQueueRef.off();
  };
}

async function tryMatch() {
  if (!myQueueRef) return;
  const queueRef = db.ref('queue');
  // Получаем снимок очереди (один раз)
  const snap = await queueRef.once('value');
  const myKey = myQueueRef.key;
  let found = null;
  snap.forEach(child => {
    const v = child.val();
    // Исключаем себя и последнего собеседника (чтобы не повторяться подряд)
    if (
      child.key !== myKey &&
      v.looking &&
      !v.match &&
      v.uid !== lastPartnerUid &&
      v.last !== currentUser.uid // и он не только что был с нами
    ) {
      found = { uid: v.uid, key: child.key };
      return true; // break
    }
  });
  if (found) {
    // Атомарно помечаем match для себя и собеседника
    const updates = {};
    updates[myKey + '/match'] = found;
    updates[found.key + '/match'] = { uid: currentUser.uid, key: myKey };
    updates[myKey + '/looking'] = false;
    updates[found.key + '/looking'] = false;
    await queueRef.update(updates);
    // После этого оба получат событие on('value') и вызовут connectWith
  }
}

// isPassive = true, если нас выбрали, иначе false (мы инициатор)
async function connectWith(partnerUid, partnerKey, isPassive = false) {
  searchModal.classList.add('hidden');
  isSearching = false;
  lastPartnerUid = partnerUid; // Запоминаем, чтобы не повторяться
  // Удаляем себя и собеседника из очереди (только если мы инициатор)
  if (myQueueRef) myQueueRef.off();
  if (!isPassive) {
    if (myQueueRef) myQueueRef.remove();
    db.ref('queue/' + partnerKey).remove();
  } else {
    if (myQueueRef) myQueueRef.remove();
  }
  roomId = [currentUser.uid, partnerUid].sort().join('_');
  await setupPeerConnection();
  listenToChat();
}

async function setupPeerConnection() {
  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.ontrack = e => { remoteVideo.srcObject = e.streams[0]; };
  pc.onicecandidate = e => {
    if (e.candidate) db.ref('rooms/' + roomId + '/candidates/' + currentUser.uid).push(e.candidate.toJSON());
  };
  const roomRef = db.ref('rooms/' + roomId);
  const partnerUid = roomId.split('_').find(uid => uid !== currentUser.uid);
  const isInitiator = currentUser.uid < partnerUid;
  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await roomRef.child('offer').set({ sdp: offer.sdp, type: offer.type });
    roomRef.child('answer').on('value', async snap => {
      if (snap.exists() && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
      }
    });
  } else {
    roomRef.child('offer').on('value', async snap => {
      if (snap.exists() && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await roomRef.child('answer').set({ sdp: answer.sdp, type: answer.type });
      }
    });
  }
  roomRef.child('candidates').on('child_added', snap => {
    if (snap.key !== currentUser.uid) {
      snap.forEach(c => { pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(()=>{}); });
    }
  });
  // Если собеседник вышел/нажал next/stop — комната удаляется, ловим это и сразу ищем нового
  roomRef.on('value', snap => {
    if (!snap.exists() && roomId) {
      endCall(true); // Автоматически ищем нового
    }
  });
  pc.onconnectionstatechange = () => {
    if (["disconnected","failed","closed"].includes(pc.connectionState)) endCall();
  };
}

function endCall(findNext) {
  if (pc) { pc.close(); pc = null; }
  if (roomId) {
    db.ref('rooms/' + roomId).off();
    db.ref('rooms/' + roomId).remove();
    roomId = null;
  }
  if (myQueueRef) { myQueueRef.remove(); myQueueRef = null; }
  remoteVideo.srcObject = null;
  if (findNext) setTimeout(() => startSearching(), 200);
}

// === Чат ===
chatForm.onsubmit = e => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg || !roomId) return;
  db.ref('rooms/' + roomId + '/messages').push({ text: msg, sender: currentUser.uid, ts: Date.now() });
  chatInput.value = '';
  setTyping(false);
};

// === Индикатор "печатает" ===
let typingTimeout = null;
chatInput.addEventListener('input', () => {
  setTyping(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => setTyping(false), 2000);
});

function setTyping(isTyping) {
  if (!roomId) return;
  db.ref('rooms/' + roomId + '/typing/' + currentUser.uid).set(isTyping ? Date.now() : null);
}

function listenToChat() {
  if (!roomId) return;
  db.ref('rooms/' + roomId + '/messages').on('child_added', snap => {
    const m = snap.val();
    addMsg(m);
  });

  // Индикатор "печатает"
  const partnerUid = roomId.split('_').find(uid => uid !== currentUser.uid);
  db.ref('rooms/' + roomId + '/typing/' + partnerUid).on('value', snap => {
    if (typingIndicator) {
      if (snap.val()) {
        typingIndicator.classList.remove('hidden');
      } else {
        typingIndicator.classList.add('hidden');
      }
    }
  });
}

function addMsg(m) {
  const isMe = m.sender === currentUser.uid;
  const div = document.createElement('div');
  div.className = 'chat-message' + (isMe ? ' sent' : '');
  div.innerHTML =
    (isMe ? '' : `<div class="message-avatar"><img src="https://i.pravatar.cc/32?u=${m.sender}"/></div>`) +
    `<div class="message-content">${m.text}<div class="message-time">${new Date(m.ts||Date.now()).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</div></div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.onbeforeunload = () => {
  if (roomId) db.ref('rooms/' + roomId).remove();
  if (myQueueRef) myQueueRef.remove();
  setTyping(false);
  setOnlineStatus(false);
};
