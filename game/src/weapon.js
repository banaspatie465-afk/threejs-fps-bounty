// Weapon system: multiple weapon types, each with view model, muzzle flash, and distinct stats.
// Pistol is default; others are purchased between rounds.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WEAPONS = {
  pistol: {
    name: 'Pistol',
    magSize: 12,
    reserve: 48,
    fireGap: 0.15,
    reloadTime: 1.5,
    spreadStill: 0.018,
    spreadMoving: 0.03,
    moveRef: 5.0,
    muzzleTime: 0.05,
    color: PALETTE.muted,
    bodyColor: PALETTE.hairline,
    cost: 0,
  },
  rifle: {
    name: 'Rifle',
    magSize: 30,
    reserve: 90,
    fireGap: 0.096,
    reloadTime: 1.9,
    spreadStill: 0.0022,
    spreadMoving: 0.028,
    moveRef: 5.2,
    muzzleTime: 0.06,
    color: PALETTE.ink,
    bodyColor: PALETTE.hairline,
    cost: 2700,
  },
  shotgun: {
    name: 'Shotgun',
    magSize: 6,
    reserve: 30,
    fireGap: 0.5,
    reloadTime: 2.8,
    spreadStill: 0.06,
    spreadMoving: 0.1,
    moveRef: 4.0,
    muzzleTime: 0.08,
    pellets: 6,
    color: PALETTE.surface,
    bodyColor: PALETTE.canvas,
    cost: 1200,
  },
  smg: {
    name: 'SMG',
    magSize: 35,
    reserve: 105,
    fireGap: 0.07,
    reloadTime: 1.9,
    spreadStill: 0.012,
    spreadMoving: 0.035,
    moveRef: 5.5,
    muzzleTime: 0.04,
    color: PALETTE.accent,
    bodyColor: PALETTE.surface,
    cost: 1800,
  },
};

export function createWeapon(camera) {
  let currentKey = 'pistol';
  const equipped = { pistol: true };
  let modelGroup = null;
  let flashMesh = null;
  let flashLight = null;

  // Shared state shape
  const state = {
    mag: 0,
    reserve: 0,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
  };

  function buildModel(key) {
    // Remove old model if any
    if (modelGroup) {
      camera.remove(modelGroup);
      modelGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    if (flashMesh) {
      camera.remove(flashMesh);
      flashMesh.geometry.dispose();
      flashMesh.material.dispose();
    }
    if (flashLight) {
      camera.remove(flashLight);
    }

    const cfg = WEAPONS[key];
    const gripMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.bodyColor),
      roughness: 0.7,
      metalness: 0.2,
    });
    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.color),
      roughness: 0.5,
      metalness: 0.35,
    });

    modelGroup = new THREE.Group();
    // Simple box gun; dimensions vary slightly by type
    const receiverW = key === 'shotgun' ? 0.07 : 0.09;
    const receiverH = key === 'pistol' ? 0.06 : 0.1;
    const receiverD = key === 'pistol' ? 0.15 : (key === 'shotgun' ? 0.35 : 0.42);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(receiverW, receiverH, receiverD), bodyMat);
    modelGroup.add(receiver);

    // Barrel
    const barrelLen = key === 'pistol' ? 0.15 : (key === 'shotgun' ? 0.38 : 0.4);
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(receiverW * 0.5, receiverW * 0.5, barrelLen),
      gripMat
    );
    barrel.position.set(0, receiverH * 0.2, -(receiverD / 2 + barrelLen / 2 - 0.02));
    modelGroup.add(barrel);

    // Stock (not for pistol)
    if (key !== 'pistol') {
      const stock = new THREE.Mesh(
        new THREE.BoxGeometry(receiverW * 0.8, receiverH * 0.8, 0.2),
        gripMat
      );
      stock.position.set(0, -receiverH * 0.1, receiverD / 2 + 0.1);
      modelGroup.add(stock);
    }

    // Position model relative to camera
    const offsetX = key === 'pistol' ? 0.18 : 0.24;
    const offsetY = key === 'pistol' ? -0.15 : -0.2;
    const offsetZ = key === 'pistol' ? -0.25 : -0.42;
    modelGroup.position.set(offsetX, offsetY, offsetZ);
    camera.add(modelGroup);

    // Muzzle flash plane
    flashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.accent),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    flashMesh.position.set(offsetX, offsetY + 0.04, offsetZ - 0.55);
    flashMesh.visible = false;
    camera.add(flashMesh);

    // Flash light
    flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
    flashLight.position.set(offsetX, offsetY + 0.06, offsetZ - 0.5);
    camera.add(flashLight);

    // Reset state to this weapon's defaults
    state.mag = cfg.magSize;
    state.reserve = cfg.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
  }

  function getConfig() {
    return WEAPONS[currentKey];
  }

  // Build initial model
  buildModel('pistol');

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (modelGroup) {
      modelGroup.position.z += state.kick * 0.5; // small push back
      modelGroup.rotation.x = state.kick * 2.0;
    }
    if (flashMesh) {
      flashMesh.visible = state.flash > 0;
      flashMesh.rotation.z = state.flash * 30;
    }
    if (flashLight) {
      flashLight.intensity = state.flash > 0 ? 18 : 0;
    }
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (modelGroup) {
        modelGroup.rotation.x = -0.55 * Math.min(1, (getConfig().reloadTime - state.reloadLeft) * 2);
      }
      if (state.reloadLeft === 0) {
        const need = getConfig().magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  function pullTrigger() {
    state.cooldown = getConfig().fireGap;
    state.flash = getConfig().muzzleTime;
    state.kick = 0.055;
  }

  function takeRound() {
    if (state.mag <= 0) return false;
    state.mag -= 1;
    return true;
  }

  function reload() {
    if (state.reloadLeft > 0 || state.mag === getConfig().magSize || state.reserve === 0) return;
    state.reloadLeft = getConfig().reloadTime;
  }

  function ready() {
    return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
  }

  function refill() {
    state.mag = getConfig().magSize;
    state.reserve = getConfig().reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
  }

  function spread(speed) {
    const cfg = getConfig();
    return cfg.spreadStill + Math.min(1, speed / cfg.moveRef) * cfg.spreadMoving;
  }

  function switchTo(key) {
    if (!WEAPONS[key] || !equipped[key]) return false;
    currentKey = key;
    buildModel(key);
    return true;
  }

  function purchase(key) {
    if (equipped[key]) return { ok: false, reason: 'already_owned' };
    if (!WEAPONS[key]) return { ok: false, reason: 'unknown_weapon' };
    equipped[key] = true;
    return { ok: true };
  }

  function reset() {
    currentKey = 'pistol';
    equipped.pistol = true;
    delete equipped.rifle;
    delete equipped.shotgun;
    delete equipped.smg;
    buildModel('pistol');
  }

  return {
    state,
    step,
    ready,
    pullTrigger,
    takeRound,
    reload,
    spread,
    refill,
    switchTo,
    purchase,
    reset,
    getPellets() {
      return getConfig().pellets || 1;
    },
    getCurrentKey() {
      return currentKey;
    },
    getEquipped() {
      return { ...equipped };
    },
    getModel() {
      return modelGroup;
    },
  };
}
