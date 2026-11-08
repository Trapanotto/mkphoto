import * as THREE from 'three';
import type { Drone } from './drone';
import type { Device } from './input';
import { HOME } from './world';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Flight readouts, warnings and the input hints. Updated ten times a second. */
export class Hud {
  private readonly batteryFill = $('battery-fill');
  private readonly batteryText = $('battery-text');
  private readonly alt = $('hud-alt');
  private readonly speed = $('hud-speed');
  private readonly windArrow = $('wind-arrow');
  private readonly windText = $('hud-wind');
  private readonly home = $('hud-home');
  private readonly mode = $('hud-mode');
  private readonly modeButton = $('btn-mode');
  private readonly message = $('message');
  private readonly dir = new THREE.Vector3();
  private last = 0;

  update(now: number, drone: Drone, wind: THREE.Vector3, camera: THREE.Camera, device: Device) {
    if (now - this.last < 100) return;
    this.last = now;

    const b = Math.ceil(drone.battery);
    this.batteryFill.style.width = `${drone.battery}%`;
    this.batteryFill.dataset.level = b <= 20 ? 'low' : b <= 40 ? 'mid' : 'ok';
    this.batteryText.textContent = `${b} %`;
    this.alt.textContent = `${Math.max(0, drone.altitude).toFixed(0)} m`;
    this.speed.textContent = `${(Math.hypot(drone.groundVel.x, drone.groundVel.z) * 3.6).toFixed(0)} km/h`;
    this.home.textContent = `${Math.hypot(drone.pos.x - HOME.x, drone.pos.z - HOME.z).toFixed(0)} m`;
    const modeLabel = drone.mode === 'pro' ? 'Pro' : 'Assist';
    this.mode.textContent = modeLabel;
    this.modeButton.textContent = modeLabel;

    // wind arrow relative to the view: up = blowing away from the camera
    camera.getWorldDirection(this.dir);
    const len = Math.hypot(this.dir.x, this.dir.z) || 1;
    const fx = this.dir.x / len;
    const fz = this.dir.z / len;
    const ahead = wind.x * fx + wind.z * fz;
    const right = wind.x * -fz + wind.z * fx;
    this.windArrow.style.transform = `rotate(${Math.atan2(right, ahead)}rad)`;
    this.windText.textContent = `${Math.hypot(wind.x, wind.z).toFixed(1)} m/s`;

    const homeHint = device === 'touch' ? 'Start-Taste' : device === 'gamepad' ? 'B' : 'R';
    let msg = '';
    if (drone.empty && drone.grounded) msg = `Akku leer. ${homeHint} bringt die Drohne zum Start.`;
    else if (drone.empty) msg = 'Akku leer. Notlandung …';
    else if (drone.atBoundary) msg = 'Grenze des Fluggebiets';
    else if (drone.atCeiling) msg = 'Maximale Flughöhe 120 m';
    else if (drone.battery < 20 && !drone.grounded) msg = 'Akku schwach. Zurück zum Start!';
    this.message.textContent = msg;
    this.message.hidden = msg === '';

    document.body.dataset.device = device;
  }
}
