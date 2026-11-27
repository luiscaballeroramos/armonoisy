const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "assets", "practice_player.js"), "utf8")
  .replace("export default function (", "function mountPracticePlayer(");
const audioFiles = [
  "Hohner-Special20_Normal_C4.wav",
  "Hohner-Special20_Normal_E4.wav",
  "Hohner-Special20_Normal_G4.wav",
  "Hohner-Special20_Normal_C5.wav",
  "Cabral-HarpBb_Draw_F4.wav",
  "Cabral-HarpBb_Draw_A4.wav",
];
const measuredHz = [523.249, 658.952, 783.439, 1045.204, 353.6, 445.6];
const pianoFiles = [
  "GPiano_sus_C3_v3_rr1_Player.wav", "GPiano_sus_C4_v3_rr1_Player.wav",
  "GPiano_sus_C5_v3_rr1_Player.wav", "GPiano_sus_C6_v3_rr1_Player.wav",
];
const bassFiles = ["E1.flac", "A1.flac", "C2.flac", "Dsharp2.flac"];
const allAudioFiles = [...audioFiles, ...pianoFiles, ...bassFiles];
const allMeasuredHz = [...measuredHz, 260.75, 523.61, 1045.96, 2093.68, 40.956, 55.363, 65.295, 77.556];

function fakeBuffer(channels, length, sampleRate, marker = 0) {
  const data = Array.from({length: channels}, () => new Float32Array(length).fill(marker));
  return {
    numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
    getChannelData: (channel) => data[channel],
  };
}

function fakeParam() {
  return {
    value: 0,
    setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    setTargetAtTime(value) { this.value = value; },
  };
}

function fakeGuide() {
  const holes = Array.from({length: 10}, (_, index) => {
    const classes = new Set();
    const attributes = {};
    return {
      dataset: {hole: String(index + 1)}, textContent: String(index + 1), attributes, classes,
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
      },
      setAttribute: (name, value) => { attributes[name] = value; },
      removeAttribute: (name) => { delete attributes[name]; },
    };
  });
  const attributes = {"aria-label": "Guía de armónica C"};
  return {
    holes, attributes, dataset: {baseLabel: attributes["aria-label"]},
    getAttribute: (name) => attributes[name],
    setAttribute: (name, value) => { attributes[name] = value; },
    querySelectorAll: () => holes,
    querySelector: (selector) => holes[Number(/\[data-hole="(\d+)"\]/.exec(selector)?.[1]) - 1],
  };
}

function harness({failedFile = null, delayedFile = null} = {}) {
  const requests = [];
  const requestUrls = [];
  const contexts = [];
  const frames = new Map();
  const guide = fakeGuide();
  let intervalCallback = null;
  let nextFrame = 0;
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let unavailable = failedFile;
  class AudioContext {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.destination = {};
      this.sources = [];
      this.clicks = [];
      this.gains = [];
      contexts.push(this);
    }
    createBuffer(channels, length, sampleRate) {
      return fakeBuffer(channels, length, sampleRate);
    }
    async decodeAudioData({filename}) {
      const marker = (allAudioFiles.indexOf(filename) + 1) / 16;
      return fakeBuffer(1, 4000, 1000, marker);
    }
    createGain() {
      const gain = {gain: fakeParam(), connect() {}};
      this.gains.push(gain);
      return gain;
    }
    createBufferSource() {
      const source = {
        playbackRate: fakeParam(), connect() {}, addEventListener() {}, stopTimes: [], loop: false,
        start(time) { this.startTime = time; },
        stop(time) { this.stopTimes.push(time); },
      };
      this.sources.push(source);
      return source;
    }
    createOscillator() {
      const context = this;
      return {
        frequency: fakeParam(), connect() {}, addEventListener() {},
        start(time) {
          context.clicks.push({time, scheduledAt: context.currentTime, frequency: this.frequency.value});
        },
        stop() {},
      };
    }
    addEventListener() {}
    async close() { this.state = "closed"; }
  }
  const document = {
    querySelector: (selector) => selector === ".practice-holes" ? guide : null,
    addEventListener() {}, removeEventListener() {},
  };
  const sandbox = {
    window: {AudioContext, addEventListener() {}, removeEventListener() {}},
    document,
    fetch: async (url) => {
      const filename = url.split("/").pop();
      requests.push(filename);
      requestUrls.push(url);
      if (filename === delayedFile) await waiting;
      const relativePath = url.replace(/^app\/static\//, "").split("/");
      const missing = filename === unavailable
        || !fs.existsSync(path.join(root, "static", ...relativePath));
      return {ok: !missing, status: missing ? 404 : 200, arrayBuffer: async () => ({filename})};
    },
    setTimeout: (callback) => setTimeout(callback, 0), clearTimeout,
    setInterval: (callback) => { intervalCallback = callback; return 1; },
    clearInterval: () => { intervalCallback = null; },
    requestAnimationFrame: (callback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  vm.runInNewContext(`${script}\nthis.playerTests = {createInstance, loadHarmonicaSamples};`, sandbox);
  return {
    ...sandbox.playerTests, AudioContext, contexts, requests, requestUrls, guide,
    makeAvailable() { unavailable = null; },
    release() { release(); },
    tick() {
      assert.ok(intervalCallback, "scheduler is not running");
      intervalCallback();
    },
    advance(time) {
      contexts.forEach((context) => { context.currentTime = time; });
      const callbacks = Array.from(frames.values());
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

function controls() {
  const buttons = Object.fromEntries(
    ["play", "pause", "stop", "preview", "continue-without-melody"].map((action) => [
      action,
      {
        textContent: action, hidden: false, disabled: false, listeners: {},
        addEventListener(type, listener) { this.listeners[type] = listener; },
        removeEventListener() {},
      },
    ]),
  );
  const status = {textContent: "", classList: {toggle() {}}};
  return {
    buttons, status,
    parent: {
      querySelector(selector) {
        if (selector === ".player-status") return status;
        const action = /\[data-action="([^"]+)"\]/.exec(selector)?.[1];
        return buttons[action];
      },
    },
  };
}

function config(melodyEvents = []) {
  return {
    tempo: 120, startMeasure: 1, endMeasure: 1, measureCount: 1, meter: "4/4",
    measures: [4], measureEvents: [[4]], metronomeEnabled: false, volume: 0.75,
    countInEnabled: false, melodyEnabled: melodyEvents.length > 0, melodyVolume: 0.6,
    pianoEnabled: false, pianoVolume: 0.6, bassEnabled: false, bassVolume: 0.6,
    melodyEvents,
  };
}

function marker(source) {
  return Math.round(source.buffer.getChannelData(0)[0] * 16) - 1;
}

function assertPitch(source, targetHz) {
  const frequency = allMeasuredHz[marker(source)] * source.playbackRate.value;
  const cents = 1200 * Math.log2(frequency / targetHz);
  assert.ok(Math.abs(cents) < 3, `${frequency} Hz instead of ${targetHz} Hz (${cents} cents)`);
}

function measureSample(filename, expectedHz, instrument = "harmonica", toleranceCents = 5) {
  const file = fs.readFileSync(path.join(root, "static", instrument, filename));
  assert.equal(file.toString("ascii", 0, 4), "RIFF");
  assert.equal(file.toString("ascii", 8, 12), "WAVE");
  let format, data;
  for (let offset = 12; offset + 8 <= file.length;) {
    const name = file.toString("ascii", offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    if (name === "fmt ") format = offset + 8;
    if (name === "data") data = offset + 8;
    offset += 8 + size + size % 2;
  }
  assert.ok(format && data, `Invalid WAV: ${filename}`);
  assert.equal(file.readUInt16LE(format), 1);
  const channels = file.readUInt16LE(format + 2);
  assert.equal(channels, instrument === "piano" ? 2 : 1);
  const sampleRate = file.readUInt32LE(format + 4);
  const bytesPerSample = file.readUInt16LE(format + 14) / 8;
  assert.ok(bytesPerSample === 2 || bytesPerSample === 3);
  const sample = (frame) => file.readIntLE(data + frame * channels * bytesPerSample, bytesPerSample)
    / 2 ** (8 * bytesPerSample - 1);
  const length = Math.floor(sampleRate * 0.5);
  const start = Math.floor(sampleRate * 0.4);
  const weighted = new Float64Array(length);
  let squared = 0, weightSum = 0;
  for (let i = 0; i < length; i += 1) {
    const value = sample(start + i);
    const weight = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1));
    weighted[i] = value * weight;
    squared += value * value;
    weightSum += weight;
  }
  let bestHz = 0, bestEnergy = 0;
  for (let hz = expectedHz * 0.97; hz <= expectedHz * 1.03; hz += 0.2) {
    const coefficient = 2 * Math.cos(2 * Math.PI * hz / sampleRate);
    let previous = 0, before = 0;
    for (const value of weighted) {
      const current = value + coefficient * previous - before;
      before = previous;
      previous = current;
    }
    const energy = previous ** 2 + before ** 2 - coefficient * previous * before;
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestHz = hz;
    }
  }
  const amplitude = 2 * Math.sqrt(bestEnergy) / weightSum;
  assert.ok(amplitude > Math.sqrt(squared / length) * 0.2, `${filename}: missing fundamental`);
  assert.ok(Math.abs(1200 * Math.log2(bestHz / expectedHz)) < toleranceCents, `${filename}: ${bestHz} Hz`);
  if (filename.startsWith("Cabral-")) {
    let onsetSquared = 0;
    const onsetLength = Math.floor(sampleRate * 0.04);
    for (let i = 0; i < onsetLength; i += 1) onsetSquared += sample(i) ** 2;
    assert.ok(Math.sqrt(onsetSquared / onsetLength) > 0.005, `${filename}: silent attack`);
  }
}

test("the actual samples have the intended fundamentals and draw attacks", () => {
  audioFiles.forEach((filename, index) => measureSample(filename, measuredHz[index]));
});

test("the piano sample fundamentals match their measured octaves", () => {
  pianoFiles.forEach((filename, index) => measureSample(filename, allMeasuredHz[index + 6], "piano", 12));
});

test("melody selects the correct octave and airflow, with no tab using a blow sample", async () => {
  const h = harness();
  const ui = controls();
  const events = [
    {pitch: "C5", hole: 4, blow: true},
    {pitch: "D5", hole: 4, blow: false},
    {pitch: "D5", hole: null, blow: false},
    {pitch: "G4", hole: 2, blow: false},
  ].map((event, eventIndex) => ({
    ...event, eventIndex, measureNumber: 1, startBeats: 0, durationBeats: 1,
  }));
  h.createInstance(ui.parent, config(events), () => {});
  await new Promise(setImmediate);
  assert.equal(ui.buttons.play.disabled, false, ui.status.textContent);
  ui.buttons.play.listeners.click();
  await new Promise(setImmediate);
  const sources = h.contexts[0].sources;
  assert.equal(sources.length, 4, ui.status.textContent);
  assert.equal(marker(sources[0]), 0);
  assert.equal(marker(sources[1]), 5);
  assert.ok(marker(sources[2]) >= 0 && marker(sources[2]) < 4);
  assert.equal(marker(sources[3]), 4);
  assertPitch(sources[0], 523.251);
  assertPitch(sources[1], 587.330);
  assertPitch(sources[2], 587.330);
  assertPitch(sources[3], 391.995);
});

test("preview plays and highlights all draw holes, then all blow holes", async () => {
  const h = harness();
  const ui = controls();
  h.createInstance(ui.parent, config(), () => {});
  await ui.buttons.preview.listeners.click();
  const sources = h.contexts[0].sources;
  assert.equal(sources.length, 20, ui.status.textContent);
  const expected = [
    [4, 293.665, "D4"], [4, 391.995, "G4"], [5, 493.883, "B4"],
    [5, 587.330, "D5"], [5, 698.456, "F5"], [5, 880, "A5"],
    [5, 987.767, "B5"], [5, 1174.659, "D6"], [5, 1396.913, "F6"],
    [5, 1760, "A6"], [0, 261.626, "C4"], [0, 329.628, "E4"],
    [0, 391.995, "G4"], [0, 523.251, "C5"], [1, 659.255, "E5"],
    [2, 783.991, "G5"], [3, 1046.502, "C6"], [3, 1318.510, "E6"],
    [3, 1567.982, "G6"], [3, 2093.005, "C7"],
  ];
  assert.equal(ui.buttons.stop.disabled, false);
  assert.match(ui.status.textContent, /Probando/);
  expected.forEach(([sample, frequency, pitch], index) => {
    assert.equal(marker(sources[index]), sample);
    assertPitch(sources[index], frequency);
    h.advance(sources[index].startTime + 0.01);
    const active = h.guide.holes.filter((hole) => hole.classes.has("active"));
    assert.equal(active.length, 1, `note ${index}`);
    assert.equal(active[0].dataset.hole, String(index % 10 + 1));
    assert.equal(active[0].attributes["data-pitch"], pitch);
    assert.ok(active[0].classes.has(index < 10 ? "draw" : "blow"));
    h.advance(sources[index].stopTimes[0] + 0.01);
    assert.equal(h.guide.holes.filter((hole) => hole.classes.has("active")).length, 0);
  });
  h.advance(sources[0].startTime + 20 * 0.55 + 0.01);
  assert.equal(ui.buttons.preview.disabled, false);
  assert.equal(ui.buttons.stop.disabled, true);
  assert.match(ui.status.textContent, /completada/);
});

test("stopping the preview clears the guide and cancels all remaining notes", async () => {
  const h = harness();
  const ui = controls();
  h.createInstance(ui.parent, config(), () => {});
  await ui.buttons.preview.listeners.click();
  const sources = h.contexts[0].sources;
  h.advance(sources[0].startTime + 0.01);
  assert.equal(ui.buttons.stop.disabled, false);
  assert.ok(h.guide.holes[0].classes.has("draw"));
  ui.buttons.stop.listeners.click();
  assert.equal(ui.buttons.preview.disabled, false);
  assert.equal(ui.buttons.stop.disabled, true);
  assert.equal(h.guide.holes.filter((hole) => hole.classes.has("active")).length, 0);
  assert.ok(sources.every((source) => source.stopTimes.length === 2));
  h.advance(sources[0].startTime + 5);
  assert.equal(h.guide.holes.filter((hole) => hole.classes.has("active")).length, 0);
});

test("stopping while samples load does not start a late preview", async () => {
  const h = harness({delayedFile: "Cabral-HarpBb_Draw_A4.wav"});
  const ui = controls();
  h.createInstance(ui.parent, config(), () => {});
  const loading = ui.buttons.preview.listeners.click();
  await new Promise(setImmediate);
  assert.equal(ui.buttons.stop.disabled, false);
  ui.buttons.stop.listeners.click();
  h.release();
  await loading;
  assert.equal(h.contexts[0].sources.length, 0);
  assert.equal(ui.buttons.preview.disabled, false);
  assert.equal(h.guide.holes.filter((hole) => hole.classes.has("active")).length, 0);
});

test("preview takes guide priority over playback and restores the current song note", async () => {
  const h = harness();
  const ui = controls();
  const event = {
    pitch: "C5", hole: 4, blow: true, eventIndex: 0, measureNumber: 1,
    startBeats: 0, durationBeats: 4,
  };
  const instance = h.createInstance(ui.parent, config([event]), () => {});
  await new Promise(setImmediate);
  ui.buttons.play.listeners.click();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(h.guide.holes[3].classes.has("active"));
  await ui.buttons.preview.listeners.click();
  const firstPreview = h.contexts[0].sources[1];
  h.advance(firstPreview.startTime + 0.01);
  assert.ok(h.guide.holes[0].classes.has("draw"));
  instance.update(config([event]));
  assert.ok(h.guide.holes[0].classes.has("draw"));
  h.advance(firstPreview.startTime + 20 * 0.55 + 0.01);
  assert.ok(h.guide.holes[3].classes.has("blow"));
  assert.equal(h.guide.holes[3].attributes["data-pitch"], "C5");
});

test("pausing playback also stops the preview and clears its highlight", async () => {
  const h = harness();
  const ui = controls();
  const event = {
    pitch: "C5", hole: 4, blow: true, eventIndex: 0, measureNumber: 1,
    startBeats: 0, durationBeats: 4,
  };
  h.createInstance(ui.parent, config([event]), () => {});
  await new Promise(setImmediate);
  ui.buttons.play.listeners.click();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await ui.buttons.preview.listeners.click();
  const previewSources = h.contexts[0].sources.slice(1);
  h.advance(previewSources[0].startTime + 0.01);
  assert.ok(h.guide.holes[0].classes.has("draw"));
  ui.buttons.pause.listeners.click();
  assert.equal(ui.buttons.preview.disabled, false);
  assert.ok(previewSources.every((source) => source.stopTimes.length === 2));
  assert.equal(h.guide.holes.filter((hole) => hole.classes.has("active")).length, 0);
  h.advance(previewSources[0].startTime + 5);
  assert.equal(h.guide.holes.filter((hole) => hole.classes.has("active")).length, 0);
});

test("a missing draw sample is reported and the next load can retry", async () => {
  const missing = "Cabral-HarpBb_Draw_A4.wav";
  const h = harness({failedFile: missing});
  const context = new h.AudioContext();
  await assert.rejects(h.loadHarmonicaSamples(context), /Cabral-HarpBb_Draw_A4\.wav: HTTP 404/);
  h.makeAvailable();
  await h.loadHarmonicaSamples(context);
  assert.equal(h.requests.filter((name) => name === missing).length, 2);
});

test("all instruments load samples relative to the Streamlit app path", async () => {
  const h = harness();
  const ui = controls();
  const event = {
    pitch: "C5", hole: 4, blow: true, eventIndex: 0, measureNumber: 1,
    startBeats: 0, durationBeats: 1,
  };
  h.createInstance(ui.parent, {
    ...config([event]), pianoEnabled: true, bassEnabled: true,
  }, () => {});
  await new Promise(setImmediate);
  assert.equal(h.requestUrls.length, audioFiles.length + pianoFiles.length + bassFiles.length);
  for (const url of h.requestUrls) {
    assert.match(url, /^app\/static\/(harmonica|piano|bass)\//);
    assert.ok(new URL(url, "https://example.test/~/+/").pathname.startsWith("/~/+/app/static/"));
    assert.ok(new URL(url, "http://localhost:8501/").pathname.startsWith("/app/static/"));
  }
});

test("piano and bass play the score together without requiring harmonica samples", async () => {
  const h = harness();
  const ui = controls();
  const events = [
    {pitch: "C5", hole: 4, blow: true, startBeats: 0},
    {pitch: "C6", hole: 7, blow: true, startBeats: 2},
  ].map((event, eventIndex) => ({
    ...event, eventIndex, measureNumber: 1, durationBeats: 2,
  }));
  const data = {...config(events), melodyEnabled: false, pianoEnabled: true, bassEnabled: true};
  h.createInstance(ui.parent, data, () => {});
  await new Promise(setImmediate);
  assert.equal(ui.buttons.play.disabled, false, ui.status.textContent);
  assert.ok(audioFiles.every((filename) => !h.requests.includes(filename)));
  ui.buttons.play.listeners.click();
  await new Promise(setImmediate);
  const context = h.contexts[0];
  assert.equal(context.sources.length, 2);
  const [piano, bass] = context.sources;
  assert.equal(piano.startTime, bass.startTime);
  assert.equal(marker(piano), 7);
  assert.equal(marker(bass), 12);
  assertPitch(piano, 523.251);
  assertPitch(bass, 65.406);
  assert.equal(piano.loop, false);
  assert.equal(bass.loop, false);
  h.advance(1);
  h.tick();
  assert.equal(context.sources.length, 4);
  assertPitch(context.sources[2], 1046.502);
  assertPitch(context.sources[3], 130.813);
  assert.equal(context.sources[2].startTime, context.sources[3].startTime);
  ui.buttons.stop.listeners.click();
  assert.ok(context.sources.every((source) => source.stopTimes.length === 2));
});

test("instrument volume and mute are independent; pause and resume keep the other voices", async () => {
  const h = harness();
  const ui = controls();
  const note = {
    pitch: "C5", hole: 4, blow: true, eventIndex: 0, measureNumber: 1,
    startBeats: 0, durationBeats: 4,
  };
  const data = {...config([note]), pianoEnabled: true, bassEnabled: true};
  const instance = h.createInstance(ui.parent, data, () => {});
  await new Promise(setImmediate);
  ui.buttons.play.listeners.click();
  await new Promise(setImmediate);
  const context = h.contexts[0];
  const [harmonica, piano, bass] = context.sources;
  assert.equal(context.gains[2].gain.value, 0.6);
  assert.equal(context.gains[3].gain.value, 0.12);
  h.advance(0.06);
  instance.update({...data, pianoVolume: 0.3});
  assert.equal(context.gains[2].gain.value, 0.3);
  assert.ok(context.sources.every((source) => source.stopTimes.length === 1));
  instance.update({...data, pianoVolume: 0.3, bassEnabled: false});
  assert.equal(context.gains[3].gain.value, 0);
  assert.equal(bass.stopTimes.length, 2);
  assert.equal(harmonica.stopTimes.length, 1);
  assert.equal(piano.stopTimes.length, 1);
  h.advance(0.35);
  ui.buttons.pause.listeners.click();
  assert.equal(harmonica.stopTimes.length, 2);
  assert.equal(piano.stopTimes.length, 2);
  ui.buttons.play.listeners.click();
  await new Promise(setImmediate);
  assert.equal(context.sources.length, 5);
  assertPitch(context.sources[3], 523.251);
  assertPitch(context.sources[4], 523.251);
  assert.ok(context.sources[3].startTime > 0.35);
  assert.equal(context.sources[3].startTime, context.sources[4].startTime);
});

test("enabling piano during playback adds it at the next loop without stopping the harmonica", async () => {
  const h = harness();
  const ui = controls();
  const events = [
    {pitch: "C5", hole: 4, blow: true, startBeats: 0},
    {pitch: "E5", hole: 5, blow: true, startBeats: 2},
  ].map((event, eventIndex) => ({
    ...event, eventIndex, measureNumber: 1, durationBeats: 2,
  }));
  const data = config(events);
  const instance = h.createInstance(ui.parent, data, () => {});
  await new Promise(setImmediate);
  ui.buttons.play.listeners.click();
  await new Promise(setImmediate);
  const context = h.contexts[0];
  h.advance(0.06);
  instance.update({...data, pianoEnabled: true});
  await new Promise(setImmediate);
  h.advance(1);
  h.tick();
  assert.equal(context.sources.length, 2);
  assertPitch(context.sources[1], 659.255);
  h.advance(2);
  h.tick();
  assert.equal(context.sources.length, 4);
  assertPitch(context.sources[2], 523.251);
  assertPitch(context.sources[3], 523.251);
  assert.equal(context.sources[2].startTime, context.sources[3].startTime);
  ui.buttons.stop.listeners.click();
});

test("a failed bass load is reported, can be skipped, and can be retried", async () => {
  const h = harness({failedFile: "C2.flac"});
  const ui = controls();
  const note = {
    pitch: "C5", hole: 4, blow: true, eventIndex: 0, measureNumber: 1,
    startBeats: 0, durationBeats: 4,
  };
  const data = {...config([note]), pianoEnabled: true, bassEnabled: true};
  const instance = h.createInstance(ui.parent, data, () => {});
  await new Promise(setImmediate);
  assert.match(ui.status.textContent, /bajo: C2\.flac: HTTP 404/);
  assert.equal(ui.buttons.play.disabled, true);
  assert.equal(ui.buttons["continue-without-melody"].hidden, false);
  ui.buttons["continue-without-melody"].listeners.click();
  assert.equal(ui.buttons.play.disabled, false);
  assert.match(ui.status.textContent, /Se omite bajo/);
  ui.buttons.play.listeners.click();
  await new Promise(setImmediate);
  assert.equal(h.contexts[0].sources.length, 2);
  h.advance(0.06);
  h.makeAvailable();
  instance.update({...data, bassEnabled: false});
  instance.update(data);
  await new Promise(setImmediate);
  assert.equal(h.requests.filter((filename) => filename === "C2.flac").length, 2);
  h.advance(2);
  h.tick();
  assert.equal(h.contexts[0].sources.length, 5);
  assertPitch(h.contexts[0].sources[4], 65.406);
});

test("a failed harmonica can be skipped without disabling piano or bass", async () => {
  const h = harness({failedFile: "Cabral-HarpBb_Draw_F4.wav"});
  const ui = controls();
  const note = {
    pitch: "C5", hole: 4, blow: true, eventIndex: 0, measureNumber: 1,
    startBeats: 0, durationBeats: 4,
  };
  const data = {...config([note]), pianoEnabled: true, bassEnabled: true};
  h.createInstance(ui.parent, data, () => {});
  await new Promise(setImmediate);
  assert.match(ui.status.textContent, /armónica en C: Cabral-HarpBb_Draw_F4\.wav: HTTP 404/);
  assert.equal(ui.buttons.play.disabled, true);
  ui.buttons["continue-without-melody"].listeners.click();
  assert.equal(ui.buttons.play.disabled, false);
  ui.buttons.play.listeners.click();
  await new Promise(setImmediate);
  assert.equal(h.contexts[0].sources.length, 2);
  assertPitch(h.contexts[0].sources[0], 523.251);
  assertPitch(h.contexts[0].sources[1], 65.406);
});

test("disabling a still-loading instrument ignores its late failure", async () => {
  const h = harness({failedFile: "C2.flac", delayedFile: "C2.flac"});
  const ui = controls();
  const note = {
    pitch: "C5", hole: 4, blow: true, eventIndex: 0, measureNumber: 1,
    startBeats: 0, durationBeats: 4,
  };
  const data = {...config([note]), bassEnabled: true};
  const instance = h.createInstance(ui.parent, data, () => {});
  await new Promise(setImmediate);
  assert.equal(ui.buttons.play.disabled, true);
  instance.update({...data, bassEnabled: false});
  h.release();
  await new Promise(setImmediate);
  assert.equal(ui.buttons.play.disabled, false);
  assert.equal(ui.buttons["continue-without-melody"].hidden, true);
  assert.doesNotMatch(ui.status.textContent, /No se pudo cargar/);
  ui.buttons.play.listeners.click();
  await new Promise(setImmediate);
  assert.equal(h.contexts[0].sources.length, 1);
  assertPitch(h.contexts[0].sources[0], 523.251);
});

test("piano and bass share the metronome clock over 100 loops and respect tempo", async () => {
  const durations = [];
  for (const tempo of [60, 120]) {
    const h = harness();
    const ui = controls();
    const note = {
      pitch: "C5", hole: 4, blow: true, eventIndex: 0, measureNumber: 1,
      startBeats: 0, durationBeats: 4,
    };
    const data = {
      ...config([note]), tempo, metronomeEnabled: true, pianoEnabled: true, bassEnabled: true,
    };
    h.createInstance(ui.parent, data, () => {});
    await new Promise(setImmediate);
    ui.buttons.play.listeners.click();
    await new Promise(setImmediate);
    const context = h.contexts[0];
    const beatLength = 60 / tempo;
    const lastTick = Math.ceil((0.05 + 400 * beatLength) / 0.025);
    for (let tick = 1; tick <= lastTick && context.sources.length < 303; tick += 1) {
      context.currentTime = tick * 0.025;
      h.tick();
    }
    assert.equal(context.sources.length, 303);
    for (let loop = 0; loop <= 100; loop += 1) {
      const click = context.clicks[loop * 4];
      for (const source of context.sources.slice(loop * 3, loop * 3 + 3)) {
        assert.ok(Math.abs(source.startTime - click.time) < 0.001);
      }
    }
    durations.push(context.sources[1].stopTimes[0] - context.sources[1].startTime);
    ui.buttons.stop.listeners.click();
  }
  assert.ok(Math.abs(durations[0] / durations[1] - 2) < 1e-8);
});

test("count-in schedules only the metronome until the melody starts", async () => {
  const h = harness();
  const ui = controls();
  const note = {
    pitch: "C5", hole: 4, blow: true, eventIndex: 0, measureNumber: 1,
    startBeats: 0, durationBeats: 4,
  };
  const data = {
    ...config([note]), countInEnabled: true, metronomeEnabled: true,
    pianoEnabled: true, bassEnabled: true,
  };
  h.createInstance(ui.parent, data, () => {});
  await new Promise(setImmediate);
  ui.buttons.play.listeners.click();
  await new Promise(setImmediate);
  const context = h.contexts[0];
  assert.equal(context.clicks.length, 4);
  assert.equal(context.sources.length, 0);
  h.advance(2);
  h.tick();
  assert.equal(context.sources.length, 3);
  assert.ok(context.sources.every((source) => source.startTime === context.clicks[4].time));
});

test("the scheduler preserves pulse timing and accents for 100 three-measure loops", async () => {
  for (const tempo of [60, 120, 83.3]) {
    const h = harness();
    const ui = controls();
    const data = {
      ...config(), tempo, endMeasure: 3, measureCount: 3,
      measures: [4, 4, 4], measureEvents: [[4], [4], [4]], metronomeEnabled: true,
    };
    h.createInstance(ui.parent, data, () => {});
    ui.buttons.play.listeners.click();
    await new Promise(setImmediate);
    const context = h.contexts[0];
    const pulsesPerLoop = 12;
    const totalPulses = 100 * pulsesPerLoop;
    const beatLength = 60 / tempo;
    const lastTick = Math.ceil((0.05 + totalPulses * beatLength) / 0.025);
    for (let tick = 1; tick <= lastTick && context.clicks.length <= totalPulses; tick += 1) {
      context.currentTime = tick * 0.025;
      h.tick();
    }

    assert.equal(context.clicks.length, totalPulses + 1);
    const first = context.clicks[0].time;
    context.clicks.forEach((click, pulse) => {
      const error = Math.abs(click.time - (first + pulse * beatLength));
      assert.ok(error < 0.001, `${tempo} BPM, pulse ${pulse}: ${error} s`);
      assert.ok(click.time >= click.scheduledAt, `${tempo} BPM, pulse ${pulse} scheduled late`);
      assert.equal(click.frequency, pulse % 4 === 0 ? 1320 : 880);
    });
    if (tempo === 60 || tempo === 120) {
      assert.ok(Math.abs(context.clicks[pulsesPerLoop].time - first - (tempo === 60 ? 12 : 6)) < 0.001);
    }
    ui.buttons.stop.listeners.click();
  }
});
