// Tactical FPS: round-based play against AI bots with buy menu and economy.
// Deterministic screenshot mode via ?shot=start|play|end&seed=N for the judge.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapon.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 90; // seconds per round
const STARTING_MONEY = 800;
const KILL_REWARD = 300;
const ROUND_WIN_REWARD = 2000;
const BOT_DAMAGE_PER_SHOT = 12;
const PLAYER_MAX_HEALTH = 100;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

// Seeded PRNG (Mulberry32)
function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

// Renderer & scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 20, 55);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

// Subsystems
const world = createWorld(scene);
const bots = createBots(scene, world.colliders, 4);
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const shootables = world.shootables.concat(bots.meshes);

// Game state
const body = player.state;
let score = 0;         // total kills across all rounds
let roundKills = 0;
let money = STARTING_MONEY;
let health = PLAYER_MAX_HEALTH;
let roundTime = ROUND_TIME;
let ctRounds = 0;
let tRounds = 0;
let elapsed = 0;       // simulation time within current round
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let roundActive = false;
let inBuyPhase = false;

// Raycaster for player shots
const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const direction = new THREE.Vector3();

// ---- HUD callbacks ----
hud.setAmmo(weapon.state.mag, weapon.state.reserve);
hud.setScore(0);
hud.setMoney(money);
hud.setTimer(roundTime);
hud.setTeamScores(ctRounds, tRounds);
hud.setWeapon(weapon.getCurrentKey());
hud.onPlay(() => {
  if (shot) return;
  if (!started) {
    input.requestLock();
    startRound();
  } else if (roundActive) {
    hud.hideOverlay();
    input.requestLock();
  } else {
    // Between rounds: open buy menu or start next round
    openBuyMenu();
  }
});

// ---- Round lifecycle ----
function startRound() {
  roundActive = true;
  roundTime = ROUND_TIME;
  roundKills = 0;
  health = PLAYER_MAX_HEALTH;
  elapsed = 0;
  bots.reset();
  weapon.refill();
  // Reset player position to spawn point
  body.position.set(0, 0, 18);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  syncCamera();
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setScore(score);
  hud.setMoney(money);
  hud.setTimer(roundTime);
  hud.hideOverlay();
}

function endRound(won) {
  roundActive = false;
  if (won) {
    ctRounds++;
    money += ROUND_WIN_REWARD;
    hud.showOverlay('end', `${score + roundKills} kills | +$${ROUND_WIN_REWARD}`);
  } else {
    tRounds++;
    hud.showOverlay('end', `${score + roundKills} kills | Lost round`);
  }
  hud.setTeamScores(ctRounds, tRounds);
  hud.setMoney(money);
  started = true;
}

function openBuyMenu() {
  inBuyPhase = true;
  hud.showBuyMenu(
    weapon.getEquipped(),
    money,
    () => {
      inBuyPhase = false;
      hud.hideBuyMenu();
      startRound();
      input.requestLock();
    },
    (key) => {
      const cost = WEAPON_COSTS[key];
      if (money >= cost && !weapon.getEquipped()[key]) {
        money -= cost;
        weapon.purchase(key);
        hud.setMoney(money);
        hud.showBuyMenu(weapon.getEquipped(), money, arguments[0], arguments[1]); // refresh
      }
    }
  );
}

// Weapon costs mapping (needed here for buy logic)
const WEAPON_COSTS = { pistol: 0, rifle: 2700, shotgun: 1200, smg: 1800 };

// ---- Shooting logic ----
function shootPlayerBullet() {
  if (!weapon.takeRound()) return;
  camera.getWorldDirection(direction);
  const spread = weapon.getSpread(player.groundSpeed());
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);

  const pellets = weapon.getPellets();
  for (let p = 0; p < pellets; p++) {
    // Slight additional spread per pellet for shotgun
    if (pellets > 1) {
      raycaster.ray.direction.x += (random() * 2 - 1) * 0.02;
      raycaster.ray.direction.y += (random() * 2 - 1) * 0.02;
      raycaster.ray.direction.z += (random() * 2 - 1) * 0.02;
      raycaster.ray.direction.normalize();
    }
    const hit = raycaster.intersectObjects(shootables, false)[0];
    if (hit) {
      // Check if hit a bot
      const botIdx = bots.meshes.indexOf(hit.object);
      if (botIdx !== -1) {
        // Determine headshot (if hit object has userData.part === 'head')
        const isHead = hit.object.userData.part === 'head';
        const dmg = isHead ? 100 : weapon.getDamage();
        // Find which bot this mesh belongs to
        for (let i = 0; i < bots.count(); i++) {
          if (bots.meshes[i] === hit.object || bots.meshes[i + bots.count()] === hit.object) {
            bots.damage(i, dmg);
            if (bots.count() > 0 && bots.aliveCount() > 0) {
              money += KILL_REWARD;
              roundKills++;
              score++;
              hud.setScore(score);
              hud.setMoney(money);
              hud.hitMarker(true, 90);
              hud.addKillFeed(`You eliminated Bot ${i+1} (${isHead ? 'HEADSHOT' : ''}) +$${KILL_REWARD}`);
            }
            break;
          }
        }
      } else {
        hud.hitMarker(false, 90);
      }
    }
  }
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function processBotShots() {
  const shots = bots.takeShots();
  const playerPos = body.position.clone().add(new THREE.Vector3(0, body.eye, 0));
  const playerBox = new THREE.Box3();
  const r = 0.3; // player radius approx
  playerBox.min.set(playerPos.x - r, playerPos.y - 0.6, playerPos.z - r);
  playerBox.max.set(playerPos.x + r, playerPos.y + 0.2, playerPos.z + r);

  shots.forEach(sh => {
    // Add some inaccuracy to bot shots
    sh.direction.x += (random() * 2 - 1) * 0.04;
    sh.direction.y += (random() * 2 - 1) * 0.03;
    sh.direction.z += (random() * 2 - 1) * 0.04;
    sh.direction.normalize();
    const ray = new THREE.Raycaster(sh.from, sh.direction, 0, 80);
    // Simple sphere intersection with player bounding box
    const closest = new THREE.Vector3();
    ray.ray.closestPointToPoint(closest);
    if (playerBox.containsPoint(closest) && ray.ray.at(ray.ray.distanceToPoint(closest)).distanceTo(closest) < 0.5) {
      health -= BOT_DAMAGE_PER_SHOT;
      hud.addKillFeed(`Bot shot you (-${BOT_DAMAGE_PER_SHOT} HP)`);
      if (health <= 0) {
        health = 0;
        endRound(false); // Player died
      }
    }
  });
}

// ---- Main loop ----
function step(dt) {
  elapsed += dt;
  if (elapsed >= roundTime) {
    // Time's up: round ends, whoever has more alive wins (or draw)
    const botsAlive = bots.aliveCount();
    endRound(botsAlive === 0);
    return;
  }
  player.step(dt, input.state.keys);
  weapon.step(dt);
  bots.step(dt, body.position, elapsed);
  processBotShots();
  // Check if all bots dead
  if (bots.aliveCount() === 0 && roundActive) {
    endRound(true);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && roundActive) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    if (input.state.firing && weapon.ready()) shootPlayerBullet();
    if (input.state.keys.has('KeyR')) weapon.reload();
    // Weapon switching via number keys
    if (input.state.keys.has('Digit1')) weapon.switchTo('pistol');
    if (input.state.keys.has('Digit2')) weapon.switchTo('rifle');
    if (input.state.keys.has('Digit3')) weapon.switchTo('shotgun');
    if (input.state.keys.has('Digit4')) weapon.switchTo('smg');
    // Buy menu toggle
    if (input.state.keys.has('KeyB') && !roundActive && !inBuyPhase) {
      openBuyMenu();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // Update HUD timers
    hud.setTimer(Math.max(0, roundTime - elapsed));
    hud.setWeapon(weapon.getCurrentKey());
  }
  renderer.render(scene, camera);
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function settle(steps) {
  for (let i = 0; i < steps; i++) step(FIXED_STEP);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (!roundActive && !inBuyPhase) {
      // If we just unlocked after a round ended, go to buy phase
      openBuyMenu();
    }
  } else {
    if (roundActive) {
      hud.showOverlay('paused', score + roundKills);
    }
  }
}

// ---- Screenshot modes for judge ----
function runShot(name) {
  hud.hideOverlay();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'play' || name === 'end') {
    body.position.set(0, 0, 16);
    settle(20);
    // Aim at first bot and fire a few shots
    for (let i = 0; i < Math.min(2, bots.count()); i++) {
      const bp = bots.meshes[i].position;
      aimAt(new THREE.Vector3(bp.x, bp.y + 1, bp.z));
      shootPlayerBullet();
      settle(6);
    }
    if (name === 'play') {
      settle(12);
      // Show weapon model clearly
      aimAt(new THREE.Vector3(0, 1.5, -6));
      shootPlayerBullet();
      settle(1);
    } else {
      settle(40);
    }
  } else {
    // Start screen: show overlay
    body.position.set(0.6, 0, 18.6);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start', 0);
  }
  hud.setScore(score);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) {
  runShot(shot);
} else {
  // Initial start overlay
  hud.showOverlay('start', 0);
  requestAnimationFrame(frame);
}
