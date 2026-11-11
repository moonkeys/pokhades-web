import { dexOf } from '../data/megas';
import { animFile, CRY_FALLBACK, cryPath, MUSIC, moveSoundFile, SOUNDS, servedPath, TYPE_SOUNDS, type MusicId, type SoundId } from './sounds';

// Moteur audio (Sfx.gd du jeu Godot) : des bruitages qui se chevauchent sans
// se couper, et une seule musique à la fois. Web Audio plutôt que des
// <audio> : un pool de lecteurs HTML coupe ou retarde les sons rapprochés,
// et la hauteur aléatoire (jitter) y est approximative.
//
// Le navigateur interdit le son avant un geste du joueur : le contexte naît
// suspendu et reprend à la première touche ou au premier clic. Une musique
// demandée avant (le Repaire au chargement) attend ce moment pour partir.
//
// Tout échoue en silence : fichier absent (import-assets pas relancé),
// format non décodé par le navigateur, Web Audio indisponible. Le jeu reste
// jouable sans un son.

/** Réglages du joueur, 0..1 (mémorisés avec les options, ui/options.ts). */
export interface Volumes {
  music: number;
  sfx: number;
  muted: boolean;
}

/**
 * Même son relancé à moins de cet intervalle : ignoré. Une vague entière
 * balayée d'un coup de zone déclencherait sinon dix « hit » dans la même
 * image, un seul bruit saturé.
 */
const MIN_GAP = 0.04;
/**
 * Cris rapprochés : un seul à la fois par fenêtre. Une vague balayée ferait
 * sinon hurler six sauvages ensemble.
 */
const CRY_GAP = 0.18;
/** Sons d'attaque : même règle, une capacité par fenêtre et par fichier. */
const MOVE_GAP = 0.07;
/** Fondu entre deux musiques (s). */
const MUSIC_FADE = 0.8;

const dbToGain = (db: number) => Math.pow(10, db / 20);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly lastPlayed = new Map<string, number>();
  private music: { id: MusicId; src: AudioBufferSourceNode | null; gain: GainNode } | null = null;
  private wanted: MusicId | null = null;
  private volumes: Volumes = { music: 0.7, sfx: 0.8, muted: false };

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      const ctx = this.context();
      if (ctx?.state === 'suspended') void ctx.resume();
    };
    addEventListener('keydown', unlock);
    addEventListener('pointerdown', unlock);
    // Onglet caché (ou app mise en arrière-plan sur téléphone) : le son se coupe, et reprend au retour
    // (retour de test : « quand on n'est pas sur l'onglet, ça coupe la musique »). Le jeu, lui, continue
    // de tourner : en ligne, il ne faut pas lâcher les autres joueurs.
    document.addEventListener('visibilitychange', () => {
      const ctx = this.ctx;
      if (!ctx) return;
      if (document.hidden) void ctx.suspend();
      else void ctx.resume();
    });
  }

  /** Le contexte, créé au premier besoin (null si Web Audio manque). */
  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(ctx.destination);
    this.musicBus.connect(ctx.destination);
    this.applyVolumes();
    // La musique demandée avant le premier geste part dès que le contexte tourne.
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running' && this.wanted && !this.music?.src) this.startMusic(this.wanted);
    });
    return ctx;
  }

  setVolumes(v: Volumes): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const { music, sfx, muted } = this.volumes;
    // Courbe quadratique : la moitié du curseur sonne comme la moitié du volume.
    if (this.sfxBus) this.sfxBus.gain.value = muted ? 0 : sfx * sfx;
    if (this.musicBus) this.musicBus.gain.value = muted ? 0 : music * music;
  }

  /** Charge un fichier source (chemin du dépôt Godot) ; `served` : chemin servi déjà connu (les cris). */
  private load(file: string, served = servedPath(file)): Promise<AudioBuffer | null> {
    let p = this.buffers.get(served);
    if (p) return p;
    const ctx = this.context();
    const url = `/game/${served.split('/').map(encodeURIComponent).join('/')}`;
    p = !ctx
      ? Promise.resolve(null)
      : fetch(url)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((data) => ctx.decodeAudioData(data))
          .catch(() => null);
    this.buffers.set(served, p);
    return p;
  }

  /** Précharge les bruitages : le premier coup ne doit pas attendre son fichier. */
  preload(): void {
    for (const def of Object.values(SOUNDS)) for (const f of def.files) void this.load(f);
    // Les sons de type aussi (≈ 40 fichiers courts) ; ceux propres à une capacité se chargent à leur premier emploi.
    for (const pool of Object.values(TYPE_SOUNDS)) for (const n of pool) void this.load(animFile(n));
  }

  /** Le contexte s'il peut jouer un bruitage maintenant (null : muet, verrouillé, absent). */
  private ready(): AudioContext | null {
    const ctx = this.context();
    return ctx && ctx.state === 'running' && !this.volumes.muted && this.volumes.sfx > 0 ? ctx : null;
  }

  /** Vrai si `key` a déjà joué il y a moins de `gap` s (sinon le note comme joué maintenant). */
  private throttled(ctx: AudioContext, key: string, gap: number): boolean {
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(key) ?? -1) < gap) return true;
    this.lastPlayed.set(key, now);
    return false;
  }

  private start(ctx: AudioContext, buf: AudioBuffer, db: number, rate: number): void {
    if (!this.sfxBus) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = dbToGain(db);
    src.connect(gain).connect(this.sfxBus);
    src.start();
  }

  /** Joue un bruitage ; `db` s'ajoute au volume du catalogue, `rate` change la hauteur (un compagnon sonne plus bas que le Pokémon joué). */
  play(id: SoundId, db = 0, rate = 1): void {
    const ctx = this.ready();
    const def: { files: readonly string[]; db: number; jitter: number; gap?: number } = SOUNDS[id];
    if (!ctx || this.throttled(ctx, id, def.gap ?? MIN_GAP)) return;
    const file = def.files[Math.floor(Math.random() * def.files.length)];
    void this.load(file).then((buf) => buf && this.start(ctx, buf, def.db + db, rate * (1 + (Math.random() * 2 - 1) * def.jitter)));
  }

  /** Son d'une capacité (type + nom pokeapi), joué avec son animation. */
  playMove(type: string, move?: string, db = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const name = moveSoundFile(type, move);
    if (this.throttled(ctx, `anim:${name}`, MOVE_GAP)) return;
    void this.load(animFile(name)).then((buf) => buf && this.start(ctx, buf, -12 + db, 1 + (Math.random() * 2 - 1) * 0.05));
  }

  /**
   * Cri d'une espèce (numéro de Pokédex). `rate` < 1 : plus grave, comme le
   * cri d'un Pokémon qui tombe dans les jeux. Espèce sans cri (générations 6
   * et plus) : un son neutre, encore plus grave.
   */
  cry(speciesId: number, db = 0, rate = 1): void {
    // Une Méga crie comme sa forme de base (pas de cri à elle dans Essentials).
    speciesId = dexOf(speciesId);
    const ctx = this.ready();
    if (!ctx || this.throttled(ctx, 'cry', CRY_GAP)) return;
    void this.load(cryPath(speciesId), cryPath(speciesId)).then((buf) => {
      if (buf) return this.start(ctx, buf, -8 + db, rate);
      void this.load(animFile(CRY_FALLBACK)).then((b) => b && this.start(ctx, b, -14 + db, rate * 0.8));
    });
  }

  /** Change de musique (fondu) ; la même déjà en cours continue sans reprendre au début. null : silence. */
  playMusic(id: MusicId | null): void {
    if (this.wanted === id) return;
    this.wanted = id;
    this.stopMusic();
    if (id) this.startMusic(id);
  }

  private stopMusic(): void {
    const m = this.music;
    const ctx = this.ctx;
    this.music = null;
    if (!m || !ctx) return;
    const t = ctx.currentTime;
    m.gain.gain.setValueAtTime(m.gain.gain.value, t);
    m.gain.gain.linearRampToValueAtTime(0, t + MUSIC_FADE);
    m.src?.stop(t + MUSIC_FADE);
  }

  private startMusic(id: MusicId): void {
    const ctx = this.context();
    if (!ctx || !this.musicBus) return;
    const def = MUSIC[id];
    const gain = ctx.createGain();
    gain.connect(this.musicBus);
    const entry: { id: MusicId; src: AudioBufferSourceNode | null; gain: GainNode } = { id, src: null, gain };
    this.music = entry;
    // Contexte encore suspendu : statechange relancera startMusic au premier geste.
    if (ctx.state !== 'running') {
      void this.load(def.file, def.served);
      return;
    }
    void this.load(def.file, def.served).then((buf) => {
      // Entre-temps, une autre musique a été demandée : on ne joue pas celle-ci.
      if (!buf || this.music !== entry) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(dbToGain(def.db), t + MUSIC_FADE);
      src.connect(gain);
      src.start();
      entry.src = src;
    });
  }
}

/** Le moteur, unique, comme l'autoload Sfx du jeu. */
export const audio = new AudioEngine();
export const sfx = (id: SoundId, db = 0, rate = 1): void => audio.play(id, db, rate);
export const moveSfx = (type: string, move?: string, db = 0): void => audio.playMove(type, move, db);
export const cry = (speciesId: number, db = 0, rate = 1): void => audio.cry(speciesId, db, rate);
