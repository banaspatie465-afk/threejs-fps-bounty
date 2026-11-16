// Map: outdoor compound with cover, buildings, and lanes.
// More varied than a grey room — walls, crates, barriers, pillars, and ambient details.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  // Slightly different material for "concrete" vs "metal" feel
  const concreteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.surface),
    roughness: 0.95,
    metalness: 0.0,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.hairline),
    roughness: 0.6,
    metalness: 0.3,
  });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat) {
    const material = typeof mat === 'string' ? materials[mat] : mat;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground plane (large, visible but flat)
  box(48, 0.2, 48, 0, -0.1, 0, concreteMat);

  // Outer walls (define arena boundary, ~44x44m)
  const wallH = 4.5;
  box(44.4, wallH, 0.4, 0, wallH/2, -22.2, concreteMat); // North
  box(44.4, wallH, 0.4, 0, wallH/2, 22.2, concreteMat);  // South
  box(0.4, wallH, 44.4, -22.2, wallH/2, 0, concreteMat); // West
  box(0.4, wallH, 44.4, 22.2, wallH/2, 0, concreteMat);  // East

  // Central structure: a two-story building with opening
  box(8, 3.0, 6, 0, 1.5, -6, concreteMat); // Main block
  box(8, 2.0, 6, 0, 4.0, -6, concreteMat); // Upper floor
  // Hole for movement through center (by not filling certain parts)

  // Cover objects scattered around
  // Crates
  box(1.6, 1.6, 1.6, -6, 0.8, -2, metalMat);
  box(1.6, 1.6, 1.6, 6, 0.8, -2, metalMat);
  box(2.0, 1.0, 2.0, -4, 0.5, 4, metalMat);
  box(2.0, 1.0, 2.0, 4, 0.5, 4, metalMat);

  // Low walls / barriers
  box(4, 1.0, 0.4, -10, 0.5, 0, concreteMat);
  box(4, 1.0, 0.4, 10, 0.5, 0, concreteMat);
  box(0.4, 1.0, 6, 0, 0.5, 8, concreteMat);

  // Pillars
  box(0.8, 3.5, 0.8, -12, 1.75, -10, concreteMat);
  box(0.8, 3.5, 0.8, 12, 1.75, -10, concreteMat);
  box(0.8, 3.5, 0.8, -12, 1.75, 10, concreteMat);
  box(0.8, 3.5, 0.8, 12, 1.75, 10, concreteMat);

  // Raised platforms (for vertical gameplay)
  box(6, 0.5, 4, -8, 0.25, 10, concreteMat);
  box(6, 0.5, 4, 8, 0.25, 10, concreteMat);

  // Barrels (cylinders approximated by boxes for simplicity)
  function barrel(x, z) {
    box(0.7, 1.0, 0.7, x, 0.5, z, metalMat);
  }
  barrel(-3, -8);
  barrel(3, -8);
  barrel(-7, 5);
  barrel(7, 5);
  barrel(0, -15);
  barrel(-15, 0);
  barrel(15, 0);

  // Sandbags (low cover, made of several thin boxes stacked)
  function sandbag(x, z, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    for (let i = 0; i < 3; i++) {
      const sb = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.3, 0.6),
        concreteMat
      );
      sb.position.y = 0.15 + i * 0.25;
      sb.castShadow = true;
      sb.receiveShadow = true;
      g.add(sb);
    }
    group.add(g);
    colliders.push(new THREE.Box3().setFromObject(g));
    shootables.push(...g.children);
  }
  sandbag(-5, -5);
  sandbag(5, -5);
  sandbag(0, 3);

  // Lighting setup
  const sky = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.surface),
    new THREE.Color(PALETTE.canvas),
    1.0
  );
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 1.8);
  key.position.set(12, 20, 8);
  key.target.position.set(0, 0, -5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -24;
  key.shadow.camera.right = 24;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-10, 8, 12);
  scene.add(fill);

  // Ambient point lights for atmosphere
  const warmLight = new THREE.PointLight(new THREE.Color(0xffaa44), 0.6, 18);
  warmLight.position.set(-8, 2.5, -10);
  scene.add(warmLight);

  const coolLight = new THREE.PointLight(new THREE.Color(0x4488ff), 0.4, 15);
  coolLight.position.set(8, 2.5, 10);
  scene.add(coolLight);

  return { colliders, shootables, group };
}
