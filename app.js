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
const searchingOverlay = document.getElementById('searchingOverlay');
// const moreMenuBtn = document.getElementById('moreMenuBtn');
// const moreMenu = document.getElementById('moreMenu');
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

// === More menu (троеточие) — удалено ===

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



// === UI: Профиль: отображение соцсетей в просмотре профиля ===
function renderProfileSocialsView() {
  const infoBlock = document.querySelector('.profile-info');
  if (!infoBlock) return;
  let socialsBlock = document.getElementById('profileSocialsView');
  if (!socialsBlock) {
    socialsBlock = document.createElement('div');
    socialsBlock.id = 'profileSocialsView';
    socialsBlock.style.display = 'flex';
    socialsBlock.style.flexWrap = 'wrap';
    socialsBlock.style.gap = '0.5em';
    socialsBlock.style.marginTop = '0.7em';
    infoBlock.appendChild(socialsBlock);
  }
  socialsBlock.innerHTML = '';
  if (Array.isArray(socialLinks) && socialLinks.length) {
    socialLinks.forEach(link => {
      const a = document.createElement('a');
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.innerHTML = getSocialIcon(link);
      a.title = link;
      a.style.display = 'inline-flex';
      a.style.alignItems = 'center';
      a.style.justifyContent = 'center';
      a.style.width = '32px';
      a.style.height = '32px';
      a.style.borderRadius = '50%';
      a.style.background = 'rgba(0,184,217,0.08)';
      socialsBlock.appendChild(a);
    });
  }
}

const profileBtn = document.getElementById('profileBtn');
const profileModal = document.getElementById('profileModal');
const profileCloseBtn = document.getElementById('profileCloseBtn');
const logoutProfileBtn = document.getElementById('logoutProfileBtn');

const profileEmail = document.getElementById('profileEmail');
const profileId = document.getElementById('profileId');
const profileGender = document.getElementById('profileGender');
const profileLang = document.getElementById('profileLang');


const editProfileBtn = document.getElementById('editProfileBtn');
const editProfileForm = document.getElementById('editProfileForm');
const editProfileName = document.getElementById('editProfileName');
const cancelEditProfileBtn = document.getElementById('cancelEditProfileBtn');
const editSocialList = document.getElementById('editSocialList');
const editSocialInput = document.getElementById('editSocialInput');
const addSocialBtn = document.getElementById('addSocialBtn');

// --- Соцсети: поддержка массива ссылок ---
let socialLinks = [];
function renderSocialList() {
  if (!editSocialList) return;
  editSocialList.innerHTML = '';
  socialLinks.forEach((link, idx) => {
    const div = document.createElement('div');
    div.className = 'edit-social-item';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '0.5em';
    // SVG-иконка по ссылке
    div.innerHTML = `${getSocialIcon(link)}<span style='flex:1;overflow:hidden;text-overflow:ellipsis;'>${link}</span><button type='button' data-idx='${idx}' style='background:none;border:none;cursor:pointer;padding:0 0.2em;'><svg width='20' height='20' viewBox='0 0 20 20' fill='none'><circle cx='10' cy='10' r='10' fill='#00B8D9' fill-opacity='0.13'/><path d='M6 6l8 8M6 14L14 6' stroke='#00B8D9' stroke-width='2.2' stroke-linecap='round'/></svg></button>`;
    editSocialList.appendChild(div);
    div.querySelector('button').onclick = () => {
      socialLinks.splice(idx, 1);
      renderSocialList();
    };
  });
}

function getSocialIcon(link) {
  if (/vk.com/.test(link)) return `<svg width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='10' fill='#2787F5'/><path d='M6.7 7.2c.1-.3.2-.5.6-.5h1.1c.2 0 .4.1.5.4.2.5.5 1.1.8 1.6.2.3.4.3.6 0 .2-.3.4-.7.6-1.1.1-.2.2-.4.5-.4h1.1c.4 0 .5.2.4.5-.2.7-.6 1.3-1.1 1.8-.2.2-.2.3 0 .5.4.4.8.8 1.2 1.2.3.3.2.6-.2.6h-1.1c-.3 0-.4-.1-.6-.3-.2-.3-.4-.6-.7-.9-.2-.2-.3-.2-.5 0-.2.3-.4.6-.7.9-.2.2-.3.3-.6.3H6.7c-.4 0-.5-.3-.2-.6.4-.4.8-.8 1.2-1.2.2-.2.2-.3 0-.5-.5-.5-.9-1.1-1.1-1.8z' fill='#fff'/></svg>`;
  if (/t.me|telegram/.test(link)) return `<svg width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='10' fill='#229ED9'/><path d='M15.6 5.7l-1.7 8c-.1.4-.3.5-.7.3l-2-1.5-1 .9c-.1.1-.2.2-.4.2l.1-1.3 4.2-3.8c.2-.2-.1-.3-.3-.2l-5.2 3.3-1.2-.4c-.4-.1-.4-.4.1-.6l8.1-3.1c.4-.2.7.1.6.5z' fill='#fff'/></svg>`;
  if (/instagram/.test(link)) return `<svg width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='10' fill='#E1306C'/><rect x='5.5' y='5.5' width='9' height='9' rx='2.5' fill='none' stroke='#fff' stroke-width='1.2'/><circle cx='10' cy='10' r='2.2' fill='none' stroke='#fff' stroke-width='1.2'/><circle cx='13.2' cy='6.8' r='0.7' fill='#fff'/></svg>`;
  if (/facebook/.test(link)) return `<svg width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='10' fill='#1877F3'/><path d='M11.7 10.7h1.1l.2-1.3h-1.3V8.3c0-.4.1-.6.6-.6h.7V6.5c-.1 0-.4-.1-.9-.1-1.1 0-1.6.6-1.6 1.6v.9H8.2v1.3h1.3v3.2h1.5v-3.2z' fill='#fff'/></svg>`;
  if (/x.com|twitter/.test(link)) return `<svg width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='10' fill='#000'/><path d='M6.5 6.5l7 7M13.5 6.5l-7 7' stroke='#fff' stroke-width='1.7' stroke-linecap='round'/></svg>`;
  return `<svg width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='10' fill='#00B8D9' fill-opacity='0.13'/><path d='M10 5v10M5 10h10' stroke='#00B8D9' stroke-width='2.2' stroke-linecap='round'/></svg>`;
}



async function renderProfileModal(user) {
  // Email
  profileEmail.textContent = user.email || 'Аноним';
  // UID
  if (user.uid) {
    profileId.textContent = 'ID: ' + user.uid.slice(0, 8) + '...';
    profileId.style.display = 'block';
  } else {
    profileId.style.display = 'none';
  }
  // Gender & Lang
  let gender = 'other';
  let lang = 'en';
  if (user.uid) {
    const snap = await db.ref('users/' + user.uid + '/profile').once('value');
    if (snap.exists() && snap.val()) {
      const val = snap.val();
      if (val.gender) gender = val.gender;
      if (val.lang) lang = val.lang;
    }
  }
  if (profileGender) profileGender.value = gender;
  if (profileLang) profileLang.value = lang;
  // Соцсети
  if (user.uid) {
    const snap = await db.ref('users/' + user.uid + '/social').once('value');
    let val = snap.val();
    if (Array.isArray(val)) {
      socialLinks = val;
    } else if (typeof val === 'string' && val) {
      try { socialLinks = JSON.parse(val); } catch { socialLinks = [val]; }
    } else {
      socialLinks = [];
    }
  } else {
    socialLinks = [];
  }
  renderSocialList();
  renderProfileSocialsView();
}
// Сохранение пола и языка
if (profileGender) {
  profileGender.onchange = async () => {
    if (!auth.currentUser) return;
    await db.ref('users/' + auth.currentUser.uid + '/profile/gender').set(profileGender.value);
  };
}
if (profileLang) {
  profileLang.onchange = async () => {
    if (!auth.currentUser) return;
    await db.ref('users/' + auth.currentUser.uid + '/profile/lang').set(profileLang.value);
    setRulesLang(profileLang.value);
  };
}

// Автоматическое определение языка и установка правил
function detectUserLang() {
  let lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  if (lang.startsWith('ru')) return 'ru';
  return 'en';
}

function setRulesLang(lang) {
  // Скрыть/показать нужный блок правил
  const rulesEn = document.querySelector('#rules');
  const rulesRu = document.querySelector('#rules-ru');
  if (rulesEn && rulesRu) {
    if (lang === 'ru') {
      rulesEn.style.display = 'none';
      rulesRu.style.display = '';
    } else {
      rulesEn.style.display = '';
      rulesRu.style.display = 'none';
    }
  }
}

// При загрузке: выставить язык правил и селектор профиля
window.addEventListener('DOMContentLoaded', async () => {
  // Для правил
  let lang = detectUserLang();
  // Если пользователь авторизован и есть lang в профиле — использовать его
  if (auth.currentUser && auth.currentUser.uid) {
    const snap = await db.ref('users/' + auth.currentUser.uid + '/profile/lang').once('value');
    if (snap.exists() && snap.val()) lang = snap.val();
  }
  setRulesLang(lang);
  if (profileLang) profileLang.value = lang;
});


if (profileBtn && profileModal) {
  profileBtn.onclick = () => {
    if (auth.currentUser) {
      renderProfileModal(auth.currentUser);
    }
    profileModal.classList.remove('hidden');
    // Фокус на крестик для доступности
    if (profileCloseBtn) profileCloseBtn.focus();
  };
}
if (profileCloseBtn && profileModal) {
  profileCloseBtn.onclick = () => profileModal.classList.add('hidden');
}
// Закрытие профиля по клику на overlay
const profileModalOverlay = document.getElementById('profileModalOverlay');
if (profileModalOverlay && profileModal) {
  profileModalOverlay.onclick = () => profileModal.classList.add('hidden');
}
if (logoutProfileBtn) {
  logoutProfileBtn.onclick = () => {
    profileModal.classList.add('hidden');
    auth.signOut();
  };
}

if (editProfileBtn && editProfileForm && editProfileName) {
  editProfileBtn.onclick = async () => {
    if (!auth.currentUser) return;
    editProfileForm.style.display = 'flex';
    editProfileBtn.style.display = 'none';
    editProfileName.value = auth.currentUser.displayName || '';
    // Соцсети из базы
    if (auth.currentUser.uid) {
      const snap = await db.ref('users/' + auth.currentUser.uid + '/social').once('value');
      let val = snap.val();
      if (Array.isArray(val)) {
        socialLinks = val;
      } else if (typeof val === 'string' && val) {
        try { socialLinks = JSON.parse(val); } catch { socialLinks = [val]; }
      } else {
        socialLinks = [];
      }
    } else {
      socialLinks = [];
    }
    renderSocialList();
    editProfileName.focus();
  };
  if (cancelEditProfileBtn) {
    cancelEditProfileBtn.onclick = () => {
      editProfileForm.style.display = 'none';
      editProfileBtn.style.display = '';
    };
  }
  if (addSocialBtn && editSocialInput) {
    addSocialBtn.onclick = () => {
      const val = editSocialInput.value.trim();
      if (val && !socialLinks.includes(val)) {
        socialLinks.push(val);
        renderSocialList();
        editSocialInput.value = '';
      }
    };
  }
  editProfileForm.onsubmit = async (e) => {
    e.preventDefault();
    const newName = editProfileName.value.trim();
    const avatarInput = document.getElementById('editProfileAvatar');
    let photoURL = null;
    // Обновление аватарки
    if (avatarInput && avatarInput.files && avatarInput.files[0]) {
      const file = avatarInput.files[0];
      // Для демо: base64 (можно заменить на Storage)
      const reader = new FileReader();
      reader.onload = async function(evt) {
        photoURL = evt.target.result;
        await saveProfile(newName, socialLinks, photoURL);
      };
      reader.readAsDataURL(file);
      return;
    } else {
      await saveProfile(newName, socialLinks, null);
    }
  };
}

async function saveProfile(newName, newSocialArr, photoURL) {
  try {
    if (!newName) {
      alert('Имя не может быть пустым.');
      return;
    }
    const user = auth.currentUser;
    if (!user) return;
    let updateObj = { displayName: newName };
    if (photoURL) updateObj.photoURL = photoURL;
    await user.updateProfile(updateObj);
    if (user.uid) {
      await db.ref('users/' + user.uid + '/displayName').set(newName);
      await db.ref('users/' + user.uid + '/social').set(newSocialArr);
      if (photoURL) await db.ref('users/' + user.uid + '/photoURL').set(photoURL);
    }
    await renderProfileModal(user);
    editProfileForm.style.display = 'none';
    editProfileBtn.style.display = '';
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
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
  chatPanel.classList.remove('open'); // Чат скрыт по умолчанию
  listenOnlineCount();
});


// --- Логин ---
const authForm = document.getElementById('authForm');
const regForm = document.getElementById('regForm');
const regBtn = document.getElementById('regBtn');
const backToLoginBtn = document.getElementById('backToLoginBtn');
const googleBtn = document.getElementById('googleBtn');
const googleRegBtn = document.getElementById('googleRegBtn');

if (authForm && regForm && regBtn && backToLoginBtn && googleBtn && googleRegBtn) {
  // Показать форму регистрации
  regBtn.onclick = () => {
    authForm.style.display = 'none';
    regForm.style.display = 'flex';
  };
  // Назад к логину
  backToLoginBtn.onclick = () => {
    regForm.style.display = 'none';
    authForm.style.display = 'flex';
  };
  // Логин
  authForm.onsubmit = async e => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPass').value;
    try { await auth.signInWithEmailAndPassword(email, pass); } catch (err) { alert(err.message); }
  };
  // Регистрация
  regForm.onsubmit = async e => {
    e.preventDefault();
    const email = document.getElementById('regEmail').value;
    const pass = document.getElementById('regPass').value;
    const name = document.getElementById('regName').value;
    try {
      const userCred = await auth.createUserWithEmailAndPassword(email, pass);
      await userCred.user.updateProfile({ displayName: name });
      if (userCred.user.uid) {
        await db.ref('users/' + userCred.user.uid + '/displayName').set(name);
      }
      regForm.style.display = 'none';
      authForm.style.display = 'flex';
    } catch (err) { alert(err.message); }
  };
  // Google вход
  googleBtn.onclick = async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(provider); } catch (err) { alert(err.message); }
  };
  // Google регистрация (то же самое)
  googleRegBtn.onclick = async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(provider); } catch (err) { alert(err.message); }
  };
}

// === Video ===
async function startLocalVideo() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Ваш браузер не поддерживает getUserMedia.');
      return;
    }
    // Проверка: хотя бы что-то должно быть включено
    if (!camEnabled && !micEnabled) {
      alert('Включите камеру или микрофон для начала общения.');
      return;
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      video: camEnabled ? { facingMode: { ideal: currentFacing } } : false,
      audio: micEnabled
    });
    audioTrack = localStream.getAudioTracks()[0] || null;
    videoTrack = localStream.getVideoTracks()[0] || null;
    localVideo.srcObject = localStream;
    localVideo.classList.remove('hidden');
    updateMicUI();
    updateCamUI();
    // Если есть peerConnection — пересоздать видео-трек
    if (pc && videoTrack) {
      const senders = pc.getSenders();
      const vSender = senders.find(s => s.track && s.track.kind === 'video');
      if (vSender) vSender.replaceTrack(videoTrack);
    }
    if (pc && audioTrack) {
      const senders = pc.getSenders();
      const aSender = senders.find(s => s.track && s.track.kind === 'audio');
      if (aSender) aSender.replaceTrack(audioTrack);
    }
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
  await startLocalVideo();
  updateMicUI();
};
camBtn.onclick = async () => {
  camEnabled = !camEnabled;
  await startLocalVideo();
  updateCamUI();
};

stopBtn.onclick = () => {
  endCall(false);
  // После стопа разрешаем повторный поиск сразу
  isSearching = false;
};
nextBtn.onclick = () => {
  // Всегда завершаем текущий поиск/разговор перед новым поиском
  if (typeof endCall === 'function') {
    endCall(true); // findNext=true — сразу стартует новый поиск
  } else {
    startSearching();
  }
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

function startSearching() {
  // Защита: поиск только после авторизации
  if (!currentUser) {
    console.warn('startSearching: currentUser не определён');
    return;
  }
  // Если уже ищем — сбрасываем предыдущий поиск
  if (myQueueRef) {
    myQueueRef.off();
    myQueueRef.remove();
    myQueueRef = null;
  }
  if (pc) { pc.close(); pc = null; }
  isSearching = true;
  if (searchingOverlay) searchingOverlay.classList.remove('hidden');
  if (remoteVideo) remoteVideo.classList.add('hidden');
  if (chatMessages) chatMessages.innerHTML = '';
  const queueRef = db.ref('queue');
  myQueueRef = queueRef.push({ uid: currentUser.uid, ts: Date.now(), looking: true, last: lastPartnerUid || null });
  myQueueRef.onDisconnect().remove();

  myQueueRef.on('value', async snap => {
    const val = snap.val();
    if (!val) return;
    if (val.match && val.match.uid && val.match.key) {
      connectWith(val.match.uid, val.match.key, true);
    }
  });

  tryMatch();
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
  if (searchingOverlay) searchingOverlay.classList.add('hidden');
  if (remoteVideo) remoteVideo.classList.remove('hidden');
  isSearching = false;
  lastPartnerUid = partnerUid;
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
  if (myQueueRef) {
    myQueueRef.off();
    myQueueRef.remove();
    myQueueRef = null;
  }
  remoteVideo.srcObject = null;
  if (searchingOverlay) searchingOverlay.classList.add('hidden');
  if (remoteVideo) remoteVideo.classList.remove('hidden');
  if (chatMessages) chatMessages.innerHTML = '';
  // Критично: всегда сбрасываем isSearching, чтобы поиск можно было запустить снова
  isSearching = false;
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
