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

// === DOM ===
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const micBtn = document.getElementById('micBtn');
const camBtn = document.getElementById('camBtn');
const stopBtn = document.getElementById('stopBtn');
const nextBtn = document.getElementById('nextBtn');
const chatBtn = document.getElementById('chatBtn');
const chatPanel = document.getElementById('chatPanel');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const authModal = document.getElementById('authModal');
const searchModal = document.getElementById('searchModal');

let currentUser = null;
let localStream = null;
let remoteStream = null;
let pc = null;
let roomId = null;
let micEnabled = true;
let camEnabled = true;
let isSearching = false;
let myQueueRef = null;

// === Auth ===
auth.onAuthStateChanged(async user => {
  if (!user) {
    authModal.classList.remove('hidden');
    return;
  }
  currentUser = user;
  authModal.classList.add('hidden');
  await startLocalVideo();
  startSearching();
  chatPanel.classList.remove('open'); // Чат скрыт по умолчанию
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
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localVideo.classList.remove('hidden');
    micEnabled = true;
    camEnabled = true;
    updateMicUI();
    updateCamUI();
  } catch (e) {
    alert('Нет доступа к камере/микрофону');
  }
}

function updateMicUI() {
  micBtn.setAttribute('aria-pressed', micEnabled);
  micBtn.style.opacity = micEnabled ? '1' : '0.5';
}
function updateCamUI() {
  camBtn.setAttribute('aria-pressed', camEnabled);
  camBtn.style.opacity = camEnabled ? '1' : '0.5';
  localVideo.style.opacity = camEnabled ? '0.85' : '0.2';
  if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
}

micBtn.onclick = () => {
  micEnabled = !micEnabled;
  if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  updateMicUI();
};
camBtn.onclick = () => {
  camEnabled = !camEnabled;
  updateCamUI();
};

stopBtn.onclick = () => { endCall(); };
nextBtn.onclick = () => { endCall(true); };
chatBtn.onclick = () => {
  chatPanel.classList.toggle('open');
  if (chatPanel.classList.contains('open')) {
    setTimeout(() => {
      chatInput.focus();
    }, 120);
  }
};

// === Поиск собеседника ===
function startSearching() {
  if (isSearching) return;
  isSearching = true;
  searchModal.classList.remove('hidden');
  const queueRef = db.ref('queue');
  myQueueRef = queueRef.push({ uid: currentUser.uid, ts: Date.now() });
  myQueueRef.onDisconnect().remove();
  queueRef.on('child_added', snap => {
    if (snap.key === myQueueRef.key) return;
    connectWith(snap.val().uid, snap.key);
  });
  document.getElementById('cancelSearch').onclick = () => {
    isSearching = false;
    myQueueRef.remove();
    searchModal.classList.add('hidden');
    queueRef.off();
  };
}

async function connectWith(partnerUid, partnerKey) {
  searchModal.classList.add('hidden');
  isSearching = false;
  if (myQueueRef) myQueueRef.remove();
  db.ref('queue/' + partnerKey).remove();
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
  pc.onconnectionstatechange = () => {
    if (["disconnected","failed","closed"].includes(pc.connectionState)) endCall();
  };
}

function endCall(findNext) {
  if (pc) { pc.close(); pc = null; }
  if (roomId) { db.ref('rooms/' + roomId).remove(); roomId = null; }
  if (myQueueRef) { myQueueRef.remove(); myQueueRef = null; }
  remoteVideo.srcObject = null;
  if (findNext) startSearching();
}

// === Чат ===
chatForm.onsubmit = e => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg || !roomId) return;
  db.ref('rooms/' + roomId + '/messages').push({ text: msg, sender: currentUser.uid, ts: Date.now() });
  chatInput.value = '';
};

function listenToChat() {
  if (!roomId) return;
  db.ref('rooms/' + roomId + '/messages').on('child_added', snap => {
    const m = snap.val();
    addMsg(m);
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
};
