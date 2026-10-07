import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

import type { AvatarModelId } from './models';

export type Reaction = 'wave' | 'celebrate' | 'punch' | 'kick';

export interface Appearance {
  skin: string;
  hairColor: string;
  /** null keeps the model's original colour. */
  topColor: string | null;
  bottomColor: string | null;
  shoeColor: string | null;
}

type Slot = 'skin' | 'skinDark' | 'hair' | 'brows' | 'top' | 'bottom' | 'shoes' | 'keep';

/**
 * Which material is which body part, per model. Some models reuse one material for clothing
 * and shoes; those primitives are told apart by vertex count (stable for a given model file).
 */
const SLOTS: Record<AvatarModelId, { byName: Record<string, Slot>; byCount?: Record<string, Record<number, Slot>> }> = {
  'man-casual': {
    byName: { Skin: 'skin', Skin_Darker: 'skinDark', LightBrown: 'top', LightBlue: 'bottom', Red_Dark: 'shoes', Hair: 'hair', Eyebrows: 'brows' },
  },
  // Tank & shorts from the Beach character, with the Casual character's sneakers swapped in.
  'man-shorts': {
    byName: { Skin: 'skin', LightBrown: 'top', Red_Dark: 'bottom', Shoe_Red_Dark: 'shoes', Hair: 'hair', Eyebrows: 'brows' },
  },
  'man-hoodie': {
    byName: { Skin: 'skin', Purple: 'top', LightBlue: 'bottom', Hair: 'hair', Eyebrows: 'brows' },
    byCount: { Purple: { 512: 'shoes' } },
  },
  'woman-casual': {
    byName: { Skin: 'skin', White: 'top', Orange: 'bottom', Grey: 'shoes', Hair_Blond: 'hair', Hair_Brown: 'brows' },
  },
  'woman-adventurer': {
    byName: { Skin: 'skin', LightGreen: 'top', Brown_02: 'bottom', Hair_Brown: 'hair' },
    byCount: { Brown_02: { 836: 'shoes' } },
  },
};

/** Bones thickened as the avatar gets fitter: [name pattern, strength]. */
const ATHLETIC_BONES: [RegExp, number][] = [
  [/^UpperArm\.?[LR]$/, 0.16],
  [/^LowerArm\.?[LR]$/, 0.1],
  [/^Shoulder\.?[LR]$/, 0.08],
  [/^Chest$/, 0.06],
  [/^UpperLeg\.?[LR]$/, 0.07],
];

const CLIP: Record<Exclude<Reaction, 'celebrate'>, string> = {
  wave: 'Wave',
  punch: 'Punch_Right',
  kick: 'Kick_Right',
};

/** Every model is scaled to this height so framing is the same for all of them. */
export const FIGURE_HEIGHT = 1.8;

/** Surface response per body part: skin and hair get a soft sheen, fabric stays matte. */
const ROUGHNESS: Partial<Record<Slot, number>> = { skin: 0.58, skinDark: 0.6, hair: 0.5, brows: 0.7, shoes: 0.62 };

export interface AvatarRig {
  root: THREE.Object3D;
  /** `yaw` is the turntable angle; the head turns a little to keep looking at the viewer. */
  update(dt: number, yaw?: number): void;
  play(reaction: Reaction): void;
  setAppearance(a: Appearance): void;
  /** -0.3 (lean) … 1 (very athletic). */
  setAthletic(level: number): void;
  dispose(): void;
}

export function createAvatarRig(gltf: GLTF, modelId: AvatarModelId, appearance: Appearance): AvatarRig {
  const model = SkeletonUtils.clone(gltf.scene);
  const map = SLOTS[modelId];

  // Per-instance materials, one per (original material, slot).
  const slotMats = new Map<string, { slot: Slot; mat: THREE.MeshStandardMaterial; orig: THREE.Color }>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false; // skinned bounds don't follow animation
    const orig = mesh.material as THREE.MeshStandardMaterial;
    const count = mesh.geometry.attributes.position?.count ?? 0;
    const slot = map.byCount?.[orig.name]?.[count] ?? map.byName[orig.name] ?? 'keep';
    const key = `${orig.name}|${slot}`;
    let entry = slotMats.get(key);
    if (!entry) {
      const mat = orig.clone();
      mat.roughness = ROUGHNESS[slot] ?? 0.86;
      mat.metalness = 0;
      entry = { slot, mat, orig: orig.color.clone() };
      slotMats.set(key, entry);
    }
    mesh.material = entry.mat;
  });

  const root = new THREE.Group();
  root.add(model);

  // Animation.
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
  const idle = actions.get('Idle') ?? actions.get('Idle_Neutral') ?? [...actions.values()][0];
  idle?.play();

  // Measure in the idle pose (the file's bind pose is a T-pose): same height for every model,
  // feet on the ground, and the body centred over the turntable's axis.
  mixer.update(0);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const scale = FIGURE_HEIGHT / Math.max(0.01, box.max.y - box.min.y);
  model.scale.setScalar(scale);
  model.position.set(-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);

  // Look-at-viewer: a share of the turn goes to the neck, the rest to the head.
  const lookBones = (['Neck', 'Head'] as const)
    .map((name, i) => ({ bone: model.getObjectByName(name), share: i === 0 ? 0.4 : 0.6, base: new THREE.Quaternion() }))
    .filter((b): b is { bone: THREE.Object3D; share: number; base: THREE.Quaternion } => !!b.bone);
  const parentQ = new THREE.Quaternion();
  const parentInv = new THREE.Quaternion();
  const turnQ = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  for (const l of lookBones) l.base.copy(l.bone.quaternion);
  let look = 0;
  let current: THREE.AnimationAction | undefined = idle;
  let hopUntil = 0;
  let clock = 0;

  mixer.addEventListener('finished', (e) => {
    const done = (e as unknown as { action: THREE.AnimationAction }).action;
    if (done !== current || !idle) return;
    idle.reset().play();
    idle.crossFadeFrom(done, 0.35, false);
    current = idle;
  });

  const playOnce = (name: string) => {
    const action = actions.get(name);
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    if (current && current !== action) action.crossFadeFrom(current, 0.25, false);
    current = action;
  };

  // Athletic bone scaling, re-applied after every animation update.
  const bones: { bone: THREE.Object3D; rest: THREE.Vector3; k: number }[] = [];
  model.traverse((o) => {
    const hit = ATHLETIC_BONES.find(([re]) => re.test(o.name));
    if (hit && (o as THREE.Bone).isBone) bones.push({ bone: o, rest: o.scale.clone(), k: hit[1] });
  });
  let athletic = 0;

  const rig: AvatarRig = {
    root,
    update(dt, yaw = 0) {
      clock += dt;
      for (const b of bones) b.bone.scale.copy(b.rest);
      // Undo last frame's glance in case the current clip doesn't animate these bones.
      for (const l of lookBones) l.bone.quaternion.copy(l.base);
      mixer.update(dt);
      for (const l of lookBones) l.base.copy(l.bone.quaternion);
      // Turn back toward the camera (yaw 0 = facing it), up to ~40°, easing so it lags like a real glance.
      const wrapped = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      const want = Math.abs(wrapped) < 2.2 ? THREE.MathUtils.clamp(-wrapped * 0.7, -0.7, 0.7) : 0;
      look += (want - look) * Math.min(1, dt * 5);
      if (Math.abs(look) > 0.002 && lookBones.length) {
        model.updateMatrixWorld(true);
        for (const { bone, share } of lookBones) {
          // Rotate about the world up axis, expressed in the bone's parent space.
          bone.parent!.getWorldQuaternion(parentQ);
          turnQ.setFromAxisAngle(UP, look * share);
          bone.quaternion.premultiply(parentInv.copy(parentQ).invert().multiply(turnQ).multiply(parentQ));
        }
      }
      for (const b of bones) {
        const s = 1 + b.k * athletic;
        b.bone.scale.x *= s;
        b.bone.scale.z *= s;
      }
      // Celebration hops: two quick jumps.
      if (clock < hopUntil) {
        const p = 1 - (hopUntil - clock) / 1.1;
        const phase = (p * 2) % 1;
        root.position.y = Math.sin(phase * Math.PI) * 0.16;
      } else root.position.y = 0;
    },
    play(reaction) {
      if (reaction === 'celebrate') {
        playOnce('Wave');
        hopUntil = clock + 1.1;
      } else playOnce(CLIP[reaction]);
    },
    setAppearance(a) {
      const skin = new THREE.Color(a.skin);
      const hair = new THREE.Color(a.hairColor);
      for (const { slot, mat, orig } of slotMats.values()) {
        switch (slot) {
          case 'skin':
            mat.color.copy(skin);
            break;
          case 'skinDark':
            mat.color.copy(skin).multiplyScalar(0.8);
            break;
          case 'hair':
            mat.color.copy(hair);
            break;
          case 'brows':
            mat.color.copy(hair).multiplyScalar(0.55);
            break;
          case 'top':
            mat.color.copy(a.topColor ? new THREE.Color(a.topColor) : orig);
            break;
          case 'bottom':
            mat.color.copy(a.bottomColor ? new THREE.Color(a.bottomColor) : orig);
            break;
          case 'shoes':
            mat.color.copy(a.shoeColor ? new THREE.Color(a.shoeColor) : orig);
            break;
          default:
            break;
        }
      }
    },
    setAthletic(level) {
      athletic = Math.max(-0.3, Math.min(1, level));
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const { mat } of slotMats.values()) mat.dispose();
    },
  };
  rig.setAppearance(appearance);
  return rig;
}
