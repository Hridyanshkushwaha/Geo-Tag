// Minimal EXIF reader: GPS position + date taken from a JPEG. No libraries needed.
function readExif(buf) {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return {};
    let off = 2;
    while (off < v.byteLength - 4) {
      if (v.getUint8(off) !== 0xFF) break;
      const marker = v.getUint8(off + 1);
      const len = v.getUint16(off + 2);
      if (marker === 0xE1 && v.getUint32(off + 4) === 0x45786966) {
        return parseTiff(v, off + 10);
      }
      if (marker === 0xDA) break;
      off += 2 + len;
    }
  } catch (e) { /* ignore broken EXIF */ }
  return {};
}

function parseTiff(v, start) {
  const little = v.getUint16(start) === 0x4949;
  const u16 = o => v.getUint16(start + o, little);
  const u32 = o => v.getUint32(start + o, little);

  function readIfd(o) {
    const n = u16(o), tags = {};
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      tags[u16(e)] = { count: u32(e + 4), at: e + 8 };
    }
    return tags;
  }
  function ascii(t) {
    const o = t.count <= 4 ? t.at : u32(t.at);
    let s = '';
    for (let i = 0; i < t.count - 1; i++) s += String.fromCharCode(v.getUint8(start + o + i));
    return s;
  }
  function rationals(t, n) {
    const o = u32(t.at), out = [];
    for (let i = 0; i < n; i++) {
      const d = u32(o + i * 8 + 4);
      out.push(d ? u32(o + i * 8) / d : 0);
    }
    return out;
  }

  const result = {};
  const ifd0 = readIfd(u32(4));

  if (ifd0[0x8769]) {
    const exif = readIfd(u32(ifd0[0x8769].at));
    const dt = exif[0x9003] || exif[0x9004];
    if (dt) result.date = ascii(dt);
  }
  if (!result.date && ifd0[0x0132]) result.date = ascii(ifd0[0x0132]);

  if (ifd0[0x8825]) {
    const gps = readIfd(u32(ifd0[0x8825].at));
    if (gps[2] && gps[4] && gps[1] && gps[3]) {
      const la = rationals(gps[2], 3), lo = rationals(gps[4], 3);
      let lat = la[0] + la[1] / 60 + la[2] / 3600;
      let lon = lo[0] + lo[1] / 60 + lo[2] / 3600;
      if (ascii(gps[1]).toUpperCase() === 'S') lat = -lat;
      if (ascii(gps[3]).toUpperCase() === 'W') lon = -lon;
      if (isFinite(lat) && isFinite(lon) && (lat !== 0 || lon !== 0)) {
        result.lat = lat;
        result.lon = lon;
      }
    }
  }
  return result;
}

if (typeof module !== 'undefined') module.exports = { readExif };
