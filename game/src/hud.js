// Enhanced HUD for tactical FPS: round timer, team scores, money, killfeed, buy menu.
const WEAPON_KEYS = ['pistol', 'rifle', 'shotgun', 'smg'];
const WEAPON_LABELS = { pistol: 'Pistol', rifle: 'Rifle', shotgun: 'Shotgun', smg: 'SMG' };
const WEAPON_COSTS = { pistol: 0, rifle: 2700, shotgun: 1200, smg: 1800 };
const COPY = {
  start: {
    title: 'Tactical FPS',
    copy: 'Eliminate all enemies or survive the round. Buy better gear between rounds.',
    action: 'Click to play',
  },
  paused: {
    title: 'Paused',
    copy: 'Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Round Over',
    copy: '',
    action: 'Next round',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const ammoArea = document.getElementById('ammo-area');
  const weaponName = document.getElementById('weapon-name');
  const scoreValue = document.getElementById('score-value');
  const moneyValue = document.getElementById('money-value');
  const hitmarker = document.getElementById('hitmarker');
  const timerEl = document.getElementById('timer');
  const ctScore = document.getElementById('ct-score');
  const tScore = document.getElementById('t-score');
  const killfeed = document.getElementById('killfeed');
  const buyOverlay = document.getElementById('buy-overlay');
  const buyGrid = document.getElementById('buy-grid');
  const buyMoney = document.getElementById('buy-money');
  const buyClose = document.getElementById('buy-close');

  let hitTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastScore = -1;
  let lastMoney = -1;
  let lastWeapon = '';
  let onPlayHandler = null;
  let onCloseBuyHandler = null;
  let onBuyHandler = null;

  // Build buy menu items
  function buildBuyMenu(equipped, money) {
    buyMoney.textContent = String(money);
    buyGrid.innerHTML = '';
    WEAPON_KEYS.forEach(key => {
      const item = document.createElement('div');
      item.className = 'buy-item' + (equipped[key] ? ' owned' : '');
      item.innerHTML = `<h3>${WEAPON_LABELS[key]}</h3><div class="price">${equipped[key] ? 'Owned' : '$' + WEAPON_COSTS[key]}</div>`;
      if (!equipped[key]) {
        item.addEventListener('click', () => {
          if (onBuyHandler) onBuyHandler(key);
        });
      }
      buyGrid.appendChild(item);
    });
  }

  return {
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoArea.classList.toggle('empty', mag === 0);
    },
    setScore(value) {
      if (value === lastScore) return;
      lastScore = value;
      scoreValue.textContent = String(value);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = String(value);
    },
    setWeapon(key) {
      if (key === lastWeapon) return;
      lastWeapon = key;
      weaponName.textContent = WEAPON_LABELS[key] || key;
    },
    setTimer(seconds) {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    },
    setTeamScores(ct, t) {
      ctScore.textContent = String(ct);
      tScore.textContent = String(t);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    addKillFeed(text) {
      const entry = document.createElement('div');
      entry.className = 'kill-entry';
      entry.textContent = text;
      killfeed.appendChild(entry);
      setTimeout(() => {
        if (entry.parentNode) entry.parentNode.removeChild(entry);
      }, 5000);
      // Limit visible entries
      while (killfeed.children.length > 5) {
        killfeed.removeChild(killfeed.firstChild);
      }
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      if (mode === 'end') {
        copy.textContent = score !== undefined ? `You scored ${score}.` : text.copy;
      } else {
        copy.textContent = text.copy;
      }
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      onPlayHandler = handler;
      play.addEventListener('click', handler);
    },
    showBuyMenu(equipped, money, onClose, onBuy) {
      buildBuyMenu(equipped, money);
      onCloseBuyHandler = onClose;
      onBuyHandler = onBuy;
      buyClose.onclick = onClose;
      buyOverlay.hidden = false;
    },
    hideBuyMenu() {
      buyOverlay.hidden = true;
    },
  };
}
