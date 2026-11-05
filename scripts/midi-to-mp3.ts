// Musiques des biomes (ajout, retour de test : « je ne veux pas les musiques de
// combat, à part pour les boss ; sinon, des musiques qui vont avec le biome »).
//
// Essentials n'a en .ogg que quelques pistes (Surfing, les combats) ; ses
// musiques de route, de ville et de grotte sont des .mid, que le navigateur ne
// sait pas jouer. Ce script les rend une fois pour toutes en .mp3, avec un petit
// synthétiseur à la façon des consoles portables : ondes carrées pour les
// mélodies, triangle pour les basses, bruit pour les percussions. Le résultat
// va dans public/game/music/ (qu'import-assets ne vide pas), en boucle.
//
//   node scripts/midi-to-mp3.ts      (il faut ffmpeg, avec libmp3lame, dans le PATH)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BIOME_TRACKS } from '../src/audio/sounds.ts';

const GODOT = process.env.POKHADES_GODOT ?? path.resolve(import.meta.dirname, '../../pokhades');
const BGM = path.join(GODOT, 'Pokemon Essentials v21.1 2023-07-30/Audio/BGM');
const OUT = path.resolve(import.meta.dirname, '../public/game/music');
const RATE = 22050;

interface Note {
  start: number;
  end: number;
  key: number;
  vel: number;
  ch: number;
  program: number;
}

/** Lit un .mid (formats 0 et 1) : les notes, en secondes. */
function parseMidi(buf: Buffer): Note[] {
  let p = 0;
  const u32 = () => ((buf[p++] << 24) | (buf[p++] << 16) | (buf[p++] << 8) | buf[p++]) >>> 0;
  const u16 = () => (buf[p++] << 8) | buf[p++];
  const vlq = () => {
    let v = 0;
    let b;
    do {
      b = buf[p++];
      v = (v << 7) | (b & 0x7f);
    } while (b & 0x80);
    return v;
  };
  if (buf.toString('ascii', 0, 4) !== 'MThd') throw new Error('pas un MIDI');
  p = 4;
  const hlen = u32();
  u16();
  const ntracks = u16();
  const division = u16();
  p = 8 + hlen;
  type Ev = { tick: number; kind: 'on' | 'off' | 'tempo' | 'prog'; ch: number; key: number; vel: number; tempo: number };
  const evs: Ev[] = [];
  for (let t = 0; t < ntracks; t++) {
    if (buf.toString('ascii', p, p + 4) !== 'MTrk') break;
    p += 4;
    const len = u32();
    const end = p + len;
    let tick = 0;
    let status = 0;
    while (p < end) {
      tick += vlq();
      let b = buf[p];
      if (b & 0x80) {
        status = b;
        p++;
      }
      b = status;
      const type = b & 0xf0;
      const ch = b & 0x0f;
      if (b === 0xff) {
        const meta = buf[p++];
        const l = vlq();
        if (meta === 0x51) evs.push({ tick, kind: 'tempo', ch: 0, key: 0, vel: 0, tempo: (buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2] });
        p += l;
      } else if (b === 0xf0 || b === 0xf7) {
        p += vlq();
      } else if (type === 0x90 || type === 0x80) {
        const key = buf[p++];
        const vel = buf[p++];
        evs.push({ tick, kind: type === 0x90 && vel > 0 ? 'on' : 'off', ch, key, vel, tempo: 0 });
      } else if (type === 0xc0) {
        evs.push({ tick, kind: 'prog', ch, key: buf[p++], vel: 0, tempo: 0 });
      } else if (type === 0xd0) p += 1;
      else p += 2;
    }
    p = end;
  }
  evs.sort((a, b) => a.tick - b.tick || (a.kind === 'tempo' ? -1 : 0));
  // Ticks → secondes, avec les changements de tempo.
  let lastTick = 0;
  let sec = 0;
  let tempo = 500000;
  const program = new Array(16).fill(0);
  const open = new Map<string, Note>();
  const notes: Note[] = [];
  for (const e of evs) {
    sec += ((e.tick - lastTick) * tempo) / 1e6 / division;
    lastTick = e.tick;
    if (e.kind === 'tempo') tempo = e.tempo;
    else if (e.kind === 'prog') program[e.ch] = e.key;
    else {
      const id = `${e.ch}:${e.key}`;
      const prev = open.get(id);
      if (prev) {
        prev.end = sec;
        notes.push(prev);
        open.delete(id);
      }
      if (e.kind === 'on') open.set(id, { start: sec, end: sec, key: e.key, vel: e.vel / 127, ch: e.ch, program: program[e.ch] });
    }
  }
  return notes.filter((n) => n.end > n.start);
}

/** Rend les notes en échantillons : carrés, triangles et bruit, enveloppes courtes. */
function synth(notes: Note[]): Float32Array {
  const length = Math.max(...notes.map((n) => n.end)) + 0.3;
  const out = new Float32Array(Math.ceil(length * RATE));
  let noise = 1;
  for (const n of notes) {
    const drum = n.ch === 9;
    // Basses (programmes 32-39, ou registre grave) en triangle ; nappes et cordes en carré à 50 %, plus doux ; le reste en carré à 25 %.
    const bass = !drum && (n.program >= 32 && n.program <= 39 ? true : n.key < 48);
    const pad = !drum && !bass && n.program >= 40 && n.program <= 55;
    const freq = 440 * 2 ** ((n.key - 69) / 12);
    const dur = drum ? 0.09 + (n.key < 40 ? 0.08 : 0) : n.end - n.start;
    const rel = drum ? 0 : 0.06;
    const i0 = Math.floor(n.start * RATE);
    const i1 = Math.min(out.length, Math.floor((n.start + dur + rel) * RATE));
    const gain = n.vel * (drum ? 0.18 : bass ? 0.22 : pad ? 0.08 : 0.11);
    let phase = 0;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / RATE;
      // Attaque 5 ms, petite retombée, relâche à la fin de la note.
      const att = Math.min(1, t / (pad ? 0.04 : 0.005));
      const dec = drum ? Math.exp(-t * (n.key < 40 ? 22 : 45)) : 0.65 + 0.35 * Math.exp(-t * 8);
      const tail = t > dur ? Math.max(0, 1 - (t - dur) / Math.max(rel, 1e-3)) : 1;
      let v: number;
      if (drum) {
        noise = (noise * 1103515245 + 12345) & 0x7fffffff;
        const white = (noise / 0x7fffffff) * 2 - 1;
        // Grosse caisse : une sinusoïde qui plonge ; le reste, du bruit.
        v = n.key < 40 ? Math.sin(2 * Math.PI * (60 + 90 * Math.exp(-t * 30)) * t) : white;
      } else {
        phase = (phase + freq / RATE) % 1;
        v = bass ? 4 * Math.abs(phase - 0.5) - 1 : phase < (pad ? 0.5 : 0.25) ? 1 : -1;
      }
      out[i] += v * gain * att * dec * tail;
    }
  }
  // Un passe-bas d'un pôle (adoucit les carrés), puis on normalise.
  let y = 0;
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    y += (out[i] - y) * 0.45;
    out[i] = y;
    peak = Math.max(peak, Math.abs(y));
  }
  const k = peak ? 0.8 / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}

function wav(samples: Float32Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return b;
}

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'pokhades-midi-'));
for (const [slug, mid] of new Map(Object.values(BIOME_TRACKS).map((t) => [t.slug, t.mid] as const))) {
  const src = path.join(BGM, mid);
  if (!fs.existsSync(src)) {
    console.warn(`absent : ${src}`);
    continue;
  }
  const notes = parseMidi(fs.readFileSync(src));
  const w = path.join(tmp, `${slug}.wav`);
  fs.writeFileSync(w, wav(synth(notes)));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', w, '-c:a', 'libmp3lame', '-q:a', '5', path.join(OUT, `${slug}.mp3`)]);
  console.log(`${mid} → music/${slug}.mp3 (${notes.length} notes)`);
}
fs.rmSync(tmp, { recursive: true, force: true });
