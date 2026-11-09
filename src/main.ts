import './style.css';
import * as THREE from 'three';
import { Album, shutterSound } from './album';
import { loadBuildings3d } from './buildings3d';
import { chf, feeFor, levelOf, loadAssignments, reputationFor, type Assignment } from './assignments';
import { Drone, type FlightInput } from './drone';
import { FollowCamera } from './followCamera';
import { Hud } from './hud';
import { Input, type Action } from './input';
import { Intro, MainMenu } from './menu';
import { OutlineRenderer } from './outline';
import { PhotoCamera } from './photoCamera';
import { savePhoto } from './photos';
import { LEVELS, Quality } from './quality';
import { analyseSubject, ratePhoto, type Rating } from './rating';
import { BriefPanel, RatingCard, type Offer } from './ratingCard';
import { deleteGame, loadGame, newGame, storeGame, type SaveGame } from './save';
import { Sky } from './sky';
import { Studio } from './studio';
import { loadTerrain } from './terrain';
import { TimeOfDay } from './timeOfDay';
import { Wind } from './wind';
import { createWorld, heightAt } from './world';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// --- Renderer -------------------------------------------------------------------

const isMobile = window.matchMedia('(pointer: coarse)').matches;
const quality = new Quality(isMobile);

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const outlines = new OutlineRenderer(renderer);

const scene = new THREE.Scene();
const fog = new THREE.Fog('#c4e8ff', 500, 20000);
scene.fog = fog;

const hemi = new THREE.HemisphereLight('#ffffff', '#5a7a5a', 1.2);
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
scene.add(hemi, sun);

const sky = new Sky();
scene.add(sky.group);
outlines.hideInNormalPass.push(sky.group);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 25000);

// --- Loading ----------------------------------------------------------------------

const loading = $('loading');

async function start() {
  const base = `${import.meta.env.BASE_URL}data/luzern/`;
  const [data, houses, jobs, saved] = await Promise.all([loadTerrain(base), loadBuildings3d(base), loadAssignments(base), loadGame()]);
  $('credits').textContent = 'Geodaten © swisstopo (swissALTI3D, swissSURFACE3D, swissBUILDINGS3D, swissTLM3D)';

  let game: SaveGame = saved ?? newGame();
  let hasSave = !!saved;
  let started = false;

  // fewer people, cars and birds on weaker devices
  const density = quality.level === 'high' ? 1 : quality.level === 'medium' ? 0.65 : 0.35;
  const world = createWorld(scene, data, houses, density);
  const drone = new Drone();
  drone.mode = game.pro ? 'pro' : 'assist';
  scene.add(drone.group);
  const wind = new Wind();
  const localWind = new THREE.Vector3();
  const still = new THREE.Vector3();
  const clock = new TimeOfDay();
  clock.hour = game.hour;
  const input = new Input($('touch'));
  const follow = new FollowCamera(camera, canvas, heightAt, (x, y, z) => world.obstacles.solidAt(x, y, z, 0.4));
  const photo = new PhotoCamera(canvas);
  const album = new Album();
  const ratingCard = new RatingCard();
  const brief = new BriefPanel();
  const studio = new Studio(jobs, () => game);
  const menu = new MainMenu();
  const intro = new Intro();
  const hud = new Hud();
  const studioKey = isMobile ? 'Menü → Studio' : 'Taste M';

  // --- Save game & jobs -------------------------------------------------------------

  const activeJob = () => jobs.find((j) => j.id === game.activeJob) ?? null;
  let marked = world.landmarks;

  function save() {
    game.hour = clock.hour;
    game.pro = drone.mode === 'pro';
    hasSave = true;
    void storeGame(game);
  }

  function refreshJob() {
    const job = activeJob();
    brief.show(job, job ? (game.jobs[job.id]?.stars ?? null) : null, studioKey);
    marked = job ? world.landmarks.filter((l) => job.subjects.includes(l.id)) : world.landmarks;
    updateWallet();
  }

  function updateWallet() {
    const lv = levelOf(game.reputation);
    $('hud-money').textContent = chf(game.money);
    $('hud-rep').textContent = `${game.reputation} · ${lv.name}`;
  }

  studio.onAccept = (job) => {
    game.activeJob = job.id;
    save();
    refreshJob();
    showToast(`Auftrag angenommen: ${job.title}`);
  };
  studio.onCancel = () => {
    game.activeJob = null;
    save();
    refreshJob();
  };

  /** What handing in a rated photo would bring for the active job. */
  function offerFor(job: Assignment, rating: Rating): Offer {
    const record = game.jobs[job.id];
    const pro = drone.mode === 'pro';
    const fee = Math.max(0, feeFor(job, rating.stars, pro) - (record?.paid ?? 0));
    const rep = Math.max(0, reputationFor(job, rating.stars) - (record ? reputationFor(job, record.stars) : 0));
    if (!rating.fulfilled) return { canSubmit: false, fee, reputation: rep, note: 'Noch nicht erfüllt: ab 3 Sternen und mit allen Motiven' };
    if (record && rating.stars <= record.stars) {
      return { canSubmit: false, fee: 0, reputation: 0, note: `Kein neuer Bestwert (bisher ${record.stars.toFixed(1).replace('.', ',')} ★)` };
    }
    return { canSubmit: true, fee, reputation: rep, note: record ? 'Besser als bisher: neu einreichen?' : 'Auftrag erfüllt' };
  }

  let pending: { job: Assignment; rating: Rating; offer: Offer } | null = null;
  ratingCard.onSubmit = () => {
    if (!pending) return;
    const { job, rating, offer } = pending;
    const before = levelOf(game.reputation).level;
    const record = game.jobs[job.id];
    game.money += offer.fee;
    game.reputation += offer.reputation;
    game.jobs[job.id] = { stars: rating.stars, paid: (record?.paid ?? 0) + offer.fee, date: new Date().toISOString() };
    game.activeJob = null;
    save();
    refreshJob();
    const after = levelOf(game.reputation);
    showToast(
      `Auftrag abgeschlossen: ${offer.fee ? `+${chf(offer.fee)}` : ''}${offer.reputation ? ` +${offer.reputation} Ruf` : ''}` +
        (after.level > before ? ` · Neue Stufe: ${after.name}! Neue Aufträge im Studio.` : ''),
      after.level > before ? 5000 : 3500,
    );
    pending = null;
  };

  // --- Menu --------------------------------------------------------------------------

  function syncMenuLabels() {
    menu.setLabels(quality.label, drone.mode === 'pro' ? 'Pro' : 'Assist');
  }

  function beginPlay() {
    menu.close();
    started = true;
    if (!game.introSeen) {
      intro.open();
      return;
    }
    if (!game.activeJob) studio.open();
  }

  intro.onDone = () => {
    game.introSeen = true;
    save();
    studio.open();
  };

  menu.onAction = (action) => {
    switch (action) {
      case 'play':
        beginPlay();
        break;
      case 'newGame':
      case 'reset':
        if (hasSave && !window.confirm('Neues Spiel beginnen? Geld, Ruf und Aufträge werden zurückgesetzt. Fotos im Album bleiben.')) return;
        void deleteGame();
        game = newGame();
        clock.hour = game.hour;
        drone.mode = 'assist';
        drone.reset();
        follow.snap(drone);
        hasSave = false;
        refreshJob();
        beginPlay();
        break;
      case 'studio':
        menu.close();
        started = true;
        studio.open();
        break;
      case 'album':
        void album.open();
        break;
      case 'quality':
        quality.cycle();
        syncMenuLabels();
        break;
      case 'mode':
        drone.mode = drone.mode === 'assist' ? 'pro' : 'assist';
        save();
        syncMenuLabels();
        break;
    }
  };
  menu.setHasSave(hasSave, false);
  syncMenuLabels();
  menu.open();

  // --- Buttons -------------------------------------------------------------------

  const buttons: [string, Action][] = [
    ['btn-mode', 'toggleMode'],
    ['btn-home', 'home'],
    ['btn-time', 'skipTime'],
    ['btn-menu', 'menu'],
    ['btn-camera', 'toggleCamera'],
    ['btn-shutter', 'shoot'],
    ['btn-grid', 'cycleGrid'],
    ['btn-orient', 'toggleOrientation'],
    ['btn-album', 'album'],
  ];
  for (const [id, action] of buttons) {
    const button = $(id);
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    button.addEventListener('click', () => input.trigger(action));
  }
  $('brief').addEventListener('click', () => studio.open());

  // iOS Safari: block pinch-zoom of the page
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // --- Modes --------------------------------------------------------------------

  const stickLeft = document.querySelector('.stick.left span')!;
  const stickRight = document.querySelector('.stick.right span')!;
  function setCamera(on: boolean) {
    photo.setActive(on);
    drone.group.visible = !on;
    follow.wheelEnabled = !on;
    stickLeft.textContent = on ? 'Zoom' : 'Bewegen';
    stickRight.textContent = on ? 'Drehen · Neigen' : 'Drehen · Höhe';
    $('btn-camera').textContent = on ? 'Fliegen' : 'Kamera';
  }
  setCamera(false);

  const toast = $('toast');
  let toastTimer = 0;
  function showToast(text: string, ms = 2800) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), ms);
  }

  let capturing = false;
  refreshJob();

  // handle for poking at the game from the browser console during development
  if (import.meta.env.DEV) {
    Object.assign(window, { mk: { drone, camera, scene, world, photo, follow, clock, studio, menu, outlines, renderer, get game() { return game; } } });
  }

  // --- Resize & quality -------------------------------------------------------------

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, LEVELS[quality.level].pixelRatio));
    renderer.setSize(w, h, false);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    outlines.setSize(size.x, size.y);
    camera.aspect = w / h;
    // wider view in portrait so the drone keeps some surroundings
    camera.fov = w < h ? 75 : 60;
    follow.distance = w < h ? 11 : 8;
    camera.updateProjectionMatrix();
    photo.layout();
  }

  function applyQuality() {
    outlines.setMode(LEVELS[quality.level].outline);
    resize();
    syncMenuLabels();
  }
  quality.onChange = applyQuality;

  window.addEventListener('resize', resize);
  applyQuality();
  follow.snap(drone);

  // --- Stats overlay ----------------------------------------------------------------

  const statsEl = $('stats');
  let frames = 0;
  let lastStats = performance.now();

  function updateStats(now: number) {
    frames++;
    if (now - lastStats < 500) return;
    const fps = Math.round((frames * 1000) / (now - lastStats));
    frames = 0;
    lastStats = now;
    statsEl.textContent = `${fps} fps · ${quality.label}`;
  }

  // --- Loop -------------------------------------------------------------------------

  const idle: FlightInput = { moveX: 0, moveY: 0, yaw: 0, lift: 0 };
  const timer = new THREE.Timer();
  let lastMarks = 0;
  let lastSave = 0;
  let orbit = 0;
  loading.hidden = true;

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    const c = input.read();

    // overlays; Escape / B closes the innermost one, in flight it opens the menu
    if (menu.isOpen || intro.isOpen) {
      if (c.back && started && menu.isOpen) menu.close();
      c.back = c.menu = c.album = c.studio = c.shoot = false;
    }
    if (ratingCard.isOpen) {
      if (c.back || c.shoot) ratingCard.close();
      c.back = c.shoot = c.album = c.studio = c.menu = false;
    }
    if (c.back) {
      if (studio.isOpen) studio.close();
      else if (album.back()) {
        // album or its lightbox closed
      } else if (photo.active) setCamera(false);
      else c.menu = true;
    }
    if (c.menu && !menu.isOpen) {
      studio.close();
      album.close();
      if (photo.active) setCamera(false);
      menu.setHasSave(hasSave, started);
      save();
      menu.open();
    }
    if (c.studio && !menu.isOpen) {
      album.close();
      studio.toggle();
    }
    if (c.album && !menu.isOpen) {
      studio.close();
      album.toggle();
    }

    const paused = menu.isOpen || intro.isOpen || album.isOpen || ratingCard.isOpen || studio.isOpen;
    if (!paused) {
      if (c.toggleCamera) setCamera(!photo.active);
      if (photo.active) {
        if (c.cycleGrid) photo.cycleGrid();
        if (c.toggleOrientation) photo.toggleOrientation();
      } else {
        if (c.toggleMode) drone.mode = drone.mode === 'assist' ? 'pro' : 'assist';
        if (c.home && !c.back) {
          drone.reset();
          follow.snap(drone);
        }
      }
      if (c.skipTime) clock.skip();
      if (c.cycleQuality) quality.cycle();
    }

    clock.update(dt);
    clock.apply({ sky, sun, hemi, fog, lake: world.lake, windows: world.windows });
    wind.update(t);
    world.update(dt, wind.base);
    wind.at(drone.altitude, localWind);

    let view = camera;
    if (paused) {
      drone.update(dt, idle, still, world);
      if (photo.active) {
        photo.update(dt, { tilt: 0, zoom: 0 }, drone);
        view = photo.camera;
      }
    } else if (photo.active) {
      // the drone holds its position; slower turning at long focal lengths for precise framing
      const turn = c.camYaw * 0.45 * (24 / photo.focal);
      drone.update(dt, { ...idle, yaw: turn }, still, world);
      photo.update(dt, { tilt: c.camTilt, zoom: c.camZoom }, drone);
      view = photo.camera;
      if (time - lastMarks > 100) {
        lastMarks = time;
        const frame = photo.frameNdc();
        photo.showMarks(marked.map((lm) => analyseSubject(lm, photo.camera, world.obstacles, frame)));
      }
    } else {
      drone.update(dt, c, localWind, world);
    }

    if (menu.isOpen) {
      // slow flight around the bridge behind the title screen
      orbit += dt * 0.04;
      camera.position.set(Math.cos(orbit) * 230, 70 + Math.sin(orbit * 0.7) * 15, Math.sin(orbit) * 230);
      camera.lookAt(0, 8, 0);
    } else if (!photo.active) {
      follow.update(drone, c.camPitch, dt);
    }
    drone.gimbal = photo.gimbal;
    sky.follow(view);

    outlines.render(scene, view);

    if (photo.active && c.shoot && !capturing && !paused) {
      capturing = true;
      shutterSound();
      const job = activeJob();
      // render the framed view once more at photo size, copy it, then restore the screen
      const { w, h } = photo.photoSize;
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      outlines.setSize(w, h);
      const shotCamera = photo.prepareShot();
      outlines.render(scene, shotCamera);
      const shot = photo.capture(canvas, world.landmarks, { gameTime: clock.label, altitude: drone.altitude });
      resize();
      outlines.render(scene, view);
      const rating = ratePhoto({
        camera: shotCamera,
        landmarks: world.landmarks,
        obstacles: world.obstacles,
        assignment: job,
        hour: clock.hour,
        sunDir: sky.sunDir,
        windStrength: Math.hypot(localWind.x, localWind.z),
        turnRate: Math.min(1, Math.abs(c.camYaw)),
        focal: photo.focal,
        gimbal: photo.gimbal,
        altitude: drone.altitude,
        portrait: photo.portrait,
      });
      shot
        .then(async (p) => {
          p.tags = rating.subjects;
          p.rating = {
            stars: rating.stars,
            comment: rating.comment,
            lines: [...rating.criteria.map((cr) => `${cr.label}: ${cr.text}`), ...rating.bonus.map((b) => `Bonus: ${b}`)],
            assignment: rating.assignmentId,
            fulfilled: rating.fulfilled,
          };
          const stored = await savePhoto(p);
          const offer = job ? offerFor(job, rating) : null;
          pending = job && offer ? { job, rating, offer } : null;
          ratingCard.show(rating, p.thumb, job, offer);
          if (!stored) showToast('Foto nur bis zum Neuladen gespeichert');
        })
        .catch(() => showToast('Foto konnte nicht gespeichert werden'))
        .finally(() => (capturing = false));
    }

    const now = performance.now();
    if (started && now - lastSave > 20000) {
      lastSave = now;
      save();
    }
    quality.frame(now);
    hud.update(now, drone, localWind, view, input.device, clock.label);
    updateStats(now);
  });
}

start().catch((err) => {
  console.error(err);
  $('loading-text').textContent = 'Luzern konnte nicht geladen werden. Bitte Seite neu laden.';
});
