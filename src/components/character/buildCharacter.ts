import * as THREE from 'three';

/** Look of the procedural fallback figure (used if a 3D model can't load on a device). */
export interface ProceduralLook {
  frame: 'broad' | 'balanced' | 'curvy';
  build: 'lean' | 'regular' | 'muscular';
  skin: string;
  hair: 'short' | 'buzz' | 'long' | 'bun' | 'none';
  hairColor: string;
  top: 'tee' | 'tank';
  topColor: string;
  bottomColor: string;
  shoeColor: string;
}

/**
 * Procedurally modelled, fully customizable athlete (~1.8 units tall, feet at y = 0,
 * facing +z). Built from real geometry so it lights, rotates and re-dresses live.
 */

const SEG = 28;

type Mats = Record<'skin' | 'top' | 'bottom' | 'shoe' | 'sole' | 'sock' | 'hair' | 'eye' | 'watch' | 'lip', THREE.Material>;

function makeMaterials(a: ProceduralLook): Mats {
  const std = (color: string, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const skin = new THREE.Color(a.skin);
  return {
    skin: std(a.skin, 0.62),
    top: std(a.topColor, 0.92),
    bottom: std(a.bottomColor, 0.88),
    shoe: std(a.shoeColor, 0.55),
    sole: std('#F1EFE9', 0.7),
    sock: std('#F5F3EE', 0.95),
    hair: std(a.hairColor, 0.75, { side: THREE.DoubleSide }),
    eye: std('#1A1A1A', 0.3),
    watch: std('#1D1F1E', 0.35),
    lip: std(`#${skin.clone().multiplyScalar(0.9).getHexString()}`, 0.6),
  };
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geo, mat);
}

/** Tapered limb hanging down from its joint at the group origin. */
function limb(r1: number, r2: number, len: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(r1, r2, len, SEG, 1, true), mat);
  body.position.y = -len / 2;
  const top = mesh(new THREE.SphereGeometry(r1, SEG, 14), mat);
  const bottom = mesh(new THREE.SphereGeometry(r2, SEG, 14), mat);
  bottom.position.y = -len;
  g.add(body, top, bottom);
  return g;
}

function shadowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - d, 1.8);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 20;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

export interface CharacterRig {
  root: THREE.Group;
  torso: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  head: THREE.Group;
  /** Ground shadow; kept outside `root` so it doesn't rotate with the body. */
  shadow: THREE.Mesh;
  dispose(): void;
}

export function buildCharacter(a: ProceduralLook): CharacterRig {
  const m = makeMaterials(a);
  const b = a.build === 'lean' ? 0.9 : a.build === 'muscular' ? 1.14 : 1;
  const sh = a.frame === 'broad' ? 1.07 : a.frame === 'curvy' ? 0.93 : 1;
  const hip = a.frame === 'broad' ? 0.97 : a.frame === 'curvy' ? 1.12 : 1;
  const chest = a.build === 'muscular' ? 1.08 : a.build === 'lean' ? 0.95 : 1;

  const root = new THREE.Group();

  /** Smooth body section revolved around the y axis, flattened front-to-back. */
  const lathe = (pts: [number, number][], mat: THREE.Material, depth: number) => {
    const g = mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 44), mat);
    g.scale.z = depth;
    return g;
  };
  const ring = (r: number, tube: number, y: number, mat: THREE.Material, depth = 1) => {
    const t = mesh(new THREE.TorusGeometry(r, tube, 8, 44), mat);
    t.rotation.x = Math.PI / 2;
    t.scale.y = depth;
    t.position.y = y;
    return t;
  };

  // ---------- legs ----------
  const hipY = 0.92;
  const legX = 0.09 * hip;
  const thighLen = 0.42;
  const shinLen = 0.4;
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * legX, hipY, 0);
    leg.rotation.z = side * 0.03;

    leg.add(limb(0.088 * b * Math.sqrt(hip), 0.06 * b, thighLen, m.skin));
    const knee = new THREE.Group();
    knee.position.y = -thighLen;
    knee.rotation.z = -side * 0.025;
    const kneecap = mesh(new THREE.SphereGeometry(0.04 * b, 16, 12), m.skin);
    kneecap.scale.set(1, 1.1, 0.8);
    kneecap.position.set(0, 0.0, 0.018 * b);
    const shin = limb(0.059 * b, 0.041 * b, shinLen, m.skin);
    const calf = mesh(new THREE.SphereGeometry(0.056 * b, SEG, 14), m.skin);
    calf.scale.set(1, 2, 1.05);
    calf.position.set(0, -0.13, -0.014);
    const sock = mesh(new THREE.CylinderGeometry(0.046, 0.044, 0.1, SEG), m.sock);
    sock.position.y = -shinLen + 0.035;
    knee.add(kneecap, shin, calf, sock);
    leg.add(knee);
    root.add(leg);

    const footX = side * (legX + 0.014);
    const shoe = mesh(new THREE.CapsuleGeometry(0.05, 0.15, 8, SEG), m.shoe);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1.0, 1, 0.8);
    shoe.position.set(footX, 0.052, 0.042);
    const sole = mesh(new THREE.CapsuleGeometry(0.053, 0.165, 8, SEG), m.sole);
    sole.rotation.x = Math.PI / 2;
    sole.scale.set(1.04, 1, 0.32);
    sole.position.set(footX, 0.017, 0.044);
    root.add(shoe, sole);
  }

  // ---------- shorts ----------
  const bottomDouble = (m.bottom as THREE.MeshStandardMaterial).clone();
  bottomDouble.side = THREE.DoubleSide;
  root.add(
    lathe(
      [
        [0.0, 0.74],
        [0.07, 0.745],
        [0.12 * hip, 0.775],
        [0.152 * hip, 0.82],
        [0.166 * hip, 0.87],
        [0.172 * hip, 0.93],
        [0.16 * hip, 0.99],
        [0.152 * hip, 1.03],
        [0.0, 1.035],
      ],
      m.bottom,
      0.57,
    ),
  );
  root.add(ring(0.153 * hip, 0.007, 1.0, m.bottom, 0.6));
  for (const side of [-1, 1]) {
    const w = Math.max(b, 1);
    const shortLeg = mesh(new THREE.CylinderGeometry(0.094 * Math.sqrt(hip) * w, 0.091 * w, 0.31, SEG, 1, true), bottomDouble);
    shortLeg.position.set(side * (legX + 0.01), 0.806, 0);
    shortLeg.rotation.z = side * 0.035;
    const hem = ring(0.092 * w, 0.0055, 0, m.bottom);
    hem.position.set(side * (legX + 0.015), 0.652, 0);
    root.add(shortLeg, hem);
  }

  // ---------- torso ----------
  const torso = new THREE.Group();
  const c = chest;
  const hemR = Math.max(0.166 * hip, 0.162);
  torso.add(
    lathe(
      [
        [0.0, 0.955],
        [hemR, 0.955],
        [hemR - 0.002, 0.99],
        [0.153 * Math.min(hip, 1.05), 1.06],
        [0.157 * c, 1.14],
        [0.171 * c * sh, 1.23],
        [0.182 * c * sh, 1.31],
        [0.185 * sh, 1.38],
        [0.175 * sh, 1.43],
        [0.158 * sh, 1.468],
        [0.128, 1.502],
        [0.092, 1.533],
        [0.06, 1.562],
        [0.0, 1.567],
      ],
      m.top,
      0.6,
    ),
  );
  torso.add(ring(hemR, 0.006, 0.958, m.top, 0.6));
  torso.add(ring(0.062, 0.008, 1.556, a.top === 'tank' ? m.skin : m.top, 0.85));
  if (a.frame === 'curvy') {
    for (const side of [-1, 1]) {
      const bust = mesh(new THREE.SphereGeometry(0.066, SEG, 14), m.top);
      bust.scale.set(1.05, 0.82, 0.5);
      bust.position.set(side * 0.064, 1.285, 0.058);
      torso.add(bust);
    }
  } else if (a.build === 'muscular') {
    for (const side of [-1, 1]) {
      const pec = mesh(new THREE.SphereGeometry(0.084, SEG, 14), m.top);
      pec.scale.set(1.05, 0.68, 0.52);
      pec.position.set(side * 0.074, 1.33, 0.066);
      torso.add(pec);
    }
  }
  if (a.top === 'tank') {
    // Exposed trapezius / upper chest around the neck.
    const yoke = mesh(new THREE.SphereGeometry(0.14 * sh, SEG, 14, 0, Math.PI * 2, 0, Math.PI * 0.3), m.skin);
    yoke.scale.set(1.1, 0.95, 0.6);
    yoke.position.y = 1.435;
    torso.add(yoke);
  }
  root.add(torso);

  // ---------- neck + head ----------
  const neck = mesh(new THREE.CylinderGeometry(0.049 * Math.sqrt(b), 0.056 * Math.sqrt(b), 0.13, SEG), m.skin);
  neck.position.y = 1.6;
  root.add(neck);

  const head = new THREE.Group();
  head.position.y = 1.738;
  head.scale.setScalar(1.07);
  const skull = mesh(new THREE.SphereGeometry(0.1, SEG, 20), m.skin);
  skull.scale.set(0.86, 1.04, 0.95);
  const jaw = mesh(new THREE.SphereGeometry(0.083, SEG, 16), m.skin);
  jaw.scale.set(0.82, 0.92, 0.9);
  jaw.position.set(0, -0.036, 0.008);
  head.add(skull, jaw);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.022, 12, 10), m.skin);
    ear.scale.set(0.45, 1, 0.75);
    ear.position.set(side * 0.085, -0.006, -0.004);
    const eye = mesh(new THREE.SphereGeometry(0.0095, 12, 10), m.eye);
    eye.scale.set(1, 1.1, 0.6);
    eye.position.set(side * 0.03, 0.01, 0.087);
    const brow = mesh(new THREE.BoxGeometry(0.03, 0.0065, 0.01), m.hair);
    brow.position.set(side * 0.031, 0.033, 0.088);
    brow.rotation.z = side * -0.1;
    head.add(ear, eye, brow);
  }
  const nose = mesh(new THREE.SphereGeometry(0.015, 12, 10), m.skin);
  nose.scale.set(0.85, 1.3, 1);
  nose.position.set(0, -0.013, 0.094);
  const mouth = mesh(new THREE.BoxGeometry(0.022, 0.0035, 0.004), m.lip);
  mouth.position.set(0, -0.05, 0.08);
  head.add(nose, mouth);

  if (a.hair !== 'none') {
    const buzz = a.hair === 'buzz';
    const cap = mesh(
      new THREE.SphereGeometry(buzz ? 0.1015 : 0.105, SEG, 16, 0, Math.PI * 2, 0, Math.PI * (buzz ? 0.5 : 0.55)),
      m.hair,
    );
    cap.scale.set(0.9, 1.04, 0.98);
    cap.rotation.x = -0.42;
    cap.position.set(0, 0.012, -0.006);
    head.add(cap);
    if (a.hair === 'short') {
      const top = mesh(new THREE.SphereGeometry(0.075, 20, 14), m.hair);
      top.scale.set(1.1, 0.5, 1.1);
      top.position.set(0.004, 0.084, 0.016);
      top.rotation.z = -0.08;
      head.add(top);
    }
    if (a.hair === 'long') {
      const back = mesh(new THREE.CylinderGeometry(0.097, 0.1, 0.24, SEG, 1, true, Math.PI / 2, Math.PI), m.hair);
      back.scale.z = 0.92;
      back.position.set(0, -0.1, -0.008);
      head.add(back);
    }
    if (a.hair === 'bun') {
      const bun = mesh(new THREE.SphereGeometry(0.045, 16, 12), m.hair);
      bun.position.set(0, 0.07, -0.088);
      head.add(bun);
    }
  }
  root.add(head);

  // ---------- arms ----------
  const topDouble = (m.top as THREE.MeshStandardMaterial).clone();
  topDouble.side = THREE.DoubleSide;
  const makeArm = (side: -1 | 1) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.172 * sh, 1.418, 0);
    arm.rotation.z = side * 0.13;
    const upperLen = 0.28;
    const foreLen = 0.255;
    const delt = mesh(new THREE.SphereGeometry(0.06 * b, SEG, 16), a.top === 'tee' ? m.top : m.skin);
    delt.scale.set(1, 1.08, 1.05);
    arm.add(delt);
    arm.add(limb(0.054 * b, 0.043 * b, upperLen, m.skin));
    if (a.top === 'tee') {
      const sleeve = mesh(new THREE.CylinderGeometry(0.063 * b, 0.061 * b, 0.14, SEG, 1, true), topDouble);
      sleeve.position.y = -0.065;
      const cuff = ring(0.061 * b, 0.0045, -0.135, m.top);
      arm.add(sleeve, cuff);
    }
    const elbow = new THREE.Group();
    elbow.position.y = -upperLen;
    elbow.rotation.set(-0.14, 0, side * 0.03);
    elbow.add(limb(0.046 * b, 0.034 * b, foreLen, m.skin));
    const forearm = mesh(new THREE.SphereGeometry(0.048 * b, SEG, 12), m.skin);
    forearm.scale.set(1, 2.1, 1);
    forearm.position.y = -0.07;
    elbow.add(forearm);
    const hand = mesh(new THREE.SphereGeometry(0.039, 16, 12), m.skin);
    hand.scale.set(0.7, 1.35, 1);
    hand.position.y = -foreLen - 0.044;
    elbow.add(hand);
    if (side === -1) {
      const watch = mesh(new THREE.CylinderGeometry(0.037 * b, 0.037 * b, 0.028, SEG), m.watch);
      watch.position.y = -foreLen + 0.035;
      elbow.add(watch);
    }
    arm.add(elbow);
    return arm;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  root.add(leftArm, rightArm);

  // ---------- contact shadow ----------
  const tex = shadowTexture();
  const shadow = mesh(
    new THREE.PlaneGeometry(0.95, 0.55),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;

  const dispose = () => {
    const mats = new Set<THREE.Material>();
    [root, shadow].forEach((obj) => obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        mats.add(o.material as THREE.Material);
      }
    }));
    mats.forEach((mat) => mat.dispose());
    bottomDouble.dispose();
    topDouble.dispose();
    tex.dispose();
  };

  return { root, torso, leftArm, rightArm, head, shadow, dispose };
}

/** Soft ground shadow under the figure; stays put while the figure turns. */
export function createContactShadow(): THREE.Mesh {
  const shadow = mesh(
    new THREE.PlaneGeometry(0.95, 0.55),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  return shadow;
}
