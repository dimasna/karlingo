import {
  AssetType,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  SessionMode,
  AssetManager,
  World,
  Color,
  PointLight,
  SpotLight,
  AmbientLight,
  RectAreaLight,
  Group,
  RepeatWrapping,
  CanvasTexture,
  DoubleSide,
  Fog
} from '@iwsdk/core';

import {
  DistanceGrabbable,
  MovementMode,
  Interactable,
  PanelUI,
  ScreenSpace
} from '@iwsdk/core';

import { EnvironmentType, LocomotionEnvironment, VisibilityState } from '@iwsdk/core';
import { PanelSystem, languageSettings } from './panel.js';
import { MicrophoneSystem, Microphone } from './microphone-system.js';
import {
  LightingSystem,
  DiscoBall,
  AnimatedSpotlight,
  DiscoFloorLight,
  setPartyMode
} from './lighting-system.js';
import { fetchYouTubeSubtitles } from './youtube-search.js';
import { Robot, ChatBubble, MicButton, RobotSystem, setUpdateBubbleCallback, initMicButton } from './robot.js';
import { getGreeting } from './llm-service.js';

import { Vector3 } from '@iwsdk/core';

// Store references to lights for toggling
const sceneLights = [];

// Store reference to TV screen for video playback
let tvScreenMesh = null;
let tvGroup = null;
let tvSubtitleMesh = null;

// Video state
let isVideoPlaying = false;
let currentVideoUrl = '';
let currentVideoTitle = '';

// Karaoke microphone audio state
let audioContext = null;
let analyser = null;
let microphoneStream = null;
let gainNode = null;
let micStream = null;
let convolverNode = null;
let compressor = null;
let micActive = false;
let microphoneEntity = null;

// Subtitle/lyrics state
let subtitleCanvas = null;
let subtitleContext = null;
let currentLyricIndex = 0;
let lyricInterval = null;
let currentSubtitles = null;

// Translation panel state
let translationPanelEntity = null;
let currentLyricWords = []; // Store word positions for click detection
let currentLyricText = ''; // Current displayed lyric text
let subtitleStartTime = 0;
let subtitleEntity = null; // Entity for subtitle mesh (for interactivity)
let worldRef = null; // Reference to world for creating entities

// ============ Procedural Texture Generators ============
function createCanvasTexture(width, height, drawFunc) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFunc(ctx, width, height);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function createCarpetTexture() {
  return createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2000; i++) {
      ctx.fillStyle = `rgba(${20 + Math.random() * 30}, ${20 + Math.random() * 30}, ${40 + Math.random() * 30}, 0.5)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 4);
    }
  });
}

function createWallTexture() {
  return createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = `rgba(25, 40, 70, ${0.2 + Math.random() * 0.2})`;
      ctx.fillRect(x, 0, 8, h);
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.03})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

function createLeatherTexture() {
  return createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4a1515';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(${30 + Math.random() * 40}, ${10 + Math.random() * 20}, ${10 + Math.random() * 20}, 0.3)`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 3 + 1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function createWoodTexture() {
  return createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3d2817';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 50; i++) {
      ctx.strokeStyle = `rgba(60, 35, 20, ${Math.random() * 0.3})`;
      ctx.lineWidth = Math.random() * 3 + 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.random() * h);
      ctx.bezierCurveTo(w * 0.3, Math.random() * h, w * 0.7, Math.random() * h, w, Math.random() * h);
      ctx.stroke();
    }
  });
}

function createAcousticTexture() {
  return createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0d0d15';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#151520';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let x = 16; x < w; x += 32) {
      for (let y = 16; y < h; y += 32) {
        ctx.fillStyle = '#080810';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

const assets = {
  chimeSound: {
    url: './audio/chime.mp3',
    type: AssetType.Audio,
    priority: 'background'
  },
  mic: {
    url: './gltf/mic/microphone.glb',
    type: AssetType.GLTF,
    priority: 'critical'
  },
  robot: {
    url: './gltf/robot/robot.gltf',
    type: AssetType.GLTF,
    priority: 'critical'
  }
};

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    features: { handTracking: { required: false }, layers: true }
  },
  features: { locomotion: true, grabbing: true, physics: false, sceneUnderstanding: false }
}).then((world) => {
  const { camera, scene, player, xrDefaults, input } = world;

  // Setup video overlay
  setupVideoOverlay();

  // Video overlay is now fixed at bottom center - no need to track controller

  // Set dark background and fog for KTV atmosphere

  player.position.set(1, 0.5, -1);
  scene.background = new Color(0x0a0a0a);
  scene.fog = new Fog(0x0a0a0a, 3, 12);

  // Position camera/player above the seats facing the TV
  camera.position.set(0, 1.4, 4);
  camera.lookAt(1, 2, 0);


  // Room dimensions - more spacious/longer
  const roomWidth = 6;
  const roomHeight = 3.2;
  const roomDepth = 7;

  // ============ Create KTV Room ============
  worldRef = world; // Store world reference for later use
  createKTVRoom(world, roomWidth, roomHeight, roomDepth);
  createTV(world);
  createSofa(world);
  createCoffeeTable(world);
  createSpeakers(world);
  createDiscoBall(world);
  createLighting(world);
  createNeonStrips(world, roomWidth, roomDepth);
  createLightSwitch(world);
  createBar(world);
  createBarRobot(world);

  // ============ Setup Subtitle Interactivity ============
  // Create an interactable entity for the subtitle mesh (separate from TV group)
  if (tvSubtitleMesh) {
    subtitleEntity = world.createTransformEntity(tvSubtitleMesh).addComponent(Interactable);

    // Add click handler for word translation
    tvSubtitleMesh.addEventListener('pointerdown', (event) => {
      console.log('Subtitle clicked!', event);
      handleSubtitleClick(event);
    });
  }

  // ============ Add Microphone ============
  const { scene: microphoneMesh } = AssetManager.getGLTF('mic');
  // Position microphone on table where user can grab it
  microphoneMesh.position.set(0.5, 0.5, -1.2);
  microphoneMesh.rotation.set(0, 0, 0);
  microphoneMesh.scale.setScalar(0.8);
  

  microphoneEntity = world
    .createTransformEntity(microphoneMesh)
    .addComponent(Interactable)
    .addComponent(DistanceGrabbable)
    .addComponent(Microphone);
  

  // ============ Welcome UI Panel (shown before XR) ============
  const welcomePanelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/welcome.json',
      maxHeight: 0.6,
      maxWidth: 1.2
    })
    .addComponent(Interactable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '35%'
    });
  welcomePanelEntity.object3D.position.set(0, 1.0, -1.1);
  welcomePanelEntity.object3D.rotateX(-Math.PI / 7);

  // ============ KTV Menu Panel (shown in XR) ============
  const ktvPanelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/ktv-menu.json',
      maxHeight: 1.4,
      maxWidth: 2.0
    })
    .addComponent(Interactable);
  ktvPanelEntity.object3D.position.set(-2.0, 1.2, -0.8);
  ktvPanelEntity.object3D.rotateX(-Math.PI / 7);
  ktvPanelEntity.object3D.visible = false;

  // ============ Word Translation Panel ============
  translationPanelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/word-translation.json',
      maxHeight: 0.8,
      maxWidth: 0.6
    })
    .addComponent(Interactable);
  translationPanelEntity.object3D.position.set(1.2, 1.4, -0.8);
  translationPanelEntity.object3D.rotateX(-Math.PI / 7);
  translationPanelEntity.object3D.visible = false;

  // ============ Settings Panel ============
  const settingsPanelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/settings.json',
      maxHeight: 1.6,
      maxWidth: 1.2
    })
    .addComponent(Interactable);
  settingsPanelEntity.object3D.position.set(-1, 1.2, -0.8);
  settingsPanelEntity.object3D.rotateX(-Math.PI / 7);
  settingsPanelEntity.object3D.visible = false;

  // ============ Review Monitor Frame (on front wall behind sofa) ============
  createReviewMonitor(world);

  // ============ Review Session Panel (on front wall behind sofa) ============
  const reviewPanelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/review-session.json',
      maxHeight: 1.0,
      maxWidth: 0.7
    })
    .addComponent(Interactable);
  // Position on front wall (behind sofa), facing toward TV
  // Front wall is at z=3.5, panel sits in front of monitor at z=3.3
  reviewPanelEntity.object3D.position.set(1, 1.5, 3.35);
  reviewPanelEntity.object3D.rotateY(Math.PI/1); // Face toward TV (negative z)
  reviewPanelEntity.object3D.visible = true; // Always visible

  // Toggle panel visibility based on XR state
  world.visibilityState.subscribe((visibilityState) => {
    const inXR = visibilityState !== VisibilityState.NonImmersive;
    welcomePanelEntity.object3D.visible = !inXR;
    ktvPanelEntity.object3D.visible = inXR;
  });

  // Listen for mic toggle event from panel
  scene.addEventListener('micToggle', (event) => {
    console.log('Mic toggle event:', event.micOn);
    if (event.micOn) {
      startMicrophoneInput();
    } else {
      stopMicrophoneInput();
    }
  });

  // Listen for video play event from panel
  scene.addEventListener('videoPlay', (event) => {
    console.log('Video play event:', event.video);
    playVideoOnTV(event.embedUrl, event.video?.title || 'Now Playing', event.video?.id);
  });

  // Listen for video stop event from panel
  scene.addEventListener('videoStop', () => {
    console.log('Video stop event');
    stopVideoOnTV();
  });

  // Listen for microphone grab events from MicrophoneSystem
  scene.addEventListener('micGrabbed', () => {
    console.log('Mic grabbed event - starting karaoke');
    startMicrophoneInput();
    resumeVideo();
  });

  scene.addEventListener('micReleased', () => {
    console.log('Mic released event - stopping karaoke');
    stopMicrophoneInput();
    pauseVideo();
  });

  world.registerSystem(PanelSystem);
  world.registerSystem(MicrophoneSystem);
  world.registerSystem(LightingSystem);
  world.registerSystem(RobotSystem);
});

// ============ Room Creation Functions ============
function createKTVRoom(world, roomWidth, roomHeight, roomDepth) {
  // Floor with carpet texture
  const carpetTexture = createCarpetTexture();
  carpetTexture.repeat.set(4, 3);
  const floor = new Mesh(
    new PlaneGeometry(roomWidth, roomDepth),
    new MeshStandardMaterial({
      map: carpetTexture,
      roughness: 0.9,
      metalness: 0.0
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  world.createTransformEntity(floor).addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  // Walls with textured pattern
  const wallTexture = createWallTexture();
  wallTexture.repeat.set(2, 1.5);
  const wallMat = new MeshStandardMaterial({
    map: wallTexture,
    roughness: 0.7,
    metalness: 0.05
  });

  // Back wall (TV wall)
  const backWall = new Mesh(new PlaneGeometry(roomWidth, roomHeight), wallMat);
  backWall.position.set(0, roomHeight / 2, -roomDepth / 2);
  backWall.receiveShadow = true;
  world.createTransformEntity(backWall).addComponent(LocomotionEnvironment, { type: EnvironmentType.OBSTACLE });

  // Side walls
  const leftWall = new Mesh(new PlaneGeometry(roomDepth, roomHeight), wallMat.clone());
  leftWall.position.set(-roomWidth / 2, roomHeight / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  world.createTransformEntity(leftWall).addComponent(LocomotionEnvironment, { type: EnvironmentType.OBSTACLE });

  const rightWall = new Mesh(new PlaneGeometry(roomDepth, roomHeight), wallMat.clone());
  rightWall.position.set(roomWidth / 2, roomHeight / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  world.createTransformEntity(rightWall).addComponent(LocomotionEnvironment, { type: EnvironmentType.OBSTACLE });

  // Front wall (behind sofa)
  const frontWall = new Mesh(new PlaneGeometry(roomWidth, roomHeight), wallMat.clone());
  frontWall.position.set(0, roomHeight / 2, roomDepth / 2);
  frontWall.rotation.y = Math.PI;
  frontWall.receiveShadow = true;
  world.createTransformEntity(frontWall).addComponent(LocomotionEnvironment, { type: EnvironmentType.OBSTACLE });

  // Ceiling with acoustic panel texture
  const acousticTexture = createAcousticTexture();
  acousticTexture.repeat.set(3, 2);
  const ceiling = new Mesh(
    new PlaneGeometry(roomWidth, roomDepth),
    new MeshStandardMaterial({
      map: acousticTexture,
      roughness: 0.95,
      metalness: 0.0
    })
  );
  ceiling.position.set(0, roomHeight, 0);
  ceiling.rotation.x = Math.PI / 2;
  world.createTransformEntity(ceiling);
}

function createTV(world) {
  tvGroup = new Group();

  // TV Frame - bigger size
  const frame = new Mesh(
    new BoxGeometry(4.0, 2.2, 0.1),
    new MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.15,
      metalness: 0.9
    })
  );
  frame.castShadow = true;
  tvGroup.add(frame);

  // TV Bezel
  const bezel = new Mesh(
    new BoxGeometry(3.8, 2.0, 0.02),
    new MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.1,
      metalness: 0.95
    })
  );
  bezel.position.z = 0.06;
  tvGroup.add(bezel);

  // TV Screen - will display video
  const screenMat = new MeshBasicMaterial({
    color: 0x111122,
    side: DoubleSide
  });
  const screen = new Mesh(new PlaneGeometry(3.6, 1.9), screenMat);
  screen.position.z = 0.08;
  tvGroup.add(screen);

  // Store reference for video playback
  tvScreenMesh = screen;

  // Create subtitle display canvas
  subtitleCanvas = document.createElement('canvas');
  subtitleCanvas.width = 1024;
  subtitleCanvas.height = 512;
  subtitleContext = subtitleCanvas.getContext('2d');

  // Subtitle texture and mesh (centered on TV screen)
  const subtitleTexture = new CanvasTexture(subtitleCanvas);
  const subtitleMat = new MeshBasicMaterial({
    map: subtitleTexture,
    transparent: true,
    side: DoubleSide
  });
  tvSubtitleMesh = new Mesh(new PlaneGeometry(3.4, 1.7), subtitleMat);
  // Position subtitle mesh in world space (TV is at 0, 1.6, -3.45)
  tvSubtitleMesh.position.set(0, 1.6, -3.45 + 0.12);
  tvSubtitleMesh.visible = false;
  // Don't add to tvGroup - will be added as separate interactable entity

  // Initialize subtitle canvas
  clearSubtitle();

  // Screen glow light - bigger
  const screenLight = new RectAreaLight(0x4444ff, 3, 3.6, 1.9);
  screenLight.position.z = 0.1;
  tvGroup.add(screenLight);

  tvGroup.position.set(0, 1.6, -3.45);
  world.createTransformEntity(tvGroup);
}

function createReviewMonitor(world) {
  const monitorGroup = new Group();

  // Portrait monitor frame (taller than wide)
  const frame = new Mesh(
    new BoxGeometry(1.0, 1.4, 0.08),
    new MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.15,
      metalness: 0.9
    })
  );
  frame.castShadow = true;
  monitorGroup.add(frame);

  // Monitor bezel (inner frame)
  const bezel = new Mesh(
    new BoxGeometry(0.9, 1.3, 0.03),
    new MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.1,
      metalness: 0.95
    })
  );
  bezel.position.z = 0.04;
  monitorGroup.add(bezel);

  // No screen mesh - the review panel UI will be displayed in front
  // This avoids z-fighting issues

  // Neon accent strip at bottom
  const neonStrip = new Mesh(
    new BoxGeometry(0.9, 0.02, 0.02),
    new MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 })
  );
  neonStrip.position.set(0, -0.68, 0.04);
  monitorGroup.add(neonStrip);

  // Create text label using canvas texture
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 128;
  const ctx = labelCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.roundRect(0, 0, 512, 128, 16);
  ctx.fill();
  ctx.font = 'bold 48px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#00ffff';
  ctx.fillText('📚 DECK REVIEW', 256, 64);

  const labelTexture = new CanvasTexture(labelCanvas);
  const labelMat = new MeshBasicMaterial({
    map: labelTexture,
    transparent: true,
    side: DoubleSide
  });
  const label = new Mesh(new PlaneGeometry(0.6, 0.15), labelMat);
  label.position.set(0, 0.85, 0.04); // Above the monitor
  monitorGroup.add(label);

  // Position on front wall (behind sofa), facing toward TV
  // Front wall is at z=3.5, monitor on wall at z=3.45
  monitorGroup.position.set(1, 1.5, 3.45);
  monitorGroup.rotation.y = Math.PI; // Face toward TV

  world.createTransformEntity(monitorGroup);
}

function createSofa(world) {
  const sofaGroup = new Group();
  const leatherTexture = createLeatherTexture();
  leatherTexture.repeat.set(2, 2);
  const sofaMat = new MeshStandardMaterial({
    map: leatherTexture,
    roughness: 0.6,
    metalness: 0.1
  });

  // Sofa base
  const sofaBase = new Mesh(new BoxGeometry(1.8, 0.35, 0.7), sofaMat);
  sofaBase.position.y = 0.175;
  sofaBase.castShadow = true;
  sofaGroup.add(sofaBase);

  // Sofa back
  const sofaBack = new Mesh(new BoxGeometry(1.8, 0.6, 0.15), sofaMat);
  sofaBack.position.set(0, 0.5, -0.28);
  sofaBack.castShadow = true;
  sofaGroup.add(sofaBack);

  // Armrests
  const armrestMat = sofaMat.clone();
  const leftArm = new Mesh(new BoxGeometry(0.15, 0.4, 0.7), armrestMat);
  leftArm.position.set(-0.83, 0.38, 0);
  leftArm.castShadow = true;
  sofaGroup.add(leftArm);

  const rightArm = new Mesh(new BoxGeometry(0.15, 0.4, 0.7), armrestMat);
  rightArm.position.set(0.83, 0.38, 0);
  rightArm.castShadow = true;
  sofaGroup.add(rightArm);

  // Cushions
  const cushionMat = new MeshStandardMaterial({
    map: leatherTexture,
    color: 0xcc2222,
    roughness: 0.7,
    metalness: 0.05
  });
  for (let i = -1; i <= 1; i += 2) {
    const cushion = new Mesh(new BoxGeometry(0.75, 0.12, 0.55), cushionMat);
    cushion.position.set(i * 0.4, 0.42, 0);
    cushion.castShadow = true;
    sofaGroup.add(cushion);
  }

  sofaGroup.position.set(0, 0, 0);
  sofaGroup.rotation.y = Math.PI;
  world.createTransformEntity(sofaGroup);
}

function createCoffeeTable(world) {
  const woodTexture = createWoodTexture();
  woodTexture.repeat.set(2, 1);
  const tableMat = new MeshStandardMaterial({
    map: woodTexture,
    roughness: 0.4,
    metalness: 0.1
  });

  const tableTop = new Mesh(new BoxGeometry(1.6, 0.06, 0.5), tableMat);
  tableTop.position.set(0, 0.4, -1);
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  world.createTransformEntity(tableTop);

  // Table legs
  const legMat = new MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.3,
    metalness: 0.8
  });
  const legGeom = new CylinderGeometry(0.025, 0.025, 0.35, 8);
  const legPositions = [
    [-0.7, 0.175, -1.2],
    [0.7, 0.175, -1.2],
    [-0.7, 0.175, -0.8],
    [0.7, 0.175, -0.8]
  ];
  legPositions.forEach((pos) => {
    const leg = new Mesh(legGeom, legMat);
    leg.position.set(...pos);
    leg.castShadow = true;
    world.createTransformEntity(leg);
  });
}

function createSpeaker(world, x, y, z, isLeft) {
  const speakerGroup = new Group();
  const neonColor = isLeft ? 0xff00ff : 0x00ffff;

  // Cabinet
  const cabinet = new Mesh(
    new BoxGeometry(0.35, 0.8, 0.3),
    new MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.1 })
  );
  cabinet.position.y = 0.4;
  cabinet.castShadow = true;
  speakerGroup.add(cabinet);

  // Grille
  const grille = new Mesh(
    new PlaneGeometry(0.3, 0.7),
    new MeshStandardMaterial({ color: 0x222222, roughness: 0.95, metalness: 0.0 })
  );
  grille.position.set(0, 0.4, 0.151);
  speakerGroup.add(grille);

  // Woofer
  const woofer = new Mesh(
    new CylinderGeometry(0.08, 0.1, 0.04, 32),
    new MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.6 })
  );
  woofer.rotation.x = Math.PI / 2;
  woofer.position.set(0, 0.28, 0.16);
  speakerGroup.add(woofer);

  // Tweeter
  const tweeter = new Mesh(
    new SphereGeometry(0.025, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.9 })
  );
  tweeter.rotation.x = -Math.PI / 2;
  tweeter.position.set(0, 0.58, 0.16);
  speakerGroup.add(tweeter);

  // LED indicator
  const led = new Mesh(
    new PlaneGeometry(0.02, 0.02),
    new MeshBasicMaterial({ color: 0x00ff00 })
  );
  led.position.set(0.12, 0.72, 0.151);
  speakerGroup.add(led);

  // Neon ring at bottom
  const neonRing = new Mesh(
    new TorusGeometry(0.2, 0.015, 8, 32),
    new MeshBasicMaterial({ color: neonColor, transparent: true, opacity: 0.9 })
  );
  neonRing.rotation.x = Math.PI / 2;
  neonRing.position.set(0, 0.01, 0);
  speakerGroup.add(neonRing);

  // Vertical neon strips
  const neonStripGeom = new CylinderGeometry(0.01, 0.01, 0.75, 8);
  const neonStripMat = new MeshBasicMaterial({ color: neonColor, transparent: true, opacity: 0.9 });
  const leftStrip = new Mesh(neonStripGeom, neonStripMat);
  leftStrip.position.set(-0.18, 0.4, 0.16);
  speakerGroup.add(leftStrip);

  const rightStrip = new Mesh(neonStripGeom, neonStripMat);
  rightStrip.position.set(0.18, 0.4, 0.16);
  speakerGroup.add(rightStrip);

  // Neon glow light
  const neonLight = new PointLight(neonColor, 1.0, 2);
  neonLight.position.set(0, 0.4, 0.4);
  speakerGroup.add(neonLight);

  speakerGroup.position.set(x, y, z);
  world.createTransformEntity(speakerGroup);
}

function createSpeakers(world) {
  // Speakers in the front corners (near TV wall)
  createSpeaker(world, -2.7, 0, -3.2, true);
  createSpeaker(world, 2.7, 0, -3.2, false);
}

function createDiscoBall(world) {
  const ballGroup = new Group();

  // Main sphere
  const sphere = new Mesh(
    new SphereGeometry(0.3, 32, 32),
    new MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.1,
      metalness: 1
    })
  );
  ballGroup.add(sphere);

  // Mirror tiles
  const tileGeom = new PlaneGeometry(0.04, 0.04);
  const tileMat = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0,
    metalness: 1
  });

  for (let i = 0; i < 200; i++) {
    const tile = new Mesh(tileGeom, tileMat);
    const phi = Math.acos(-1 + (2 * i) / 200);
    const theta = Math.sqrt(200 * Math.PI) * phi;
    tile.position.setFromSphericalCoords(0.31, phi, theta);
    tile.lookAt(0, 0, 0);
    ballGroup.add(tile);
  }

  // Hanging wire
  const wire = new Mesh(
    new CylinderGeometry(0.005, 0.005, 0.5, 8),
    new MeshBasicMaterial({ color: 0x333333 })
  );
  wire.position.y = 0.55;
  ballGroup.add(wire);

  ballGroup.position.set(0, 3.0, -0.5);
  // Add DiscoBall component for rotation animation
  world.createTransformEntity(ballGroup).addComponent(DiscoBall);
}

function createLighting(world) {
  // Ambient light
  const ambient = new AmbientLight(0x111122, 0.4);
  world.createTransformEntity(ambient);
  sceneLights.push(ambient);

  // Main spotlight
  const mainSpot = new SpotLight(0xffffff, 30);
  mainSpot.position.set(0, 3.1, -0.5);
  mainSpot.angle = Math.PI / 4;
  mainSpot.penumbra = 0.5;
  mainSpot.decay = 2;
  mainSpot.castShadow = true;
  world.createTransformEntity(mainSpot);
  sceneLights.push(mainSpot);

  // Colored disco spotlights
  const colors = [0xff0066, 0x00ff66, 0x6600ff, 0xffff00];
  const positions = [
    [-1.8, 3.1, -2],
    [1.8, 3.1, -2],
    [-1.8, 3.1, 1.5],
    [1.8, 3.1, 1.5]
  ];

  positions.forEach((pos, i) => {
    // Light fixture housing
    const fixtureGroup = new Group();

    const housing = new Mesh(
      new CylinderGeometry(0.08, 0.1, 0.12, 16),
      new MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.8 })
    );
    fixtureGroup.add(housing);

    // Lens
    const lens = new Mesh(
      new SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new MeshBasicMaterial({ color: colors[i], transparent: true, opacity: 0.9 })
    );
    lens.rotation.x = Math.PI;
    lens.position.y = -0.06;
    fixtureGroup.add(lens);

    // Neon ring around fixture
    const neonRing = new Mesh(
      new TorusGeometry(0.1, 0.012, 8, 32),
      new MeshBasicMaterial({ color: colors[i], transparent: true, opacity: 0.9 })
    );
    neonRing.rotation.x = Math.PI / 2;
    neonRing.position.y = -0.06;
    fixtureGroup.add(neonRing);

    // Glow light
    const glowLight = new PointLight(colors[i], 0.5, 1);
    glowLight.position.y = -0.06;
    fixtureGroup.add(glowLight);

    fixtureGroup.position.set(...pos);
    world.createTransformEntity(fixtureGroup);

    // Spotlight from fixture - add AnimatedSpotlight component for animation
    const spot = new SpotLight(colors[i], 20);
    spot.position.set(pos[0], pos[1] - 0.1, pos[2]);
    spot.angle = Math.PI / 8;
    spot.penumbra = 0.3;
    spot.decay = 1.5;
    spot.castShadow = true;
    // Create target for spotlight sweeping
    spot.target.position.set(pos[0] * 0.5, 0, pos[2] * 0.5);
    world.scene.add(spot.target);
    world.createTransformEntity(spot).addComponent(AnimatedSpotlight);
    sceneLights.push(spot);
    sceneLights.push(glowLight);
  });

  // Create disco floor lights for party mode (simulating disco ball reflections)
  const beamColors = [0xff00ff, 0x00ffff, 0xff0066, 0x00ff66, 0xffff00, 0xff6600, 0xff0000, 0x0000ff];
  beamColors.forEach((color, i) => {
    const floorLight = new PointLight(color, 2, 4);
    floorLight.position.set(0, 0.1, 0); // Start at center, will be animated
    world.createTransformEntity(floorLight).addComponent(DiscoFloorLight);
    sceneLights.push(floorLight);
  });
}

function createNeonStrips(world, roomWidth, roomDepth) {
  const addNeonStrip = (x, y, z, length, color, horizontal = false) => {
    const geom = horizontal
      ? new BoxGeometry(length, 0.05, 0.05)
      : new BoxGeometry(0.05, 0.05, length);
    const mat = new MeshBasicMaterial({ color });
    const strip = new Mesh(geom, mat);
    strip.position.set(x, y, z);
    world.createTransformEntity(strip);

    // Glow light
    const light = new PointLight(color, 0.5, 3);
    light.position.set(x, y, z);
    world.createTransformEntity(light);
    sceneLights.push(light);
  };

  addNeonStrip(-roomWidth / 2 + 0.1, 0.1, 0, roomDepth, 0xff00ff);
  addNeonStrip(roomWidth / 2 - 0.1, 0.1, 0, roomDepth, 0x00ffff);
  addNeonStrip(0, 0.1, -roomDepth / 2 + 0.1, roomWidth, 0xff00ff, true);
}

// Light switch state
let lightsOn = true;

function createLightSwitch(world) {
  const switchGroup = new Group();

  // Wall plate (backplate) - 2.5x bigger
  const plateMat = new MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.4,
    metalness: 0.6
  });
  const plate = new Mesh(new BoxGeometry(0.3, 0.45, 0.04), plateMat);
  switchGroup.add(plate);

  // Switch toggle (the actual switch) - 2.5x bigger
  const toggleMat = new MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 0.3,
    metalness: 0.4
  });
  const toggle = new Mesh(new BoxGeometry(0.15, 0.2, 0.06), toggleMat);
  toggle.position.set(0, 0.05, 0.04);
  toggle.rotation.x = -0.3; // Tilted up (on position)
  toggle.name = 'switchToggle';
  switchGroup.add(toggle);

  // Indicator LED - 2.5x bigger
  const ledMat = new MeshBasicMaterial({ color: 0x00ff00 });
  const led = new Mesh(new CylinderGeometry(0.02, 0.02, 0.01, 8), ledMat);
  led.rotation.x = Math.PI / 2;
  led.position.set(0, -0.15, 0.03);
  led.name = 'switchLED';
  switchGroup.add(led);

  // Glow light for the LED - stronger
  const ledLight = new PointLight(0x00ff00, 0.5, 1);
  ledLight.position.set(0, -0.15, 0.1);
  ledLight.name = 'switchLEDLight';
  switchGroup.add(ledLight);

  // Create text label using canvas texture - bigger and bolder
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 128;
  const ctx = labelCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.roundRect(0, 0, 512, 128, 16);
  ctx.fill();
  ctx.font = 'bold 56px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#00ffff';
  ctx.fillText('💡 LIGHTS', 256, 64);

  const labelTexture = new CanvasTexture(labelCanvas);
  const labelMat = new MeshBasicMaterial({
    map: labelTexture,
    transparent: true,
    side: DoubleSide
  });
  const label = new Mesh(new PlaneGeometry(0.5, 0.12), labelMat);
  label.position.set(0, 0.35, 0.03); // Above the switch
  switchGroup.add(label);

  // Position on the right wall, beside the sofa (sofa is at z:0, right wall at x:3)
  switchGroup.position.set(2.95, 1.3, 0.3);
  // Face left (into the room from right wall)
  switchGroup.rotation.y = -Math.PI / 2;

  // Make it interactive
  const switchEntity = world.createTransformEntity(switchGroup).addComponent(Interactable);

  // Add click handler
  switchGroup.addEventListener('pointerdown', () => {
    lightsOn = !lightsOn;

    // Animate toggle
    const toggleMesh = switchGroup.getObjectByName('switchToggle');
    if (toggleMesh) {
      toggleMesh.rotation.x = lightsOn ? -0.3 : 0.3; // Tilt up/down
    }

    // Update LED color
    const ledMesh = switchGroup.getObjectByName('switchLED');
    const ledLightObj = switchGroup.getObjectByName('switchLEDLight');
    if (ledMesh) {
      ledMesh.material.color.setHex(lightsOn ? 0x00ff00 : 0xff0000);
    }
    if (ledLightObj) {
      ledLightObj.color.setHex(lightsOn ? 0x00ff00 : 0xff0000);
    }

    // Update party mode in lighting system
    setPartyMode(lightsOn);

    // Dispatch event for other systems
    world.scene.dispatchEvent({ type: 'lightsToggle', lightsOn });

    // Update scene lights intensity
    sceneLights.forEach((light) => {
      if (light.userData.originalIntensity === undefined) {
        light.userData.originalIntensity = light.intensity;
      }
      light.intensity = lightsOn
        ? light.userData.originalIntensity
        : light.userData.originalIntensity * 0.1;
    });

    console.log('Light switch toggled:', lightsOn ? 'ON' : 'OFF');
  });

  return switchEntity;
}

function createBar(world) {
  const barGroup = new Group();
  const woodTexture = createWoodTexture();
  woodTexture.repeat.set(2, 1);

  // Bar counter material
  const barMat = new MeshStandardMaterial({
    map: woodTexture,
    roughness: 0.4,
    metalness: 0.1
  });

  // Bar counter top
  const counterTop = new Mesh(new BoxGeometry(1.8, 0.08, 0.7), barMat);
  counterTop.position.y = 1.1;
  counterTop.castShadow = true;
  counterTop.receiveShadow = true;
  barGroup.add(counterTop);

  // Bar front panel
  const frontPanel = new Mesh(new BoxGeometry(1.8, 1.0, 0.08), barMat);
  frontPanel.position.set(0, 0.55, 0.31);
  frontPanel.castShadow = true;
  barGroup.add(frontPanel);

  // Bar back panel (shorter, for shelves)
  const backPanel = new Mesh(new BoxGeometry(1.8, 0.6, 0.08), barMat);
  backPanel.position.set(0, 0.35, -0.31);
  backPanel.castShadow = true;
  barGroup.add(backPanel);

  // Side panels
  const sideMat = barMat.clone();
  const leftSide = new Mesh(new BoxGeometry(0.08, 1.0, 0.7), sideMat);
  leftSide.position.set(-0.86, 0.55, 0);
  leftSide.castShadow = true;
  barGroup.add(leftSide);

  const rightSide = new Mesh(new BoxGeometry(0.08, 1.0, 0.7), sideMat);
  rightSide.position.set(0.86, 0.55, 0);
  rightSide.castShadow = true;
  barGroup.add(rightSide);

  // Shelf inside bar
  const shelf = new Mesh(new BoxGeometry(1.64, 0.04, 0.54), barMat);
  shelf.position.set(0, 0.5, 0);
  barGroup.add(shelf);

  // Neon strip under counter (front)
  const neonStrip = new Mesh(
    new BoxGeometry(1.6, 0.03, 0.03),
    new MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.9 })
  );
  neonStrip.position.set(0, 0.05, 0.35);
  barGroup.add(neonStrip);

  // Neon glow light
  const neonLight = new PointLight(0xff00ff, 1.5, 2);
  neonLight.position.set(0, 0.1, 0.5);
  barGroup.add(neonLight);
  sceneLights.push(neonLight);

  // Bar stools (2 stools in front of bar)
  const stoolMat = new MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.3,
    metalness: 0.8
  });
  const seatMat = new MeshStandardMaterial({
    color: 0x8b0000,
    roughness: 0.6,
    metalness: 0.1
  });

  [-0.5, 0.5].forEach((xOffset) => {
    // Stool leg
    const leg = new Mesh(new CylinderGeometry(0.03, 0.04, 0.7, 16), stoolMat);
    leg.position.set(xOffset, 0.35, 0.7);
    leg.castShadow = true;
    barGroup.add(leg);

    // Stool seat
    const seat = new Mesh(new CylinderGeometry(0.18, 0.15, 0.08, 24), seatMat);
    seat.position.set(xOffset, 0.74, 0.7);
    seat.castShadow = true;
    barGroup.add(seat);

    // Footrest ring
    const footrest = new Mesh(
      new TorusGeometry(0.12, 0.015, 8, 24),
      stoolMat
    );
    footrest.rotation.x = Math.PI / 2;
    footrest.position.set(xOffset, 0.25, 0.7);
    barGroup.add(footrest);
  });

  // Position bar in left back corner (behind sofa area)
  // Room: x from -3 to 3, z from -3.5 to 3.5
  // Place against left wall, near front wall
  barGroup.position.set(-2.2, 0, 2.8);
  barGroup.rotation.y = Math.PI / 2; // Face right (into the room)

  world.createTransformEntity(barGroup);
}

// Chat bubble state
let chatBubbleCanvas = null;
let chatBubbleContext = null;
let chatBubbleTexture = null;

function updateChatBubbleText(text) {
  if (!chatBubbleContext || !chatBubbleCanvas || !chatBubbleTexture) return;

  const ctx = chatBubbleContext;
  const canvas = chatBubbleCanvas;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw bubble background
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 38, 15);
  ctx.fill();

  // Draw bubble tail
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, canvas.height - 28);
  ctx.lineTo(canvas.width / 2 - 20, canvas.height - 10);
  ctx.lineTo(canvas.width / 2 + 20, canvas.height - 28);
  ctx.closePath();
  ctx.fill();

  // Adaptive font size based on text length
  let fontSize = 24;
  let maxLines = 4;
  if (text.length > 80) {
    fontSize = 20;
    maxLines = 5;
  }
  if (text.length > 120) {
    fontSize = 18;
    maxLines = 6;
  }

  // Draw text with word wrap
  ctx.fillStyle = '#333333';
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word wrap with character-level fallback for long words
  const maxWidth = canvas.width - 40;
  const lineHeight = fontSize + 4;
  const words = text.split(' ');
  let lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      // Check if single word is too long
      if (ctx.measureText(word).width > maxWidth) {
        // Break long word
        let remaining = word;
        while (remaining.length > 0) {
          let fit = '';
          for (let i = 1; i <= remaining.length; i++) {
            if (ctx.measureText(remaining.substring(0, i)).width <= maxWidth) {
              fit = remaining.substring(0, i);
            } else break;
          }
          if (fit.length === 0) fit = remaining.substring(0, 1);
          lines.push(fit);
          remaining = remaining.substring(fit.length);
        }
        currentLine = '';
      } else {
        currentLine = word;
      }
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Limit lines and add ellipsis
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const lastLine = lines[maxLines - 1];
    if (lastLine.length > 3) {
      lines[maxLines - 1] = lastLine.substring(0, lastLine.length - 3) + '...';
    }
  }

  // Draw lines centered
  const totalHeight = lines.length * lineHeight;
  const startY = (canvas.height - 38) / 2 + 10 - totalHeight / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, startY + i * lineHeight);
  });

  // Update texture
  chatBubbleTexture.needsUpdate = true;
}

function createBarRobot(world) {
  const { scene: robotMesh } = AssetManager.getGLTF('robot');

  // Position robot above the bar counter
  // Bar is at position (-2.2, 0, 2.8) with counter top at y:1.1
  robotMesh.position.set(-2.2, 1.5, 2.8);
  robotMesh.scale.setScalar(0.4);

  // Create robot entity with Robot component so it looks at player
  world
    .createTransformEntity(robotMesh)
    .addComponent(Interactable)
    .addComponent(Robot);

  // Add chat bubble above robot
  const bubbleGroup = new Group();

  // Create chat bubble canvas texture (larger for more text)
  chatBubbleCanvas = document.createElement('canvas');
  chatBubbleCanvas.width = 512;
  chatBubbleCanvas.height = 280;
  chatBubbleContext = chatBubbleCanvas.getContext('2d');

  chatBubbleTexture = new CanvasTexture(chatBubbleCanvas);
  
  // Initial bubble text (must be after texture is created)
  updateChatBubbleText(getGreeting());

  const bubbleMat = new MeshBasicMaterial({
    map: chatBubbleTexture,
    transparent: true,
    side: DoubleSide
  });

  const bubbleMesh = new Mesh(new PlaneGeometry(0.8, 0.32), bubbleMat);
  bubbleGroup.add(bubbleMesh);

  // Position bubble above robot's head (robot is at y:1.5)
  bubbleGroup.position.set(-2.2, 1.9, 2.8);
  // Add ChatBubble component so it tracks and faces the player
  world.createTransformEntity(bubbleGroup).addComponent(ChatBubble);

  // Listen for chat bubble update events
  world.scene.addEventListener('updateChatBubble', (event) => {
    if (event.text) {
      updateChatBubbleText(event.text);
    }
  });

  // Set up callback for robot.js to update bubble
  setUpdateBubbleCallback((text) => {
    updateChatBubbleText(text);
  });

  // Create mic button beside robot
  const micButtonGroup = new Group();

  // Create mic button canvas
  const micCanvas = document.createElement('canvas');
  micCanvas.width = 128;
  micCanvas.height = 128;
  const micCtx = micCanvas.getContext('2d');

  // Initial draw
  const micTexture = new CanvasTexture(micCanvas);
  const micMat = new MeshBasicMaterial({
    map: micTexture,
    transparent: true,
    side: DoubleSide
  });

  const micMesh = new Mesh(new PlaneGeometry(0.2, 0.2), micMat);
  micButtonGroup.add(micMesh);

  // Position mic button on the robot (slightly in front)
  micButtonGroup.position.set(-2.2, 1.35, 2.65);

  // Initialize mic button
  initMicButton(micMesh, micCanvas, micCtx, micTexture);

  // Add MicButton component for tracking and click handling
  world
    .createTransformEntity(micButtonGroup)
    .addComponent(Interactable)
    .addComponent(MicButton);

  // Add a small spotlight on the robot
  const robotSpot = new SpotLight(0x00ffff, 5);
  robotSpot.position.set(-2.2, 2.8, 2.8);
  robotSpot.angle = Math.PI / 6;
  robotSpot.penumbra = 0.5;
  robotSpot.decay = 2;
  robotSpot.target.position.set(-2.2, 1.5, 2.8);
  world.scene.add(robotSpot.target);
  world.createTransformEntity(robotSpot);
  sceneLights.push(robotSpot);
}



// ============ Video Overlay Functions ============

function setupVideoOverlay() {
  // Create overlay container - positioned at bottom center between controllers
  const overlay = document.createElement('div');
  overlay.id = 'video-overlay';
  overlay.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 28%;
    max-width: 320px;
    aspect-ratio: 16/9;
    background: #000;
    display: none;
    flex-direction: column;
    z-index: 1000;
    border: 2px solid #222;
    border-radius: 4px;
    box-shadow: 0 0 20px rgba(100, 100, 255, 0.3);
  `;

  // YouTube iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'youtube-player';
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 4px;
  `;
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  overlay.appendChild(iframe);

  // Title bar at bottom
  const titleBar = document.createElement('div');
  titleBar.id = 'video-title';
  titleBar.style.cssText = `
    position: absolute;
    bottom: -40px;
    left: 0;
    right: 0;
    color: white;
    font-size: 14px;
    padding: 10px;
    text-align: center;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 4px;
  `;
  overlay.appendChild(titleBar);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.id = 'close-video-btn';
  closeBtn.textContent = '×';
  closeBtn.style.cssText = `
    position: absolute;
    top: -15px;
    right: -15px;
    background: #ff4444;
    color: white;
    border: none;
    width: 30px;
    height: 30px;
    font-size: 16px;
    cursor: pointer;
    border-radius: 50%;
    z-index: 1001;
  `;
  closeBtn.addEventListener('click', stopVideoOnTV);
  overlay.appendChild(closeBtn);

  // Hint text when looking away
  const hint = document.createElement('div');
  hint.id = 'video-hint';
  hint.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    font-size: 14px;
    padding: 10px 20px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 20px;
    display: none;
    z-index: 999;
  `;
  hint.textContent = '♪ Video playing - look at TV to watch';
  document.body.appendChild(hint);

  document.body.appendChild(overlay);
  console.log('Video overlay setup complete');
}

async function playVideoOnTV(embedUrl, videoTitle = 'Now Playing', videoId = null) {
  console.log('playVideoOnTV called:', { embedUrl, videoTitle, videoId });

  isVideoPlaying = true;
  isVideoPaused = true; // Start paused until mic is grabbed
  currentVideoUrl = embedUrl;
  currentVideoTitle = videoTitle;
  totalPausedDuration = 0;
  videoPausedTime = 0;

  const iframe = document.getElementById('youtube-player');
  const title = document.getElementById('video-title');
  const hint = document.getElementById('video-hint');

  // Show the video overlay
  const overlay = document.getElementById('video-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }

  // Show title and loading state
  if (title) {
    title.textContent = videoTitle;
  }

  if (hint) {
    hint.style.display = 'block';
    hint.textContent = '♪ Grab the microphone to start singing!';
  }

  // Show subtitle mesh with loading message
  if (tvSubtitleMesh) {
    tvSubtitleMesh.visible = true;
  }
  updateSubtitle('⏳ Loading lyrics...', 1);

  // Fetch subtitles FIRST before loading video
  currentSubtitles = null;
  if (videoId) {
    console.log('Fetching subtitles for video:', videoId);

    try {
      const subtitles = await fetchYouTubeSubtitles(videoId);
      if (subtitles && subtitles.length > 0) {
        currentSubtitles = subtitles;
        console.log(`Loaded ${subtitles.length} subtitle entries`);
      }
    } catch (error) {
      console.warn('Failed to fetch subtitles:', error);
    }
  }

  // Load the video (paused - autoplay=0)
  if (iframe) {
    iframe.src = embedUrl;
  }

  // Show ready message - waiting for mic grab to start
  updateSubtitle('♪ Grab the mic to start singing!', 1);

  console.log('Video loaded (paused) - waiting for mic grab');
}

function stopVideoOnTV() {
  isVideoPlaying = false;
  isVideoPaused = false;
  currentVideoUrl = '';
  currentVideoTitle = '';
  subtitleStartTime = 0;
  totalPausedDuration = 0;
  videoPausedTime = 0;

  const overlay = document.getElementById('video-overlay');
  const iframe = document.getElementById('youtube-player');
  const hint = document.getElementById('video-hint');

  if (overlay) {
    overlay.style.display = 'none';
  }

  if (iframe) {
    iframe.src = '';
  }

  if (hint) {
    hint.style.display = 'none';
  }

  // Stop subtitles
  stopSubtitles();

  console.log('Stopped video');
}

// Track paused state for subtitle timing
let videoPausedTime = 0;
let totalPausedDuration = 0;
let isVideoPaused = false;

// Track current lyric for paused display
let pausedLyricText = '';
let pausedLyricProgress = 0;

function pauseVideo() {
  if (!isVideoPlaying || isVideoPaused) return;

  const iframe = document.getElementById('youtube-player');
  if (iframe && iframe.contentWindow) {
    // Send pause command to YouTube iframe
    iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
  }

  // Pause subtitles
  isVideoPaused = true;
  videoPausedTime = Date.now();

  if (lyricInterval) {
    clearInterval(lyricInterval);
    lyricInterval = null;
  }

  // Show paused lyric with note at bottom (if we have a lyric to show)
  if (pausedLyricText) {
    updateSubtitle(pausedLyricText, pausedLyricProgress, '♪ Grab the mic to continue');
  } else {
    updateSubtitle('♪ ♫ ♪', 1, '♪ Grab the mic to continue');
  }
  console.log('Video paused - waiting for mic');
}

function resumeVideo() {
  if (!isVideoPlaying || !isVideoPaused) return;

  const iframe = document.getElementById('youtube-player');
  if (iframe && iframe.contentWindow) {
    // Send play command to YouTube iframe
    iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
  }

  // Check if this is the first play or a resume
  const isFirstPlay = subtitleStartTime === 0;

  // Resume subtitles - adjust start time for paused duration
  if (videoPausedTime > 0 && !isFirstPlay) {
    totalPausedDuration += Date.now() - videoPausedTime;
    subtitleStartTime += Date.now() - videoPausedTime;
  }

  isVideoPaused = false;
  videoPausedTime = 0;

  // Update hint
  const hint = document.getElementById('video-hint');
  if (hint) {
    hint.textContent = '♪ Singing in progress...';
  }

  // Start or restart subtitles
  if (isFirstPlay) {
    // First play - start subtitles fresh
    startSubtitles(currentVideoTitle);
  } else {
    // Resume - restart subtitle interval
    if (currentSubtitles && currentSubtitles.length > 0) {
      startRealSubtitles();
    } else {
      startSampleLyrics();
    }
  }

  console.log('Video ' + (isFirstPlay ? 'started' : 'resumed') + ' - mic grabbed');
}

// ============ Subtitle/Lyrics Functions ============

// Sample karaoke lyrics for demo (in real app, fetch from lyrics API)
const sampleLyrics = [
  '♪ Get ready to sing along! ♪',
  '♪ ♫ ♪ ♫ ♪ ♫ ♪ ♫',
  'Follow the lyrics on screen...',
  'Sing your heart out!',
  '♫ Music brings us together ♫',
  'Let the rhythm guide you...',
  '♪ Every word, every note ♪',
  'Feel the music in your soul!',
  '♪ You are the star tonight! ♪',
  '♫ Keep singing, keep shining ♫'
];

function clearSubtitle() {
  if (!subtitleContext || !subtitleCanvas) return;

  subtitleContext.clearRect(0, 0, subtitleCanvas.width, subtitleCanvas.height);

  // Semi-transparent background
  subtitleContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
  subtitleContext.roundRect(10, 10, subtitleCanvas.width - 20, subtitleCanvas.height - 20, 15);
  subtitleContext.fill();
}

// Handle click on subtitle mesh to translate words
function handleSubtitleClick(event) {
  console.log('handleSubtitleClick called', event);
  if (!currentLyricText || !tvSubtitleMesh) {
    console.log('No lyric text or subtitle mesh');
    return;
  }

  // Get UV coordinates from the intersection
  // The event may have uv directly or in the intersection object
  let uv = event.uv;
  if (!uv && event.intersection) {
    uv = event.intersection.uv;
  }
  if (!uv && event.point) {
    // Calculate UV from world point if no UV provided
    // The subtitle mesh is a plane at position (0, 1.6, -3.33) with size 3.4 x 1.7
    const localPoint = event.point.clone();
    tvSubtitleMesh.worldToLocal(localPoint);
    uv = {
      x: (localPoint.x / 3.4) + 0.5,
      y: (localPoint.y / 1.7) + 0.5
    };
  }

  if (!uv) {
    console.log('No UV coordinates available, event:', event);
    // Fallback: show translation panel with instruction
    if (worldRef && worldRef.scene) {
      worldRef.scene.dispatchEvent({
        type: 'translateWord',
        word: 'Click a word',
        definition: 'Point directly at a word in the lyrics to translate it',
        loading: false
      });
    }
    return;
  }

  console.log('UV coordinates:', uv);

  // Convert UV to canvas coordinates
  const canvasX = uv.x * subtitleCanvas.width;
  const canvasY = (1 - uv.y) * subtitleCanvas.height; // Flip Y

  console.log('Canvas coordinates:', canvasX, canvasY);

  // Find which word was clicked
  const clickedWord = findWordAtPosition(canvasX, canvasY);
  if (clickedWord) {
    console.log('Clicked word:', clickedWord);
    translateWord(clickedWord);
  } else {
    console.log('No word found at position');
  }
}

// Find word at canvas position
function findWordAtPosition(x, y) {
  for (const wordInfo of currentLyricWords) {
    if (
      x >= wordInfo.x &&
      x <= wordInfo.x + wordInfo.width &&
      y >= wordInfo.y - wordInfo.height / 2 &&
      y <= wordInfo.y + wordInfo.height / 2
    ) {
      return wordInfo.word;
    }
  }
  return null;
}

// Translate a word using MyMemory Translation API
async function translateWord(word) {
  // Clean the word (remove emojis, punctuation)
  const cleanWord = word.replace(/[^\w\s'-]/g, '').trim();
  if (!cleanWord) return;

  const { nativeLanguage, targetLanguage } = languageSettings;

  // Show translation panel
  if (translationPanelEntity) {
    translationPanelEntity.object3D.visible = true;
  }

  // Dispatch event to update panel using worldRef
  if (worldRef && worldRef.scene) {
    worldRef.scene.dispatchEvent({
      type: 'translateWord',
      word: cleanWord,
      loading: true
    });
  }

  try {
    // Translate from target language to native language using MyMemory API
    const langPair = `${targetLanguage}|${nativeLanguage}`;
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanWord)}&langpair=${langPair}`
    );

    if (response.ok) {
      const data = await response.json();
      const translation = data.responseData?.translatedText || cleanWord;
      const match = data.responseData?.match || 0;

      // Also try to get English definition if native language is English
      let definition = '';
      let phonetic = '';

      if (nativeLanguage === 'en') {
        try {
          const dictResponse = await fetch(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(translation.toLowerCase())}`
          );
          if (dictResponse.ok) {
            const dictData = await dictResponse.json();
            const entry = dictData[0];
            phonetic = entry.phonetic || entry.phonetics?.[0]?.text || '';
            const meaning = entry.meanings?.[0];
            definition = meaning?.definitions?.[0]?.definition || '';
          }
        } catch (e) {
          // Dictionary lookup failed, continue without definition
        }
      }

      // Dispatch translation result
      if (worldRef && worldRef.scene) {
        worldRef.scene.dispatchEvent({
          type: 'translateWord',
          word: cleanWord,
          translation: translation,
          phonetic: phonetic,
          definition: definition || '-',
          loading: false
        });
      }
    } else {
      throw new Error('Translation failed');
    }
  } catch (error) {
    console.warn('Translation failed:', error);
    // Show error in panel
    if (worldRef && worldRef.scene) {
      worldRef.scene.dispatchEvent({
        type: 'translateWord',
        word: cleanWord,
        translation: cleanWord,
        definition: 'Translation not available',
        loading: false
      });
    }
  }
}

// Helper function to wrap text into multiple lines
function wrapText(context, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
    const metrics = context.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

function updateSubtitle(text, highlightProgress = 0, bottomNote = null) {
  if (!subtitleContext || !subtitleCanvas) return;

  clearSubtitle();

  // Store current lyric text for click detection
  currentLyricText = text;
  currentLyricWords = [];

  // Draw subtitle text with wrapping - BIGGER font
  subtitleContext.font = 'bold 56px Arial, sans-serif';
  subtitleContext.textAlign = 'center';
  subtitleContext.textBaseline = 'middle';

  const centerX = subtitleCanvas.width / 2;
  const maxWidth = subtitleCanvas.width - 60; // Padding on sides
  const lineHeight = 65;

  // Wrap text into multiple lines
  const lines = wrapText(subtitleContext, text, maxWidth);
  
  // Calculate starting Y position to center all lines vertically
  // If there's a bottom note, shift lyrics up a bit
  const totalHeight = lines.length * lineHeight;
  const verticalOffset = bottomNote ? -30 : 0;
  const startY = (subtitleCanvas.height - totalHeight) / 2 + lineHeight / 2 + verticalOffset;

  // Draw each line and track word positions
  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    const lineWidth = subtitleContext.measureText(line).width;
    const lineStartX = centerX - lineWidth / 2;
    
    // Track word positions for click detection
    const words = line.split(' ');
    let wordX = lineStartX;
    words.forEach((word) => {
      const wordWidth = subtitleContext.measureText(word + ' ').width;
      currentLyricWords.push({
        word: word,
        x: wordX,
        y: y,
        width: wordWidth,
        height: lineHeight
      });
      wordX += wordWidth;
    });
    
    // Draw text shadow
    subtitleContext.fillStyle = 'rgba(0, 0, 0, 0.8)';
    subtitleContext.fillText(line, centerX + 3, y + 3);

    // Calculate highlight progress for this line
    const totalChars = text.length;
    const charsBeforeLine = lines.slice(0, index).join(' ').length + (index > 0 ? index : 0); // Account for spaces
    const lineChars = line.length;
    const lineStartProgress = charsBeforeLine / totalChars;
    const lineEndProgress = (charsBeforeLine + lineChars) / totalChars;
    
    // Calculate how much of this line should be highlighted
    let lineHighlight = 0;
    if (highlightProgress > lineStartProgress) {
      if (highlightProgress >= lineEndProgress) {
        lineHighlight = 1;
      } else {
        lineHighlight = (highlightProgress - lineStartProgress) / (lineEndProgress - lineStartProgress);
      }
    }

    // Draw highlighted portion (karaoke effect)
    if (lineHighlight > 0) {
      subtitleContext.save();
      subtitleContext.beginPath();
      const textWidth = subtitleContext.measureText(line).width;
      const highlightWidth = textWidth * lineHighlight;
      subtitleContext.rect(centerX - textWidth / 2, y - lineHeight / 2, highlightWidth, lineHeight);
      subtitleContext.clip();
      subtitleContext.fillStyle = '#00ffff';
      subtitleContext.fillText(line, centerX, y);
      subtitleContext.restore();
    }

    // Draw remaining text in white
    subtitleContext.save();
    subtitleContext.beginPath();
    const textWidth = subtitleContext.measureText(line).width;
    const highlightWidth = textWidth * lineHighlight;
    subtitleContext.rect(centerX - textWidth / 2 + highlightWidth, y - lineHeight / 2, textWidth - highlightWidth, lineHeight);
    subtitleContext.clip();
    subtitleContext.fillStyle = '#ffffff';
    subtitleContext.fillText(line, centerX, y);
    subtitleContext.restore();
  });

  // Draw bottom note if provided
  if (bottomNote) {
    subtitleContext.font = 'bold 24px Arial, sans-serif';
    subtitleContext.fillStyle = 'rgba(0, 0, 0, 0.8)';
    subtitleContext.fillText(bottomNote, centerX + 2, subtitleCanvas.height - 50 + 2);
    subtitleContext.fillStyle = '#ffcc00';
    subtitleContext.fillText(bottomNote, centerX, subtitleCanvas.height - 50);
  }

  // Update texture
  if (tvSubtitleMesh && tvSubtitleMesh.material.map) {
    tvSubtitleMesh.material.map.needsUpdate = true;
  }
}

function startSubtitles(songTitle) {
  // Show subtitle mesh
  if (tvSubtitleMesh) {
    tvSubtitleMesh.visible = true;
  }

  currentLyricIndex = 0;

  // Clear any existing interval
  if (lyricInterval) {
    clearInterval(lyricInterval);
  }

  // Record start time NOW - video iframe was just set
  subtitleStartTime = Date.now();

  // Show song title briefly then start synced subtitles
  updateSubtitle(`♪ ${songTitle} ♪`, 1);

  // Start subtitles after brief title display
  // Video takes ~1-2s to start after iframe.src is set
  setTimeout(() => {
    // Reset start time to sync with actual video playback
    subtitleStartTime = Date.now();

    if (currentSubtitles && currentSubtitles.length > 0) {
      // Use real YouTube subtitles
      startRealSubtitles();
    } else {
      // Fall back to sample lyrics
      startSampleLyrics();
    }
  }, 1500); // Longer delay for video to start playing
}

function startRealSubtitles() {
  currentLyricIndex = 0;

  // Offset to sync with video (negative = delay subtitles, positive = advance subtitles)
  const syncOffset = -0.5; // seconds - delay subtitles by 0.5s to match YouTube playback

  lyricInterval = setInterval(() => {
    if (!isVideoPlaying || !currentSubtitles) {
      stopSubtitles();
      return;
    }

    // Calculate elapsed time in seconds with sync offset
    const elapsedTime = (Date.now() - subtitleStartTime) / 1000 + syncOffset;

    // Find the current subtitle based on time
    let currentSub = null;
    let nextSubIndex = -1;

    for (let i = 0; i < currentSubtitles.length; i++) {
      const sub = currentSubtitles[i];
      if (elapsedTime >= sub.start && elapsedTime < sub.end) {
        currentSub = sub;
        nextSubIndex = i;
        break;
      }
    }

    if (currentSub) {
      // Calculate highlight progress within this subtitle
      const subProgress = (elapsedTime - currentSub.start) / currentSub.dur;
      const progress = Math.min(subProgress, 1);
      updateSubtitle(currentSub.text, progress);
      currentLyricIndex = nextSubIndex;
      // Track for paused display
      pausedLyricText = currentSub.text;
      pausedLyricProgress = progress;
    } else if (elapsedTime > 0 && currentLyricIndex < currentSubtitles.length) {
      // Between subtitles - show waiting indicator
      updateSubtitle('♪ ♫ ♪', 1);
      pausedLyricText = '♪ ♫ ♪';
      pausedLyricProgress = 1;
    }
  }, 50); // Update every 50ms for smoother sync
}

function startSampleLyrics() {
  let highlightProgress = 0;

  lyricInterval = setInterval(() => {
    if (!isVideoPlaying) {
      stopSubtitles();
      return;
    }

    // Animate highlight progress
    highlightProgress += 0.05;

    if (highlightProgress >= 1) {
      // Move to next lyric
      highlightProgress = 0;
      currentLyricIndex = (currentLyricIndex + 1) % sampleLyrics.length;
    }

    updateSubtitle(sampleLyrics[currentLyricIndex], highlightProgress);
    // Track for paused display
    pausedLyricText = sampleLyrics[currentLyricIndex];
    pausedLyricProgress = highlightProgress;
  }, 150); // Update every 150ms for smooth animation
}

function stopSubtitles() {
  if (lyricInterval) {
    clearInterval(lyricInterval);
    lyricInterval = null;
  }

  // Hide subtitle mesh
  if (tvSubtitleMesh) {
    tvSubtitleMesh.visible = false;
  }

  clearSubtitle();
}

// ============ Karaoke Microphone Functions ============

// Create impulse response for realistic room reverb
function createReverbImpulse(duration, decay, reverse) {
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * duration;
  const impulse = audioContext.createBuffer(2, length, sampleRate);
  const leftChannel = impulse.getChannelData(0);
  const rightChannel = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = reverse ? length - i : i;
    const envelope = Math.pow(1 - n / length, decay);
    leftChannel[i] = (Math.random() * 2 - 1) * envelope;
    rightChannel[i] = (Math.random() * 2 - 1) * envelope;
  }
  return impulse;
}

function startMicrophoneInput() {
  if (micActive) return; // Already active

  navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  })
    .then(stream => {
      micStream = stream;
      micActive = true;
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      microphoneStream = audioContext.createMediaStreamSource(stream);

      // Master output gain - BOOSTED for louder mic
      gainNode = audioContext.createGain();
      gainNode.gain.value = 3.0;

      // Compressor for smoother vocals
      compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // EQ - boost presence for vocals
      const highShelf = audioContext.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 3000;
      highShelf.gain.value = 3;

      const lowCut = audioContext.createBiquadFilter();
      lowCut.type = 'highpass';
      lowCut.frequency.value = 80;

      // Convolution reverb for realistic room sound
      convolverNode = audioContext.createConvolver();
      convolverNode.buffer = createReverbImpulse(2.5, 2.5, false);

      // Multiple delays for rich echo effect
      const delay1 = audioContext.createDelay(1.0);
      delay1.delayTime.value = 0.12;

      const delay2 = audioContext.createDelay(1.0);
      delay2.delayTime.value = 0.24;

      const delay3 = audioContext.createDelay(1.0);
      delay3.delayTime.value = 0.37;

      // Feedback for delays
      const feedback1 = audioContext.createGain();
      feedback1.gain.value = 0.35;

      const feedback2 = audioContext.createGain();
      feedback2.gain.value = 0.25;

      const feedback3 = audioContext.createGain();
      feedback3.gain.value = 0.15;

      // Mix controls
      const dryGain = audioContext.createGain();
      dryGain.gain.value = 0.7;

      const reverbGain = audioContext.createGain();
      reverbGain.gain.value = 0.4;

      const delayMix = audioContext.createGain();
      delayMix.gain.value = 0.35;

      // Connect for visualization
      microphoneStream.connect(analyser);

      // Signal chain: mic -> lowCut -> highShelf -> compressor
      microphoneStream.connect(lowCut);
      lowCut.connect(highShelf);
      highShelf.connect(compressor);

      // Dry path
      compressor.connect(dryGain);
      dryGain.connect(gainNode);

      // Reverb path
      compressor.connect(convolverNode);
      convolverNode.connect(reverbGain);
      reverbGain.connect(gainNode);

      // Multi-tap delay path
      compressor.connect(delay1);
      delay1.connect(feedback1);
      feedback1.connect(delay1);
      delay1.connect(delayMix);

      compressor.connect(delay2);
      delay2.connect(feedback2);
      feedback2.connect(delay2);
      delay2.connect(delayMix);

      compressor.connect(delay3);
      delay3.connect(feedback3);
      feedback3.connect(delay3);
      delay3.connect(delayMix);

      delayMix.connect(gainNode);

      // Output to speakers
      gainNode.connect(audioContext.destination);

      analyser.fftSize = 256;

      console.log('Karaoke microphone active with reverb & echo');
    })
    .catch(err => {
      console.log('Microphone access denied:', err);
      micActive = false;
    });
}

function stopMicrophoneInput() {
  if (!micActive) return;

  micActive = false;

  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (microphoneStream) {
    microphoneStream = null;
  }
  if (analyser) {
    analyser = null;
  }
  if (convolverNode) {
    convolverNode = null;
  }
  if (compressor) {
    compressor = null;
  }

  console.log('Karaoke microphone stopped');
}

// Export for use in event listeners
export { playVideoOnTV, stopVideoOnTV, startMicrophoneInput, stopMicrophoneInput };
