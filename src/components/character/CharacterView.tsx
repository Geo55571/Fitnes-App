import { useFocusEffect } from 'expo-router';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, PanResponder, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import type { AvatarConfig } from '@/domain/types';
import { colors } from '@/theme';

import { createAvatarRig, type Appearance, type Reaction } from './avatarRig';
import { buildCharacter, createContactShadow, type ProceduralLook } from './buildCharacter';
import { loadAvatarModel } from './loadModel';
import { getAvatarModel } from './models';

export type { Reaction };

interface Props {
  avatar: AvatarConfig;
  height: number;
  style?: ViewStyle;
  /** Resting yaw in radians (0 = facing the viewer). */
  restAngle?: number;
  background?: string;
  /** -0.3 … 1. Grows with consistency; see useAthleticLevel. */
  athletic?: number;
  /** Change `key` to play `type` once (e.g. celebrate when goals are done). */
  reaction?: { type: Reaction; key: number } | null;
}

/** What's on the turntable: the animated model, or the procedural fallback. */
interface Figure {
  root: THREE.Object3D;
  update(dt: number, t: number, yaw: number): void;
  play(r: Reaction): void;
  setAppearance(a: AvatarConfig): void;
  setAthletic(level: number): void;
  dispose(): void;
}

interface GLState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  turntable: THREE.Group;
  figure: Figure | null;
  frame: number;
  dispose(): void;
}

interface Spin {
  angle: number;
  velocity: number;
  dragging: boolean;
  dragStart: number;
  lastTouch: number;
}

/** Drag-to-rotate gesture. Mutable spin state is shared with the render loop, outside React state. */
function createSpinController(restAngle: number) {
  const spin: Spin = { angle: restAngle, velocity: 0, dragging: false, dragStart: 0, lastTouch: 0 };
  const pan = PanResponder.create({
    // Only claim clearly horizontal drags so the page can still scroll vertically and taps still register.
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderGrant: () => {
      spin.dragging = true;
      spin.dragStart = spin.angle;
      spin.velocity = 0;
    },
    onPanResponderMove: (_e, g) => {
      spin.angle = spin.dragStart + g.dx * 0.011;
      spin.lastTouch = Date.now();
    },
    onPanResponderRelease: (_e, g) => {
      spin.dragging = false;
      spin.velocity = g.vx * 0.18;
      spin.lastTouch = Date.now();
    },
    onPanResponderTerminate: () => {
      spin.dragging = false;
    },
    onPanResponderTerminationRequest: () => false,
  });
  return { spin, pan };
}

const appearanceOf = (a: AvatarConfig): Appearance => ({
  skin: a.skin,
  hairColor: a.hairColor,
  topColor: a.topColor,
  bottomColor: a.bottomColor,
  shoeColor: a.shoeColor,
});

/** Procedural stand-in, dressed from the same settings. */
function proceduralFigure(a: AvatarConfig): Figure {
  const woman = getAvatarModel(a.model).body === 'woman';
  const look = (): ProceduralLook => ({
    frame: woman ? 'curvy' : 'broad',
    build: a.build,
    skin: a.skin,
    hair: woman ? 'long' : 'short',
    hairColor: a.hairColor,
    top: 'tee',
    topColor: a.topColor ?? '#2B2D2C',
    bottomColor: a.bottomColor ?? '#242625',
    shoeColor: a.shoeColor ?? '#2E302F',
  });
  const holder = new THREE.Group();
  let rig = buildCharacter(look());
  holder.add(rig.root);
  rig.shadow.visible = false;
  return {
    root: holder,
    update(_dt, t) {
      const breath = Math.sin(t * 1.9);
      rig.torso.scale.set(1 + breath * 0.006, 1 + breath * 0.004, 1 + breath * 0.01);
      rig.leftArm.rotation.z = -0.11 - breath * 0.012;
      rig.rightArm.rotation.z = 0.11 + breath * 0.012;
      rig.head.rotation.y = Math.sin(t * 0.35) * 0.05;
    },
    play() {},
    setAppearance(next) {
      a = next;
      holder.remove(rig.root);
      rig.dispose();
      rig = buildCharacter(look());
      rig.shadow.visible = false;
      holder.add(rig.root);
    },
    setAthletic() {},
    dispose() {
      rig.dispose();
    },
  };
}

const TAP_REACTIONS: Reaction[] = ['punch', 'kick', 'wave'];

export function CharacterView({
  avatar,
  height,
  style,
  restAngle = -0.2,
  background = colors.bg,
  athletic = 0,
  reaction,
}: Props) {
  const glRef = useRef<GLState | null>(null);
  const activeRef = useRef(true);
  const avatarRef = useRef(avatar);
  const athleticRef = useRef(athletic);
  // The parsed model for the current avatar.model, or 'failed' to use the fallback.
  const modelRef = useRef<{ id: string; gltf: Awaited<ReturnType<typeof loadAvatarModel>> } | 'failed' | null>(null);
  const tapCount = useRef(0);
  // Which model id has finished loading (or failed); anything else means "still loading".
  const [readyModel, setReadyModel] = useState<string | null>(null);
  const loading = readyModel !== avatar.model;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [spinCtl] = useState(() => createSpinController(restAngle));
  const spin = spinCtl.spin;

  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;
      return () => {
        activeRef.current = false;
      };
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      activeRef.current = s === 'active';
    });
    return () => sub.remove();
  }, []);

  /** Puts the right figure on the turntable once both the GL scene and the model are ready. */
  const mountFigure = useCallback(() => {
    const st = glRef.current;
    const m = modelRef.current;
    if (!st || !m) return;
    let next: Figure;
    if (m === 'failed') {
      next = proceduralFigure(avatarRef.current);
    } else {
      const rig = createAvatarRig(m.gltf, avatarRef.current.model, appearanceOf(avatarRef.current));
      next = {
        root: rig.root,
        update: (dt, _t, yaw) => rig.update(dt, yaw),
        play: (r) => rig.play(r),
        setAppearance: (a) => rig.setAppearance(appearanceOf(a)),
        setAthletic: (l) => rig.setAthletic(l),
        dispose: () => rig.dispose(),
      };
    }
    if (st.figure) {
      st.turntable.remove(st.figure.root);
      st.figure.dispose();
    }
    next.setAthletic(athleticRef.current);
    st.turntable.add(next.root);
    st.figure = next;
  }, []);

  // Load (or switch) the 3D model.
  useEffect(() => {
    let alive = true;
    modelRef.current = null;
    loadAvatarModel(avatar.model)
      .then((gltf) => {
        if (!alive) return;
        modelRef.current = { id: avatar.model, gltf };
        mountFigure();
      })
      .catch((e) => {
        if (!alive) return;
        console.warn('Avatar model failed to load; using the built-in figure.', e);
        modelRef.current = 'failed';
        mountFigure();
      })
      .finally(() => alive && setReadyModel(avatar.model));
    return () => {
      alive = false;
    };
  }, [avatar.model, mountFigure]);

  // Recolour without reloading.
  useEffect(() => {
    avatarRef.current = avatar;
    glRef.current?.figure?.setAppearance(avatar);
  }, [avatar]);

  useEffect(() => {
    athleticRef.current = athletic;
    glRef.current?.figure?.setAthletic(athletic);
  }, [athletic]);

  useEffect(() => {
    if (reaction) glRef.current?.figure?.play(reaction.type);
  }, [reaction]);

  useEffect(() => () => glRef.current?.dispose(), []);

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      glRef.current?.dispose();

      const isWeb = Platform.OS === 'web';
      const webCanvas = isWeb ? (gl.canvas as HTMLCanvasElement) : null;
      const width = webCanvas ? webCanvas.clientWidth : gl.drawingBufferWidth;
      const heightPx = webCanvas ? webCanvas.clientHeight : gl.drawingBufferHeight;

      if (!isWeb) {
        // expo-gl logs a warning for every pixelStorei parameter it doesn't implement.
        const pixelStorei = gl.pixelStorei.bind(gl);
        gl.pixelStorei = (pname: number, param: number | boolean) => {
          if (pname === gl.UNPACK_FLIP_Y_WEBGL || pname === gl.UNPACK_ALIGNMENT) pixelStorei(pname, param as number);
        };
      }

      const canvas =
        webCanvas ??
        ({
          width: gl.drawingBufferWidth,
          height: gl.drawingBufferHeight,
          style: {},
          addEventListener: () => {},
          removeEventListener: () => {},
          clientHeight: gl.drawingBufferHeight,
          getContext: () => gl,
        } as unknown as HTMLCanvasElement);

      const renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: true });
      if (isWeb) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, heightPx, false);
      } else {
        renderer.setPixelRatio(1);
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
      }
      renderer.setClearColor(new THREE.Color(background), 1);
      // Filmic-but-neutral response keeps chosen colours true while giving skin soft highlights.
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new THREE.Scene();
      const aspect = width / heightPx;
      const camera = new THREE.PerspectiveCamera(26, aspect, 0.1, 30);
      // Fit the figure (FIGURE_HEIGHT, plus a celebration hop) vertically, ~1 unit horizontally.
      const vFov = THREE.MathUtils.degToRad(26);
      const fitH = 1.12 / Math.tan(vFov / 2);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
      const fitW = 0.55 / Math.tan(hFov / 2);
      const dist = Math.max(fitH, fitW);
      camera.position.set(0, 1.02, dist);
      camera.lookAt(0, 0.95, 0);

      // Image-based ambient light (a soft studio room) gives fabric folds and skin their shape.
      // Web only: PMREM needs float render targets, which expo-gl doesn't guarantee, so phones
      // use a brighter hemisphere instead.
      let envTex: THREE.Texture | null = null;
      if (isWeb) {
        try {
          const pmrem = new THREE.PMREMGenerator(renderer);
          const room = new RoomEnvironment();
          envTex = pmrem.fromScene(room, 0.04).texture;
          room.dispose();
          pmrem.dispose();
          scene.environment = envTex;
          scene.environmentIntensity = 0.42;
        } catch {
          envTex = null;
        }
      }

      // Three-point studio light: warm key high on the right, cool soft fill, and rims that
      // separate the silhouette from the background. The hemisphere adds floor bounce.
      scene.add(new THREE.HemisphereLight(0xfdfbf7, 0xa89f8e, envTex ? 0.35 : 0.95));
      const key = new THREE.DirectionalLight(0xfff3e6, envTex ? 2.5 : 2.9);
      key.position.set(1.8, 3.2, 2.4);
      const fill = new THREE.DirectionalLight(0xe6eefc, envTex ? 0.35 : 0.75);
      fill.position.set(-2.4, 1.2, 1.8);
      const rim = new THREE.DirectionalLight(0xffffff, 2.2);
      rim.position.set(-1.2, 2.4, -2.8);
      const rim2 = new THREE.DirectionalLight(0xfff6ee, 1.1);
      rim2.position.set(1.6, 1.6, -2.4);
      scene.add(key, fill, rim, rim2);

      const shadow = createContactShadow();
      scene.add(shadow);
      const turntable = new THREE.Group();
      scene.add(turntable);

      const state: GLState = {
        renderer,
        scene,
        camera,
        turntable,
        figure: null,
        frame: 0,
        dispose() {
          cancelAnimationFrame(state.frame);
          state.figure?.dispose();
          state.figure = null;
          const shadowMat = shadow.material as THREE.MeshBasicMaterial;
          shadowMat.map?.dispose();
          shadowMat.dispose();
          shadow.geometry.dispose();
          envTex?.dispose();
          renderer.dispose();
          if (glRef.current === state) glRef.current = null;
        },
      };
      glRef.current = state;
      mountFigure();

      const timer = new THREE.Timer();
      const loop = () => {
        state.frame = requestAnimationFrame(loop);
        if (!activeRef.current) return;
        timer.update();
        const dt = Math.min(timer.getDelta(), 0.05);
        const t = timer.getElapsed();
        const s = spin;

        if (!s.dragging) {
          if (Math.abs(s.velocity) > 0.0005) {
            s.angle += s.velocity * dt * 60 * 0.05;
            s.velocity *= Math.pow(0.9, dt * 60);
          } else if (Date.now() - s.lastTouch > 3500) {
            // Ease back to the resting pose via the shortest path, with a gentle idle sway.
            const target = restAngle + Math.sin(t * 0.45) * 0.12;
            const delta = Math.atan2(Math.sin(target - s.angle), Math.cos(target - s.angle));
            s.angle += delta * Math.min(1, dt * 1.6);
          }
        }
        turntable.rotation.y = s.angle;
        state.figure?.update(dt, t, s.angle);

        renderer.render(scene, camera);
        gl.endFrameEXP?.();
      };
      loop();
    },
    [background, restAngle, spin, mountFigure],
  );

  return (
    <Pressable
      style={[{ height }, style]}
      onPress={() => glRef.current?.figure?.play(TAP_REACTIONS[tapCount.current++ % TAP_REACTIONS.length])}
      accessibilityRole="imagebutton"
      accessibilityLabel="Your avatar. Tap for a move, drag sideways to rotate.">
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (w > 0 && h > 0) setSize({ w: Math.round(w), h: Math.round(h) });
        }}
        {...spinCtl.pan.panHandlers}>
        {size && (
          <GLView
            // A new GL context per size keeps the drawing buffer sharp after layout changes.
            key={`${size.w}x${size.h}`}
            style={styles.gl}
            onContextCreate={onContextCreate}
          />
        )}
        {loading && <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.textTertiary} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gl: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
});
