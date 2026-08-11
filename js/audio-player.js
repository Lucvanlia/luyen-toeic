/**
 * TOEIC Audio Player Engine
 * Supports: full-part continuous play, per-question timestamp segment play,
 * speed control (0.8x–1.5x), seekbar sync, volume.
 */
class TOEICAudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.segmentEnd = null;
    this.isPlaying = false;
    this.onUpdate = null; // callback(currentTime, duration)

    this.audio.addEventListener('timeupdate', () => {
      // Stop at segment end if set
      if (this.segmentEnd !== null && this.audio.currentTime >= this.segmentEnd) {
        this.pause();
        this.segmentEnd = null;
      }
      if (this.onUpdate) this.onUpdate(this.audio.currentTime, this.audio.duration || 0);
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this._updatePlayIcon();
    });
  }

  load(src) {
    if (this.audio.src.endsWith(src)) return;
    this.audio.src = src;
    this.audio.load();
  }

  play() {
    this.audio.play()
      .then(() => { this.isPlaying = true; this._updatePlayIcon(); })
      .catch(() => {});
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this._updatePlayIcon();
  }

  toggle() { this.isPlaying ? this.pause() : this.play(); }

  /** Jump to `start` seconds, play through to `end` seconds then stop */
  playSegment(start, end) {
    this.audio.currentTime = start;
    this.segmentEnd = end;
    this.play();
  }

  seek(seconds) { this.audio.currentTime = seconds; }

  setSpeed(rate) { this.audio.playbackRate = parseFloat(rate); }

  setVolume(vol) { this.audio.volume = parseFloat(vol); }

  get duration() { return this.audio.duration || 0; }
  get currentTime() { return this.audio.currentTime; }

  _updatePlayIcon() {
    const btn = document.getElementById('audioPlayBtn');
    if (btn) btn.textContent = this.isPlaying ? '❚❚' : '▶';
  }

  static fmt(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
}

window.AP = new TOEICAudioPlayer();
