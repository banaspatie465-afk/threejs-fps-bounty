// Bot enemies: patrol routes, detect player, chase, and shoot.
// Each bot is a box mesh with simple finite-state AI.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_HEIGHT = 1.7;
const BOT_RADIUS = 0.3;
const PATROL_SPEED = 2.0;
const CHASE_SPEED = 3.8;
const DETECTION_RANGE = 18;
const SHOOT_RANGE = 14;
const SHOOT_INTERVAL = 0.9; // seconds between shots
const STATE_PATROL = 0;
const STATE_CHASE = 1;
const STATE_SHOOT = 2;

export function createBots(scene, colliders, count = 4) {
  const bots = [];
  const botMeshes = [];
  const botGroup = new THREE.Group();
  scene.add(botGroup);

  // Spawn points scattered around the map
  const spawnPoints = [
    new THREE.Vector3(-8, 0, -9),
    new THREE.Vector3(8, 0, -9),
    new THREE.Vector3(-9, 0, 2),
    new THREE.Vector3(9, 0, 2),
    new THREE.Vector3(0, 0, -10),
  ];

  for (let i = 0; i < count; i++) {
    const pos = spawnPoints[i % spawnPoints.length].clone();
    // Add some randomness to position
    pos.x += (Math.random() - 0.5) * 2;
    pos.z += (Math.random() - 0.5) * 2;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, BOT_HEIGHT, 0.6),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(PALETTE.accent),
        roughness: 0.8,
        metalness: 0.1,
      })
    );
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    botGroup.add(mesh);

    // Head marker (smaller box on top)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas) })
    );
    head.position.y = BOT_HEIGHT / 2 + 0.17;
    head.userData.part = 'head';
    mesh.add(head);

    botMeshes.push(mesh, head);

    // Pick two random patrol points within the arena bounds
    const patrolA = new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      0,
      (Math.random() - 0.5) * 20
    );
    const patrolB = new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      0,
      (Math.random() - 0.5) * 20
    );

    bots.push({
      mesh,
      state: STATE_PATROL,
      health: 100,
      velocity: new THREE.Vector3(),
      patrolTargets: [patrolA, patrolB],
      patrolIndex: 0,
      lastShot: 0,
      direction: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
    });
  }

  return {
    meshes: botMeshes,
    count: () => bots.length,
    aliveCount: () => bots.filter(b => b.health > 0).length,
    reset() {
      bots.forEach((bot, i) => {
        bot.health = 100;
        bot.state = STATE_PATROL;
        bot.velocity.set(0, 0, 0);
        const sp = spawnPoints[i % spawnPoints.length].clone();
        sp.x += (Math.random() - 0.5) * 2;
        sp.z += (Math.random() - 0.5) * 2;
        bot.mesh.position.copy(sp);
        bot.mesh.visible = true;
      });
    },
    step(dt, playerPos, elapsed) {
      const dir = new THREE.Vector3();
      bots.forEach(bot => {
        if (bot.health <= 0) return;

        const dx = playerPos.x - bot.mesh.position.x;
        const dz = playerPos.z - bot.mesh.position.z;
        const distToPlayer = Math.hypot(dx, dz);

        // State transitions
        if (distToPlayer < DETECTION_RANGE && bot.state === STATE_PATROL) {
          bot.state = STATE_CHASE;
        }
        if (bot.state === STATE_CHASE && distToPlayer > DETECTION_RANGE * 1.3) {
          bot.state = STATE_PATROL;
        }
        if (distToPlayer < SHOOT_RANGE && bot.state !== STATE_SHOOT) {
          bot.state = STATE_SHOOT;
        } else if (bot.state === STATE_SHOOT && distToPlayer > SHOOT_RANGE * 1.2) {
          bot.state = STATE_CHASE;
        }

        // Behavior per state
        let speed = 0;
        let targetDir = null;

        if (bot.state === STATE_PATROL) {
          speed = PATROL_SPEED;
          const target = bot.patrolTargets[bot.patrolIndex];
          const dToTarget = bot.mesh.position.distanceTo(target);
          if (dToTarget < 1.0) {
            bot.patrolIndex = 1 - bot.patrolIndex;
          } else {
            targetDir = target.clone().sub(bot.mesh.position).normalize();
          }
        } else if (bot.state === STATE_CHASE) {
          speed = CHASE_SPEED;
          targetDir = new THREE.Vector3(dx, 0, dz).normalize();
        } else if (bot.state === STATE_SHOOT) {
          speed = PATROL_SPEED * 0.4; // Slow while shooting
          targetDir = new THREE.Vector3(dx, 0, dz).normalize();
          // Shoot at player (emit a ray, handled externally by passing shooter callback)
          if (elapsed - bot.lastShot > SHOOT_INTERVAL) {
            bot.lastShot = elapsed;
            // Return a shot event: {from, direction}
            bot._pendingShot = {
              from: bot.mesh.position.clone(),
              direction: targetDir.clone(),
            };
          }
        }

        // Move towards targetDir or current direction
        if (targetDir) {
          bot.direction.lerp(targetDir, dt * 3).normalize();
        }
        bot.velocity.x = bot.direction.x * speed;
        bot.velocity.z = bot.direction.z * speed;

        // Simple collision with world colliders (push away)
        const nextX = bot.mesh.position.x + bot.velocity.x * dt;
        const nextZ = bot.mesh.position.z + bot.velocity.z * dt;
        const probe = new THREE.Box3();
        probe.min.set(nextX - BOT_RADIUS, 0.1, nextZ - BOT_RADIUS);
        probe.max.set(nextX + BOT_RADIUS, BOT_HEIGHT, nextZ + BOT_RADIUS);
        let blocked = false;
        for (const col of colliders) {
          if (probe.intersectsBox(col)) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          bot.mesh.position.x = nextX;
          bot.mesh.position.z = nextZ;
        } else {
          // Pick a new random direction
          bot.direction.set((Math.random() - 0.5), 0, (Math.random() - 0.5)).normalize();
        }

        // Face movement direction
        bot.mesh.rotation.y = Math.atan2(bot.direction.x, bot.direction.z);
      });
    },
    // Collect any pending bot shots from this frame
    takeShots() {
      const shots = [];
      bots.forEach(bot => {
        if (bot._pendingShot) {
          shots.push(bot._pendingShot);
          bot._pendingShot = null;
        }
      });
      return shots;
    },
    damage(botIndex, amount) {
      if (bots[botIndex]) {
        bots[botIndex].health -= amount;
        if (bots[botIndex].health <= 0) {
          bots[botIndex].mesh.visible = false;
        }
      }
    },
  };
}
