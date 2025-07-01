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

// === UI helpers ===
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const body = document.body;
const videoSection = $('#videoSection');
const localVideo = $('#localVideo');
const remoteVideo = $('#remoteVideo');
const chatSection = $('#chatSection');
const chatMessages = $('#chatMessages');
const chatForm = $('#chatForm');
const chatInput = $('#chatInput');
const callControls = $('#callControls');
const micToggle = $('#micToggle');
const camToggle = $('#camToggle');
const endCallBtn = $('#endCallBtn');
const pipToggle = $('#pipToggle');
const timerDisplay = $('#timerDisplay');

let currentUser = null;
let localStream = null;
let remoteStream = null;
let pc = null;
let roomId = null;
let callTimer = null;
let micEnabled = true;
let camEnabled = true;

// === Auth ===
function initAuth() {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      showAuthModal();
      return;
    }
    currentUser = user;
    setupUser(user);
  });
}

function showAuthModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <form id="authForm">
      <input id="authEmail" type="email" placeholder="Email">
      <input id="authPass" type="password" placeholder="Пароль">
      <button type="submit">Войти</button>
      <button type="button" id="regBtn">Регистрация</button>
      <button type="button" id="anonBtn">Анонимно</button>
      <button type="button" id="googleBtn">Google</button>
    </form>
  `;
  document.body.appendChild(modal);
  $('#authForm').onsubmit = e => {
    e.preventDefault();
    auth.signInWithEmailAndPassword($('#authEmail').value, $('#authPass').value).catch(alert);
  };
  $('#regBtn').onclick = () => {
    auth.createUserWithEmailAndPassword($('#authEmail').value, $('#authPass').value).catch(alert);
  };
  $('#anonBtn').onclick = () => {
    auth.signInAnonymously().catch(alert);
  };
  $('#googleBtn').onclick = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(alert);
  };
}

async function setupUser(user) {
  const snap = await db.ref('users/' + user.uid).once('value');
  const data = snap.val() || {};
  body.classList.toggle('dark', data.theme === 'dark');
  findPartner();
}

// === Video Call ===
async function startVideoCall() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.ontrack = e => {
    if (!remoteStream) {
      remoteStream = new MediaStream();
      remoteVideo.srcObject = remoteStream;
    }
    remoteStream.addTrack(e.track);
  };
  pc.onicecandidate = e => {
    if (e.candidate) {
      db.ref('rooms/' + roomId + '/candidates/' + currentUser.uid).push(e.candidate.toJSON());
    }
  };
  setupRoom();
}

function setupRoom() {
  const roomRef = db.ref('rooms/' + roomId);
  roomRef.child('offer').on('value', async snap => {
    if (snap.exists()) {
      await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await roomRef.child('answer').set({ sdp: answer.sdp, type: answer.type });
    }
  });
  roomRef.child('candidates').on('child_added', snap => {
    snap.forEach(c => {
      pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(console.warn);
    });
  });
}

// === Call Controls ===
micToggle.onclick = () => {
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(track => track.enabled = micEnabled);
};

camToggle.onclick = () => {
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach(track => track.enabled = camEnabled);
};

endCallBtn.onclick = () => {
  if (roomId) db.ref('rooms/' + roomId).remove();
  location.reload();
};

pipToggle.onclick = () => {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
  } else {
    localVideo.requestPictureInPicture();
  }
};

// === Timer ===
function startCallTimer() {
  let seconds = 0;
  callTimer = setInterval(() => {
    seconds++;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerDisplay.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, 1000);
}

function stopCallTimer() {
  clearInterval(callTimer);
  timerDisplay.textContent = '00:00';
}

// === Chat ===
chatForm.onsubmit = e => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;
  addChatMessage(msg, true);
  db.ref('rooms/' + roomId + '/chat').push({ from: currentUser.uid, msg });
  chatInput.value = '';
};

function addChatMessage(msg, isMe) {
  const div = document.createElement('div');
  div.className = `chat-message ${isMe ? 'me' : ''}`;
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function listenForMessages() {
  db.ref('rooms/' + roomId + '/chat').on('child_added', snap => {
    const { from, msg } = snap.val();
    if (from !== currentUser.uid) addChatMessage(msg, false);
  });
}

// === Initialization ===
initAuth();
