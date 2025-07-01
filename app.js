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
const body = document.body;
const profileModal = $('#profileModal');
const profileBtn = $('#profileBtn');
const profileForm = $('#profileForm');
const displayNameInput = $('#displayName');
const themeSelect = $('#themeSelect');
const logoutBtn = $('#logoutBtn');
const onlineCount = $('#onlineCount');
const switchModeBtn = $('#switchMode');
const videoSection = $('#videoSection');
const localVideo = $('#localVideo');
const remoteVideo = $('#remoteVideo');
const chatSection = $('#chatSection');
const chatMessages = $('#chatMessages');
const chatForm = $('#chatForm');
const chatInput = $('#chatInput');
let searchModal = null;
let currentUser = null;
let currentTheme = 'light';
let currentName = '';
let chatHistory = [];
let mode = 'split'; // split | pip
let searching = false;
let myQueueRef = null;
let roomId = null;
let pc = null;
let localStream = null;
let remoteStream = null;

// === Auth ===
function showAuth() {
  const d = document.createElement('div');
  d.className = 'modal';
  d.innerHTML = `<form id="authForm" style="background:var(--bg);color:var(--fg);padding:2em;border-radius:12px;display:flex;flex-direction:column;gap:1em;min-width:220px;">
    <b>Вход в ChattiGo</b>
    <input id="authEmail" type="email" placeholder="Email">
    <input id="authPass" type="password" placeholder="Пароль">
    <button type="submit">Войти</button>
    <button type="button" id="regBtn">Регистрация</button>
    <button type="button" id="anonBtn">Анонимно</button>
    <button type="button" id="googleBtn">Google</button>
  </form>`;
  document.body.appendChild(d);
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
auth.onAuthStateChanged(async user => {
  if (!user) {
    showAuth();
    return;
  }
  currentUser = user;
  currentName = user.displayName || 'Гость';
  const snap = await db.ref('users/' + user.uid).once('value');
  const data = snap.val() || {};
  currentTheme = data.theme || 'light';
  currentName = data.name || currentName;
  displayNameInput.value = currentName;
  themeSelect.value = currentTheme;
  setTheme(currentTheme);
  body.classList.toggle('dark', currentTheme === 'dark');
  profileModal.classList.add('hidden');
  $('.modal')?.remove();
  db.ref('users/' + user.uid).update({ name: currentName, theme: currentTheme });
  findPartner();
});

profileBtn.onclick = () => {
  profileModal.classList.remove('hidden');
  displayNameInput.value = currentName;
  themeSelect.value = currentTheme;
};
profileForm.onsubmit = e => {
  e.preventDefault();
  currentName = displayNameInput.value.trim() || 'Гость';
  currentTheme = themeSelect.value;
  setTheme(currentTheme);
  body.classList.toggle('dark', currentTheme === 'dark');
  db.ref('users/' + currentUser.uid).update({ name: currentName, theme: currentTheme });
  profileModal.classList.add('hidden');
};
logoutBtn.onclick = () => {
  auth.signOut();
  location.reload();
};

function setTheme(theme) {
  body.classList.toggle('dark', theme === 'dark');
}

// === Online count ===
function updateOnlineCount() {
  db.ref('online').on('value', snap => {
    onlineCount.textContent = (snap.val() || 0) + ' онлайн';
  });
}
updateOnlineCount();

auth.onAuthStateChanged(user => {
  if (!user) return;
  const ref = db.ref('online/' + user.uid);
  ref.set(true);
  ref.onDisconnect().remove();
});

switchModeBtn.onclick = () => {
  mode = mode === 'split' ? 'pip' : 'split';
  videoSection.className = mode;
};

// === Поиск собеседника с UX ===
async function findPartner() {
  if (searching) return;
  searching = true;
  showSearchModal();
  const queueRef = db.ref('queue');
  myQueueRef = queueRef.push({ uid: currentUser.uid, ts: Date.now() });
  myQueueRef.onDisconnect().remove();
  let found = false;
  const onFound = async snap => {
    if (snap.key === myQueueRef.key || found) return;
    found = true;
    roomId = [snap.val().uid, currentUser.uid].sort().join('_');
    myQueueRef.remove();
    queueRef.child(snap.key).remove();
    hideSearchModal();
    searching = false;
    await connectToRoom(roomId, snap.val().uid);
  };
  queueRef.on('child_added', onFound);
  searchModal.querySelector('#cancelSearch').onclick = () => {
    searching = false;
    myQueueRef.remove();
    hideSearchModal();
    queueRef.off('child_added', onFound);
  };
}

function showSearchModal() {
  if (searchModal) searchModal.remove();
  searchModal = document.createElement('div');
  searchModal.className = 'modal';
  searchModal.innerHTML = `<div style="background:var(--bg);color:var(--fg);padding:2em 2.5em;border-radius:12px;display:flex;flex-direction:column;align-items:center;gap:1.2em;min-width:220px;animation:fadeIn 0.4s;">
    <div style="font-size:1.2em;">Поиск собеседника...</div>
    <div class="loader"></div>
    <button id="cancelSearch" style="background:var(--accent);color:#fff;border:none;border-radius:4px;padding:0.5em 1.2em;cursor:pointer;">Отмена</button>
  </div>`;
  document.body.appendChild(searchModal);
}
function hideSearchModal() {
  if (searchModal) searchModal.remove();
  searchModal = null;
}

async function startVideo() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
}
startVideo();

async function connectToRoom(roomId, partnerUid) {
  try {
    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
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
    const roomRef = db.ref('rooms/' + roomId);
    if (currentUser.uid < partnerUid) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await roomRef.child('offer').set({ sdp: offer.sdp, type: offer.type });
      roomRef.child('answer').on('value', async snap => {
        if (snap.exists()) {
          await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
        }
      });
    } else {
      roomRef.child('offer').on('value', async snap => {
        if (snap.exists()) {
          await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await roomRef.child('answer').set({ sdp: answer.sdp, type: answer.type });
        }
      });
    }
    roomRef.child('candidates').on('child_added', snap => {
      if (snap.key !== currentUser.uid) {
        snap.forEach(c => {
          pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(console.warn);
        });
      }
    });
    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        db.ref('rooms/' + roomId).remove();
        setTimeout(() => location.reload(), 1000);
      }
    };
  } catch (e) {
    alert('Ошибка соединения: ' + e.message);
    location.reload();
  }
}

chatForm.onsubmit = e => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;
  addChatMsg(msg, true);
  db.ref('rooms/' + roomId + '/chat').push({ from: currentUser.uid, name: currentName, msg });
  chatInput.value = '';
};
function addChatMsg(msg, me, name) {
  const d = document.createElement('div');
  d.className = 'chat-msg' + (me ? ' me' : '');
  d.textContent = (name ? name + ': ' : '') + msg;
  chatMessages.appendChild(d);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function listenChat() {
  if (!roomId) return;
  db.ref('rooms/' + roomId + '/chat').on('child_added', snap => {
    const { from, name, msg } = snap.val();
    if (from !== currentUser.uid) addChatMsg(msg, false, name);
  });
}
setInterval(listenChat, 2000);

const observer = new MutationObserver(mutations => {
  mutations.forEach(m => {
    if (m.addedNodes.length) {
      m.addedNodes.forEach(node => {
        if (node.classList && node.classList.contains('chat-msg')) {
          node.style.animation = 'fadeInMsg 0.4s';
        }
      });
    }
  });
});
observer.observe(chatMessages, { childList: true });

window.onbeforeunload = () => {
  if (roomId) db.ref('rooms/' + roomId).remove();
  if (myQueueRef) myQueueRef.remove();
};
