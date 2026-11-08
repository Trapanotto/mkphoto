import * as THREE from 'three';
import type { Assignment } from './assignments';
import type { Landmark } from './landmarks';
import type { ObstacleIndex } from './obstacles';
import { terrainAt } from './terrain';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Part of the camera's view that counts, in NDC. The photo uses all of it; the viewfinder only its frame. */
export interface FrameNdc {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export const FULL_FRAME: FrameNdc = { x0: -1, x1: 1, y0: -1, y1: 1 };

export interface SubjectView {
  id: string;
  name: string;
  /** Share of the subject's points that face the camera and lie inside the frame. */
  framed: number;
  /** Share of framed points not hidden behind something. */
  clear: number;
  /** framed × clear: how much of the subject the viewer actually sees. */
  presence: number;
  /** Share of the frame covered by the subject's outline. */
  size: number;
  /** Centre of the visible points in frame coordinates (0..1, top left = 0,0). */
  center: { u: number; v: number } | null;
  /** Outline in NDC, for the viewfinder markers. */
  box: { minX: number; maxX: number; minY: number; maxY: number } | null;
}

const tmp = new THREE.Vector3();
const toCam = new THREE.Vector3();

/** Marches from the camera to a point and reports whether terrain or a building is in the way. */
function blocked(from: THREE.Vector3, to: THREE.Vector3, obstacles: ObstacleIndex, owner: string) {
  const dist = from.distanceTo(to);
  const steps = Math.min(120, Math.ceil(dist / 2));
  const end = (dist - 1.5) / dist; // stop just before the point itself
  for (let i = 1; i < steps; i++) {
    const t = (i / steps) * end;
    tmp.lerpVectors(from, to, t);
    if (terrainAt(tmp.x, tmp.z) > tmp.y) return true;
    if (obstacles.solidAt(tmp.x, tmp.y, tmp.z, 0, owner)) return true;
  }
  return false;
}

export function analyseSubject(
  lm: Landmark,
  camera: THREE.PerspectiveCamera,
  obstacles: ObstacleIndex,
  frame: FrameNdc = FULL_FRAME,
): SubjectView {
  let facing = 0;
  let inFrame = 0;
  let visible = 0;
  let sumU = 0;
  let sumV = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const fw = frame.x1 - frame.x0;
  const fh = frame.y1 - frame.y0;

  for (const sp of lm.points) {
    if (sp.n && toCam.subVectors(camera.position, sp.p).dot(sp.n) <= 0) continue;
    facing++;
    tmp.copy(sp.p).project(camera);
    if (tmp.z > 1 || tmp.z < -1) continue;
    const x = tmp.x;
    const y = tmp.y;
    if (x < frame.x0 || x > frame.x1 || y < frame.y0 || y > frame.y1) continue;
    inFrame++;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    if (blocked(camera.position, sp.p, obstacles, lm.id)) continue;
    visible++;
    sumU += (x - frame.x0) / fw;
    sumV += (frame.y1 - y) / fh;
  }

  const framed = facing ? inFrame / facing : 0;
  const clear = inFrame ? visible / inFrame : 0;
  const box = inFrame ? { minX, maxX, minY, maxY } : null;
  // outline area, padded a little because the points sit inside the model
  const size = box ? clamp01((((maxX - minX) * 1.1 + 0.02) * ((maxY - minY) * 1.1 + 0.02)) / (fw * fh)) : 0;
  return {
    id: lm.id,
    name: lm.name,
    framed,
    clear,
    presence: framed * clear,
    size,
    center: visible ? { u: sumU / visible, v: sumV / visible } : null,
    box,
  };
}

// --- Rating -----------------------------------------------------------------------

export type CriterionKey = 'subject' | 'composition' | 'light' | 'brief' | 'technique';

export interface Criterion {
  key: CriterionKey;
  label: string;
  score: number;
  text: string;
  /** Short hint for the client's comment when this is the weakest point. */
  hint: string;
}

export interface Rating {
  stars: number;
  criteria: Criterion[];
  bonus: string[];
  comment: string;
  subjects: string[];
  assignmentId?: string;
  fulfilled: boolean;
}

export interface RatingContext {
  camera: THREE.PerspectiveCamera;
  landmarks: Landmark[];
  obstacles: ObstacleIndex;
  assignment: Assignment | null;
  hour: number;
  sunDir: THREE.Vector3;
  windStrength: number;
  /** How hard the pilot was turning when the shutter fired (0..1). */
  turnRate: number;
  focal: number;
  gimbal: number;
  altitude: number;
  portrait: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

function rateSubjects(views: SubjectView[], size: { min: number; max: number }): Criterion {
  if (!views.length || views.every((v) => v.presence === 0)) {
    return { key: 'subject', label: 'Motiv', score: 0, text: 'Kein bekanntes Motiv im Bild', hint: 'ich sehe das Motiv gar nicht' };
  }
  const issues: { text: string; hint: string }[] = [];
  let presence = 0;
  for (const v of views) {
    presence += smooth(0.25, 0.85, v.presence);
    if (v.presence === 0) {
      issues.push({ text: `${v.name} fehlt`, hint: `${v.name} fehlt im Bild` });
      continue;
    }
    if (v.framed < 0.85) issues.push({ text: `${v.name} angeschnitten`, hint: `${v.name} ist angeschnitten` });
    if (v.clear < 0.7) issues.push({ text: `${v.name} zu ${pct(1 - v.clear)} verdeckt`, hint: `${v.name} ist zu sehr verdeckt` });
    if (v.size < 0.015) issues.push({ text: `${v.name} kaum zu erkennen`, hint: `${v.name} ist kaum zu erkennen` });
  }
  presence /= views.length;

  // size counts for all subjects together: their joint outline
  const boxes = views.map((v) => v.box).filter((b): b is NonNullable<SubjectView['box']> => !!b);
  let joint = 0;
  if (boxes.length) {
    const minX = Math.max(-1, Math.min(...boxes.map((b) => b.minX)));
    const maxX = Math.min(1, Math.max(...boxes.map((b) => b.maxX)));
    const minY = Math.max(-1, Math.min(...boxes.map((b) => b.minY)));
    const maxY = Math.min(1, Math.max(...boxes.map((b) => b.maxY)));
    joint = clamp01((((maxX - minX) * 1.1 + 0.02) * ((maxY - minY) * 1.1 + 0.02)) / 4);
  }
  const sizeScore = joint < size.min ? joint / size.min : joint > size.max ? size.max / joint : 1;
  if (joint < size.min * 0.7) issues.push({ text: `Motiv zu klein (${pct(joint)} des Bildes)`, hint: 'das Motiv ist zu klein, gehen Sie näher ran' });
  if (joint > size.max * 1.3) issues.push({ text: 'Motiv zu nah', hint: 'das ist mir zu nah, etwas mehr Abstand bitte' });

  const score = 0.55 * presence + 0.45 * sizeScore - 0.08 * issues.length;
  const names = views.map((v) => v.name).join(' und ');
  return {
    key: 'subject',
    label: 'Motiv',
    score: clamp01(score),
    text: issues.length ? issues.map((i) => i.text).join(' · ') : `${names} gut sichtbar, ${pct(joint)} des Bildes`,
    hint: issues[0]?.hint ?? '',
  };
}

function rateComposition(views: SubjectView[], ctx: RatingContext): Criterion {
  const centers = views.map((v) => v.center).filter((c): c is { u: number; v: number } => !!c);
  if (!centers.length) {
    return { key: 'composition', label: 'Komposition', score: 0.3, text: 'Ohne Motiv keine Komposition', hint: 'das Bild hat keinen Mittelpunkt' };
  }
  const u = centers.reduce((s, c) => s + c.u, 0) / centers.length;
  const v = centers.reduce((s, c) => s + c.v, 0) / centers.length;
  const thirds = [
    [1 / 3, 1 / 3],
    [2 / 3, 1 / 3],
    [1 / 3, 2 / 3],
    [2 / 3, 2 / 3],
  ];
  const d = Math.min(...thirds.map(([tu, tv]) => Math.hypot(u - tu, v - tv)));
  const dc = Math.hypot(u - 0.5, v - 0.5);
  const notes: string[] = [];
  let score: number;
  let hint = '';
  if (dc < 0.08) {
    score = 0.6;
    notes.push('Motiv genau in der Mitte: ruhig, aber etwas statisch');
    hint = 'mit dem Motiv auf einer Drittellinie wirkt es lebendiger';
  } else {
    score = 1 - 0.55 * smooth(0.06, 0.32, d);
    if (d < 0.1) notes.push('Motiv nahe einem Drittelpunkt');
    else if (d < 0.2) {
      notes.push('Motiv etwas neben dem Drittelpunkt');
      hint = 'das Motiv dürfte noch etwas näher auf die Drittellinie';
    } else {
      notes.push('Motiv weder mittig noch auf einem Drittel');
      hint = 'rücken Sie das Motiv auf eine Drittellinie';
    }
  }

  // where the horizon cuts the picture
  const halfFov = THREE.MathUtils.degToRad(ctx.camera.fov) / 2;
  const hy = Math.tan(-ctx.gimbal) / Math.tan(halfFov);
  const hv = (1 - hy) / 2;
  if (hv > 0.02 && hv < 0.98) {
    if (Math.abs(hv - 0.5) < 0.07) {
      score -= 0.15;
      notes.push('Horizont teilt das Bild in der Mitte');
      hint ||= 'der Horizont halbiert das Bild';
    } else if (Math.abs(hv - 1 / 3) < 0.08 || Math.abs(hv - 2 / 3) < 0.08) {
      score += 0.05;
      notes.push('Horizont auf einer Drittellinie');
    }
  }
  return { key: 'composition', label: 'Komposition', score: clamp01(score), text: notes.join(' · '), hint };
}

function rateLight(ctx: RatingContext): Criterion {
  const h = ctx.hour;
  let score: number;
  let text: string;
  let hint = '';
  if (ctx.assignment?.light === 'night') {
    // a night job turns the scale around
    if (h >= 21.5 || h < 5) [score, text] = [0.95, 'Nachtstimmung wie gewünscht'];
    else if ((h >= 20 && h < 21.5) || (h >= 5 && h < 6.5)) [score, text] = [0.8, 'Blaue Stunde, fast Nacht'];
    else {
      [score, text] = [0.3, 'Zu hell für eine Nachtaufnahme'];
      hint = 'es sollte Nacht sein';
    }
    return { key: 'light', label: 'Licht', score, text, hint };
  }
  if ((h >= 6.5 && h < 9) || (h >= 17 && h < 20)) [score, text] = [1, 'Goldenes Licht'];
  else if ((h >= 9 && h < 11) || (h >= 15 && h < 17)) [score, text] = [0.85, 'Weiches Tageslicht'];
  else if (h >= 11 && h < 15) {
    [score, text] = [0.65, 'Mittagslicht, eher flach'];
    hint = 'im Morgen- oder Abendlicht wirkt es wärmer';
  } else if ((h >= 20 && h < 21.5) || (h >= 5.5 && h < 6.5)) [score, text] = [0.8, 'Blaue Stunde'];
  else {
    [score, text] = [0.35, 'Nacht, sehr dunkel'];
    hint = 'es ist leider zu dunkel';
  }

  const day = h >= 6 && h < 20.5;
  const fwd = ctx.camera.getWorldDirection(tmp);
  const fl = Math.hypot(fwd.x, fwd.z) || 1;
  const sl = Math.hypot(ctx.sunDir.x, ctx.sunDir.z) || 1;
  const facingSun = (fwd.x * ctx.sunDir.x + fwd.z * ctx.sunDir.z) / (fl * sl);
  if (day && facingSun > 0.8 && ctx.sunDir.y < 0.6) {
    score -= 0.25;
    text += ' · Gegenlicht';
    hint = 'gegen die Sonne ist alles zu dunkel';
  } else if (day && facingSun < -0.5) {
    score += 0.05;
    text += ' · Sonne im Rücken';
  }
  return { key: 'light', label: 'Licht', score: clamp01(score), text, hint };
}

function headingOf(camera: THREE.Camera) {
  const f = camera.getWorldDirection(tmp);
  return THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z));
}

const inHours = (h: number, from: number, to: number) => (from <= to ? h >= from && h < to : h >= from || h < to);

function rateBrief(a: Assignment, views: SubjectView[], ctx: RatingContext): Criterion {
  const subjectChecks = views.map((v) => ({ ok: v.presence >= 0.5, label: `${v.name} gut sichtbar` }));
  const other: { ok: boolean; label: string }[] = [];
  const halfFov = THREE.MathUtils.degToRad(ctx.camera.fov) / 2;
  const horizonInFrame = Math.abs(Math.tan(-ctx.gimbal) / Math.tan(halfFov)) < 0.95;

  if (a.orientation) {
    other.push({ ok: (a.orientation === 'portrait') === ctx.portrait, label: a.orientation === 'landscape' ? 'Querformat' : 'Hochformat' });
  }
  if (a.heading) {
    const hd = headingOf(ctx.camera);
    other.push({ ok: hd >= a.heading.from && hd <= a.heading.to && (!a.horizon || horizonInFrame), label: a.heading.label });
  } else if (a.horizon) {
    other.push({ ok: horizonInFrame, label: 'Horizont im Bild' });
  }
  if (a.hours) other.push({ ok: inHours(ctx.hour, a.hours.from, a.hours.to), label: a.hours.label });
  if (a.gimbalMax) other.push({ ok: THREE.MathUtils.radToDeg(ctx.gimbal) <= a.gimbalMax.deg, label: a.gimbalMax.label });
  if (a.altitudeMax) other.push({ ok: ctx.altitude <= a.altitudeMax.m, label: a.altitudeMax.label });
  if (a.focalMin) other.push({ ok: ctx.focal >= a.focalMin.mm, label: a.focalMin.label });

  // subjects carry 40 %, all other wishes share the rest
  const subjectShare = other.length ? 0.4 : 1;
  const score =
    (subjectChecks.filter((c) => c.ok).length / Math.max(1, subjectChecks.length)) * subjectShare +
    (other.length ? (other.filter((c) => c.ok).length / other.length) * (1 - subjectShare) : 0);
  const checks = [...subjectChecks, ...other];
  const missing = checks.filter((c) => !c.ok);
  return {
    key: 'brief',
    label: 'Kundenwunsch',
    score,
    text: checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.label}`).join(' · '),
    hint: missing.length ? `mir fehlt noch: ${missing.map((m) => m.label).join(', ')}` : '',
  };
}

function rateTechnique(ctx: RatingContext): Criterion {
  const wind = (Math.max(0, ctx.windStrength - 3) / 6) * (ctx.focal / 72);
  const turn = ctx.turnRate * 0.8;
  const sharp = clamp01(1 - wind - turn);
  let text = 'Scharf';
  let hint = '';
  if (sharp < 0.85) {
    text = turn > wind
      ? 'Verwackelt: die Drohne hat sich beim Auslösen gedreht'
      : `Leicht verwackelt durch Wind${ctx.focal >= 50 ? ' (Tele verstärkt das)' : ''}`;
    hint = 'das Bild ist leider verwackelt';
  }
  return { key: 'technique', label: 'Technik', score: sharp, text, hint };
}

const WEIGHTS: Record<CriterionKey, number> = { subject: 0.3, composition: 0.25, light: 0.15, brief: 0.2, technique: 0.1 };

export function ratePhoto(ctx: RatingContext): Rating {
  const all = ctx.landmarks.map((lm) => analyseSubject(lm, ctx.camera, ctx.obstacles));
  const seen = all.filter((v) => v.presence > 0.2).map((v) => v.name);
  // with a job: judge its subjects; without: the most prominent landmark
  const judged = ctx.assignment
    ? all.filter((v) => ctx.assignment!.subjects.includes(v.id))
    : all.filter((v) => v.presence > 0.2).sort((a, b) => b.size - a.size).slice(0, 1);

  const size = ctx.assignment?.size ?? { min: 0.1, max: 0.7 };
  const criteria: Criterion[] = [rateSubjects(judged, size), rateComposition(judged, ctx), rateLight(ctx)];
  if (ctx.assignment) criteria.push(rateBrief(ctx.assignment, judged, ctx));
  criteria.push(rateTechnique(ctx));

  const weightSum = criteria.reduce((s, c) => s + WEIGHTS[c.key], 0);
  const weighted = criteria.reduce((s, c) => s + c.score * WEIGHTS[c.key], 0) / weightSum;

  // small extras for unusual pictures, up to half a star
  const bonus: string[] = [];
  const night = ctx.hour >= 20.5 || ctx.hour < 5.5;
  if (night && all.some((v) => v.id === 'wasserturm' && v.presence > 0.3)) bonus.push('Leuchtende Fenster bei Nacht');
  if (ctx.altitude < 4 && ctx.gimbal > -0.3) bonus.push('Perspektive knapp über dem Wasser');
  if (ctx.gimbal < -1.35) bonus.push('Senkrecht von oben');
  const bonusStars = Math.min(0.5, bonus.length * 0.25);

  let raw = Math.min(5, Math.max(0, weighted * 5 + bonusStars));
  // hard limits: a job photo without one of its subjects can't pass; no subject at all is a miss
  const missing = !!ctx.assignment && judged.some((v) => v.presence < 0.3);
  if (missing) raw = Math.min(raw, 2.5);
  if (criteria[0].score === 0) raw = Math.min(raw, 1);
  const stars = Math.round(raw * 2) / 2;
  const fulfilled = !!ctx.assignment && !missing && stars >= 3;

  return {
    stars,
    criteria,
    bonus,
    comment: commentFor(stars, criteria, ctx.assignment),
    subjects: seen,
    assignmentId: ctx.assignment?.id,
    fulfilled,
  };
}

function commentFor(stars: number, criteria: Criterion[], a: Assignment | null) {
  const weakest = [...criteria].filter((c) => c.hint).sort((x, y) => x.score - y.score)[0];
  const hint = weakest?.hint ?? '';
  if (!a) {
    if (stars >= 4.5) return 'Starkes Bild. Das kommt ins Portfolio.';
    return hint ? `Tipp: ${hint[0].toUpperCase()}${hint.slice(1)}.` : 'Solides Bild.';
  }
  if (stars >= 4.5) {
    return weakest && weakest.score < 0.8
      ? `Sehr schön! Eine Kleinigkeit: ${hint}. Wir nehmen es trotzdem sehr gerne.`
      : 'Wunderbar, genau so haben wir uns das vorgestellt!';
  }
  if (stars >= 3.5) return hint ? `Schön geworden. Nur: ${hint}. Aber wir nehmen es gerne.` : 'Schön geworden, das nehmen wir gerne.';
  if (stars >= 2.5) return `Brauchbar, aber ${hint || 'mir fehlt noch etwas'}. Versuchen Sie es nochmals?`;
  return `Leider nicht, was wir brauchen: ${hint || 'das passt nicht zum Auftrag'}.`;
}
