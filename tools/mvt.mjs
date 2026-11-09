// Minimal Mapbox Vector Tile decoder (protobuf), enough for the swisstopo base map tiles.
// Returns { layerName: [{ type: 1|2|3, props, geom: [[x, y], ...][] }] } in tile units (0..extent).

function reader(buf) {
  let pos = 0;
  const varint = () => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = buf[pos++];
      result += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return result;
      shift += 7;
    }
  };
  return {
    get pos() {
      return pos;
    },
    set pos(p) {
      pos = p;
    },
    varint,
    skip(wire) {
      if (wire === 0) varint();
      else if (wire === 1) pos += 8;
      else if (wire === 2) pos += varint();
      else if (wire === 5) pos += 4;
      else throw new Error('wire type ' + wire);
    },
    bytes() {
      const len = varint();
      const out = buf.subarray(pos, pos + len);
      pos += len;
      return out;
    },
    double() {
      const v = new DataView(buf.buffer, buf.byteOffset + pos, 8).getFloat64(0, true);
      pos += 8;
      return v;
    },
    float() {
      const v = new DataView(buf.buffer, buf.byteOffset + pos, 4).getFloat32(0, true);
      pos += 4;
      return v;
    },
  };
}

const text = new TextDecoder();
const zigzag = (n) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

function value(bytes) {
  const r = reader(bytes);
  let v = null;
  while (r.pos < bytes.length) {
    const tag = r.varint();
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1) v = text.decode(r.bytes());
    else if (field === 2) v = r.float();
    else if (field === 3) v = r.double();
    else if (field === 4 || field === 5) v = r.varint();
    else if (field === 6) v = zigzag(r.varint());
    else if (field === 7) v = !!r.varint();
    else r.skip(wire);
  }
  return v;
}

function geometry(cmds) {
  const rings = [];
  let ring = null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < cmds.length; ) {
    const c = cmds[i++];
    const id = c & 7;
    const count = c >> 3;
    if (id === 7) {
      if (ring && ring.length) ring.push([...ring[0]]);
      continue;
    }
    for (let k = 0; k < count; k++) {
      x += zigzag(cmds[i++]);
      y += zigzag(cmds[i++]);
      if (id === 1) {
        ring = [];
        rings.push(ring);
      }
      ring.push([x, y]);
    }
  }
  return rings;
}

function layer(bytes) {
  const r = reader(bytes);
  let name = '';
  let extent = 4096;
  const keys = [];
  const values = [];
  const raw = [];
  while (r.pos < bytes.length) {
    const tag = r.varint();
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1) name = text.decode(r.bytes());
    else if (field === 2) raw.push(r.bytes());
    else if (field === 3) keys.push(text.decode(r.bytes()));
    else if (field === 4) values.push(value(r.bytes()));
    else if (field === 5) extent = r.varint();
    else r.skip(wire);
  }
  const features = raw.map((fb) => {
    const f = reader(fb);
    let tags = [];
    let type = 0;
    let cmds = [];
    while (f.pos < fb.length) {
      const tag = f.varint();
      const field = tag >> 3;
      const wire = tag & 7;
      if (field === 2 || field === 4) {
        const packed = f.bytes();
        const p = reader(packed);
        const list = [];
        while (p.pos < packed.length) list.push(p.varint());
        if (field === 2) tags = list;
        else cmds = list;
      } else if (field === 3) type = f.varint();
      else f.skip(wire);
    }
    const props = {};
    for (let i = 0; i < tags.length; i += 2) props[keys[tags[i]]] = values[tags[i + 1]];
    return { type, props, geom: geometry(cmds), extent };
  });
  return { name, features };
}

export function decodeTile(buf) {
  const r = reader(buf);
  const out = {};
  while (r.pos < buf.length) {
    const tag = r.varint();
    if (tag >> 3 === 3 && (tag & 7) === 2) {
      const l = layer(r.bytes());
      out[l.name] = l.features;
    } else r.skip(tag & 7);
  }
  return out;
}

// --- Coordinates: swisstopo's approximate formulas (about 1 m) --------------------------------
export function wgsToLv95(lon, lat) {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lon * 3600 - 26782.5) / 10000;
  const e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3;
  const n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3;
  return [e, n];
}

export function lv95ToWgs(e, n) {
  const y = (e - 2600000) / 1e6;
  const x = (n - 1200000) / 1e6;
  const l = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3;
  const p = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x ** 3;
  return [(l * 100) / 36, (p * 100) / 36];
}

export const tileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const tileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
export const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
export const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
