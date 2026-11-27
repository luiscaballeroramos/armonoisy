const instances = new WeakMap();
const harmonicaSamples = new WeakMap();
const accompanimentSamples = {piano: new WeakMap(), bass: new WeakMap()};
const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;
const CLICK_DURATION_SECONDS = 0.045;
const START_DELAY_SECONDS = 0.05;
// Frequencies are measured from the WAVs; VCSL labels are an octave lower.
const HARMONICA_SAMPLE_FILES = {
  C5: {filename: "Hohner-Special20_Normal_C4.wav", frequency: 523.249, blow: true},
  E5: {filename: "Hohner-Special20_Normal_E4.wav", frequency: 658.952, blow: true},
  G5: {filename: "Hohner-Special20_Normal_G4.wav", frequency: 783.439, blow: true},
  C6: {filename: "Hohner-Special20_Normal_C5.wav", frequency: 1045.204, blow: true},
  drawF4: {filename: "Cabral-HarpBb_Draw_F4.wav", frequency: 353.6, blow: false},
  drawA4: {filename: "Cabral-HarpBb_Draw_A4.wav", frequency: 445.6, blow: false},
};
const ACCOMPANIMENT_INSTRUMENTS = {
  piano: {
    label: "piano", gain: 1, transpose: 0,
    files: [
      {filename: "GPiano_sus_C3_v3_rr1_Player.wav", frequency: 260.75},
      {filename: "GPiano_sus_C4_v3_rr1_Player.wav", frequency: 523.61},
      {filename: "GPiano_sus_C5_v3_rr1_Player.wav", frequency: 1045.96},
      {filename: "GPiano_sus_C6_v3_rr1_Player.wav", frequency: 2093.68},
    ],
  },
  bass: {
    label: "bajo", gain: 0.2, transpose: -36,
    files: [
      {filename: "E1.flac", frequency: 40.956},
      {filename: "A1.flac", frequency: 55.363},
      {filename: "C2.flac", frequency: 65.295},
      {filename: "Dsharp2.flac", frequency: 77.556},
    ],
  },
};
const HARMONICA_PREVIEW_NOTES = [
  ...["D4", "G4", "B4", "D5", "F5", "A5", "B5", "D6", "F6", "A6"]
    .map((pitch, index) => ({pitch, hole: index + 1, blow: false})),
  ...["C4", "E4", "G4", "C5", "E5", "G5", "C6", "E6", "G6", "C7"]
    .map((pitch, index) => ({pitch, hole: index + 1, blow: true})),
];
const PREVIEW_NOTE_INTERVAL_SECONDS = 0.55;
const PREVIEW_NOTE_DURATION_SECONDS = 0.45;

function makeSustainedSample(context, sourceBuffer) {
  const sampleRate = sourceBuffer.sampleRate;
  const loopStartFrame = Math.floor(sampleRate * 0.18);
  const loopEndFrame = Math.floor((sourceBuffer.duration - 0.25) * sampleRate);
  const crossfadeFrames = Math.floor(sampleRate * 0.04);
  if (loopEndFrame - loopStartFrame <= crossfadeFrames * 2) {
    return {buffer: sourceBuffer, loopStart: 0, loopEnd: sourceBuffer.duration};
  }

  const buffer = context.createBuffer(
    sourceBuffer.numberOfChannels,
    sourceBuffer.length,
    sampleRate,
  );
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = sourceBuffer.getChannelData(channel);
    const output = buffer.getChannelData(channel);
    output.set(source);
    for (let frame = 0; frame < crossfadeFrames; frame += 1) {
      const fade = (frame + 1) / crossfadeFrames;
      const tailIndex = loopEndFrame - crossfadeFrames + frame;
      const headIndex = loopStartFrame + frame;
      output[tailIndex] = source[tailIndex] * (1 - fade) + source[headIndex] * fade;
    }
  }
  return {
    buffer,
    loopStart: (loopStartFrame + crossfadeFrames) / sampleRate,
    loopEnd: loopEndFrame / sampleRate,
  };
}

async function loadHarmonicaSamples(context) {
  let samplesPromise = harmonicaSamples.get(context);
  if (!samplesPromise) {
    samplesPromise = Promise.all(Object.entries(HARMONICA_SAMPLE_FILES).map(async ([pitch, definition]) => {
      const {filename, frequency, blow} = definition;
      const response = await fetch(`app/static/harmonica/${filename}`);
      if (!response.ok) {
        throw new Error(`${filename}: HTTP ${response.status}`);
      }
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      return [pitch, {...makeSustainedSample(context, buffer), frequency, blow}];
    })).then((entries) => new Map(entries));
    harmonicaSamples.set(context, samplesPromise);
  }
  try {
    return await samplesPromise;
  } catch (error) {
    harmonicaSamples.delete(context);
    throw error;
  }
}

async function loadAccompanimentSamples(context, instrument) {
  const cache = accompanimentSamples[instrument];
  let samplesPromise = cache.get(context);
  if (!samplesPromise) {
    samplesPromise = Promise.all(ACCOMPANIMENT_INSTRUMENTS[instrument].files.map(async ({filename, frequency}) => {
      const response = await fetch(`app/static/${instrument}/${filename}`);
      if (!response.ok) {
        throw new Error(`${filename}: HTTP ${response.status}`);
      }
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      return {buffer, frequency};
    }));
    cache.set(context, samplesPromise);
  }
  try {
    return await samplesPromise;
  } catch (error) {
    cache.delete(context);
    throw error;
  }
}

function midiForPitch(pitch) {
  const match = /^([A-G])([#b]?)(\d)$/.exec(pitch);
  if (!match) throw new Error(`Altura de melodía inválida: ${pitch}`);
  const noteValues = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + noteValues[match[1]] + accidental;
}

function nearestHarmonicaSample(samples, pitch, blow) {
  const frequency = 440 * 2 ** ((midiForPitch(pitch) - 69) / 12);
  let nearest = null;
  for (const [samplePitch, sample] of samples) {
    if (sample.blow !== blow) continue;
    const distance = Math.abs(Math.log2(frequency / sample.frequency));
    if (nearest === null || distance < nearest.distance) {
      nearest = {sample, distance, samplePitch};
    }
  }
  if (nearest === null) {
    throw new Error(`No hay muestras de armónica para ${blow ? "soplar" : "aspirar"}.`);
  }
  return {
    ...nearest,
    playbackRate: frequency / nearest.sample.frequency,
  };
}

function nearestAccompanimentSample(samples, pitch, transpose) {
  const frequency = 440 * 2 ** ((midiForPitch(pitch) + transpose - 69) / 12);
  let nearest = null;
  for (const sample of samples) {
    const distance = Math.abs(Math.log2(frequency / sample.frequency));
    if (nearest === null || distance < nearest.distance) {
      nearest = {sample, distance};
    }
  }
  if (nearest === null) throw new Error(`No hay muestras para la altura ${pitch}.`);
  return {...nearest, playbackRate: frequency / nearest.sample.frequency};
}

function normalizedConfig(data) {
  const volume = Number(data.volume);
  const melodyVolume = Number(data.melodyVolume);
  const pianoVolume = Number(data.pianoVolume);
  const bassVolume = Number(data.bassVolume);
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new Error("El volumen debe estar entre 0 y 100%.");
  }
  if (!Number.isFinite(melodyVolume) || melodyVolume < 0 || melodyVolume > 1) {
    throw new Error("El volumen de melodía debe estar entre 0 y 100%.");
  }
  if (!Number.isFinite(pianoVolume) || pianoVolume < 0 || pianoVolume > 1
      || !Number.isFinite(bassVolume) || bassVolume < 0 || bassVolume > 1) {
    throw new Error("Los volúmenes de piano y bajo deben estar entre 0 y 100%.");
  }
  if (typeof data.metronomeEnabled !== "boolean") {
    throw new Error("El estado del metrónomo no es válido.");
  }
  if (typeof data.countInEnabled !== "boolean") {
    throw new Error("El estado de la cuenta de entrada no es válido.");
  }
  if (typeof data.melodyEnabled !== "boolean" || !Array.isArray(data.melodyEvents)) {
    throw new Error("La configuración de la melodía guía no es válida.");
  }
  if (typeof data.pianoEnabled !== "boolean" || typeof data.bassEnabled !== "boolean") {
    throw new Error("La configuración de piano y bajo no es válida.");
  }
  const melodyEvents = data.melodyEvents.map((event) => {
    const startBeats = Number(event.startBeats);
    const durationBeats = Number(event.durationBeats);
    const hole = event.hole === null ? null : Number(event.hole);
    if (!Number.isInteger(event.measureNumber) || event.measureNumber < 1
        || !Number.isInteger(event.eventIndex) || event.eventIndex < 0
        || !Number.isFinite(startBeats) || startBeats < 0
        || !Number.isFinite(durationBeats) || durationBeats <= 0
        || (hole !== null && (!Number.isInteger(hole) || hole < 1 || hole > 10))
        || typeof event.blow !== "boolean"
        || typeof event.pitch !== "string" || !/^[A-G](?:#|b)?[0-9]$/.test(event.pitch)) {
      throw new Error("Un evento de la melodía guía no es válido.");
    }
    return {...event, startBeats, durationBeats, hole};
  });
  if (!Array.isArray(data.measures) || !Array.isArray(data.measureEvents)
      || data.measureEvents.length !== data.measures.length) {
    throw new Error("La secuencia de compases no es válida.");
  }
  const measures = data.measures.map(Number);
  const measureEvents = data.measureEvents.map((events, index) => {
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error("Un compás no contiene eventos temporales.");
    }
    const durations = events.map(Number);
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    if (durations.some((duration) => !Number.isFinite(duration) || duration <= 0)
        || !Number.isFinite(measures[index])
        || Math.abs(total - measures[index]) > 1e-8) {
      throw new Error("La duración de los eventos no coincide con su compás.");
    }
    return durations;
  });
  return {
    tempo: Number(data.tempo),
    startMeasure: Number(data.startMeasure),
    endMeasure: Number(data.endMeasure),
    measureCount: Number(data.measureCount),
    measures,
    measureEvents,
    metronomeEnabled: data.metronomeEnabled,
    volume,
    countInEnabled: data.countInEnabled,
    melodyEnabled: data.melodyEnabled,
    melodyVolume,
    pianoEnabled: data.pianoEnabled,
    pianoVolume,
    bassEnabled: data.bassEnabled,
    bassVolume,
    melodyEvents,
    supported: data.meter === "4/4" && data.measures.every((beats) => Number(beats) === 4),
  };
}

function loopBeats(config) {
  return (config.endMeasure - config.startMeasure + 1) * 4;
}

function createInstance(parentElement, data, setTriggerValue) {
  const playButton = parentElement.querySelector('[data-action="play"]');
  const pauseButton = parentElement.querySelector('[data-action="pause"]');
  const stopButton = parentElement.querySelector('[data-action="stop"]');
  const previewButton = parentElement.querySelector('[data-action="preview"]');
  const continueButton = parentElement.querySelector('[data-action="continue-without-melody"]');
  const statusElement = parentElement.querySelector(".player-status");

  let requested = normalizedConfig(data);
  let activeConfig = requested;
  let pendingConfig = null;
  let context = null;
  let masterGain = null;
  let melodyGain = null;
  let melodySamples = null;
  let melodyReady = false;
  let melodyLoading = false;
  let melodyBypassed = false;
  let melodyLoadToken = 0;
  let melodyError = null;
  const accompaniment = Object.fromEntries(
    Object.keys(ACCOMPANIMENT_INSTRUMENTS).map((name) => [name, {
      gain: null, samples: null, ready: false, loading: false,
      bypassed: false, loadToken: 0, error: null, voices: new Set(),
    }]),
  );
  let scheduler = null;
  let playbackFrame = null;
  let countInEndTime = null;
  let countInVisualsHidden = false;
  let pausedDuringCountIn = false;
  let scrollScore = null;
  let scoreScroller = null;
  let running = false;
  let paused = false;
  let pausedPosition = null;
  let cycle = null;
  let nextPulse = 0;
  let nextPulseTime = 0;
  let cycles = [];
  let voices = new Set();
  let melodyVoices = new Set();
  let guideTimers = new Set();
  let activeGuideId = null;
  let activeGuideNote = null;
  let activePlaybackEventKey = null;
  let preview = null;
  let destroyed = false;

  function positionAt(time) {
    let currentCycle = null;
    for (const item of cycles) {
      if (item.startTime <= time) currentCycle = item;
      else break;
    }
    if (!currentCycle) {
      return {measure: requested.startMeasure, pulse: 0, fraction: 0};
    }
    const elapsed = Math.max(0, (time - currentCycle.startTime) * currentCycle.config.tempo / 60);
    const total = loopBeats(currentCycle.config);
    const bounded = Math.min(elapsed, total - Number.EPSILON);
    const wholePulse = Math.floor(bounded);
    return {
      measure: currentCycle.config.startMeasure + Math.floor(wholePulse / 4),
      pulse: wholePulse % 4,
      fraction: bounded - wholePulse,
    };
  }

  function eventAt(position) {
    const durations = requested.measureEvents[position.measure - 1];
    if (!durations) return null;
    const beat = position.pulse + position.fraction;
    let startBeat = 0;
    for (let index = 0; index < durations.length; index += 1) {
      const duration = durations[index];
      if (beat < startBeat + duration || index === durations.length - 1) {
        return {measure: position.measure, index};
      }
      startBeat += duration;
    }
    return null;
  }

  function updateButtons() {
    const waitingForMelody = requested.melodyEnabled && !melodyBypassed && !melodyReady;
    const waitingForAccompaniment = Object.entries(accompaniment).some(([name, track]) =>
      requested[`${name}Enabled`] && !track.bypassed && !track.ready);
    playButton.disabled = !requested.supported
      || (running && context?.state === "running")
      || waitingForMelody || waitingForAccompaniment;
    pauseButton.disabled = !running || context?.state !== "running";
    stopButton.disabled = !running && !paused && preview === null;
    const repeatButton = document.querySelector(".practice-repeat");
    const repeatAvailable = (running && countInEndTime === null)
      || (paused && !pausedDuringCountIn && pausedPosition !== null);
    if (repeatButton) {
      repeatButton.disabled = !repeatAvailable;
      const label = repeatAvailable
        ? "Repetir el compás actual"
        : "Repetir el compás actual (disponible durante la reproducción)";
      repeatButton.setAttribute("aria-label", label);
      repeatButton.title = repeatAvailable
        ? "Repetir el compás actual"
        : "Repetir el compás actual: disponible durante la reproducción";
    }
  }

  function repeatCurrentMeasure(event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest(".practice-repeat");
    if (!button || button.disabled) return;
    const position = running && context
      ? positionAt(context.currentTime)
      : paused ? pausedPosition : null;
    if (!position || pausedDuringCountIn || countInEndTime !== null) return;
    setTriggerValue("repeat_measure", position.measure);
  }

  function setStatus(message, visible = false) {
    const failures = [];
    const loading = [];
    if (requested.melodyEnabled && !melodyBypassed) {
      if (melodyError) failures.push(`armónica en C: ${melodyError}`);
      if (melodyLoading) loading.push("armónica en C");
    }
    for (const [name, track] of Object.entries(accompaniment)) {
      if (!requested[`${name}Enabled`] || track.bypassed) continue;
      const label = ACCOMPANIMENT_INSTRUMENTS[name].label;
      if (track.error) failures.push(`${label}: ${track.error}`);
      if (track.loading) loading.push(label);
    }
    continueButton.hidden = failures.length === 0;
    previewButton.hidden = failures.length > 0;
    if (failures.length) {
      message = `No se pudo cargar ${failures.join("; ")}. Pulsa Continuar para omitir el audio afectado.`;
      visible = true;
    } else if (loading.length) {
      message = `Cargando ${loading.join(" y ")}…`;
      visible = true;
    }
    if (!requested.supported && !visible) {
      message = "Solo se admite 4/4 con cuatro negras por compás.";
      visible = true;
    }
    statusElement.classList.toggle("is-visible", visible);
    statusElement.textContent = message;
    updateButtons();
  }

  function runningStatus() {
    if (pendingConfig) {
      const changes = [];
      if (pendingConfig.tempo !== activeConfig.tempo) {
        changes.push(`${pendingConfig.tempo} BPM`);
      }
      if (pendingConfig.startMeasure !== activeConfig.startMeasure
          || pendingConfig.endMeasure !== activeConfig.endMeasure) {
        const measureRange = pendingConfig.startMeasure === pendingConfig.endMeasure
          ? `compás ${pendingConfig.startMeasure}`
          : `compases ${pendingConfig.startMeasure}–${pendingConfig.endMeasure}`;
        changes.push(measureRange);
      }
      return `Próxima vuelta: ${changes.join(" · ") || "configuración"}`;
    }
    if (requested.metronomeEnabled) return "Reproduciendo";
    if ((requested.melodyEnabled && !melodyBypassed)
        || Object.entries(accompaniment).some(([name, track]) =>
          requested[`${name}Enabled`] && !track.bypassed)) return "Solo melodía";
    return "Silenciado";
  }

  function setRunningStatus() {
    if (countInEndTime !== null && context?.currentTime < countInEndTime) {
      setStatus("Cuenta de entrada");
    } else {
      setStatus(runningStatus(), pendingConfig !== null);
    }
  }

  function updateMasterGain() {
    if (!masterGain || !context) return;
    const now = context.currentTime;
    const volume = requested.metronomeEnabled ? requested.volume : 0;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(volume, now, 0.015);
  }

  function updateMelodyGain() {
    if (!melodyGain || !context) return;
    const now = context.currentTime;
    const volume = requested.melodyEnabled && !melodyBypassed ? requested.melodyVolume : 0;
    melodyGain.gain.cancelScheduledValues(now);
    melodyGain.gain.setTargetAtTime(volume, now, 0.015);
  }

  function updateAccompanimentGains() {
    if (!context) return;
    const now = context.currentTime;
    for (const [name, track] of Object.entries(accompaniment)) {
      const volume = requested[`${name}Enabled`] && !track.bypassed
        ? requested[`${name}Volume`] * ACCOMPANIMENT_INSTRUMENTS[name].gain : 0;
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.setTargetAtTime(volume, now, 0.015);
    }
  }

  function renderActiveNote(note) {
    const guide = document.querySelector(".practice-holes");
    if (!guide) return;

    if (preview && preview.startTime !== null) note = preview.note;
    const baseLabel = guide.dataset.baseLabel || guide.getAttribute("aria-label") || "";
    for (const holeElement of guide.querySelectorAll("[data-hole]")) {
      holeElement.classList.remove("active", "blow", "draw");
      holeElement.removeAttribute("aria-current");
      holeElement.removeAttribute("data-pitch");
      holeElement.textContent = holeElement.dataset.hole;
    }

    if (!note) {
      guide.setAttribute("aria-label", baseLabel);
      return;
    }

    const direction = note.blow ? "soplar" : "aspirar";
    guide.setAttribute("aria-label", note.hole === null
      ? `${baseLabel}; nota actual ${note.pitch}`
      : `${baseLabel}; nota actual ${note.pitch}, agujero ${note.hole}, ${direction}`);
    if (!Number.isInteger(note.hole)) return;

    const holeElement = guide.querySelector(`[data-hole="${note.hole}"]`);
    if (!holeElement) return;
    holeElement.classList.add("active", note.blow ? "blow" : "draw");
    holeElement.setAttribute("aria-current", "true");
    holeElement.setAttribute("data-pitch", note.pitch);
    holeElement.textContent = `${note.hole}${note.blow ? "↑" : "↓"}`;
  }

  function setActivePlaybackEvent(event, force = false) {
    const key = event ? `${event.measure}:${event.index}` : null;
    if (key === activePlaybackEventKey && !force) return;
    activePlaybackEventKey = key;

    const score = document.querySelector(".practice-score");
    if (!score) return;
    for (const activeElement of score.querySelectorAll(".active-playback-event")) {
      activeElement.classList.remove("active-playback-event");
    }
    if (!event) return;

    const targets = score.querySelectorAll(
      `.measure-background[data-measure="${event.measure}"] > span:nth-child(${event.index + 1}), `
        + `.tabs[data-measure="${event.measure}"] > span:nth-child(${event.index + 1}), `
        + `.staff-event-marker[data-event-measure="${event.measure}"]`
        + `[data-event-index="${event.index}"]`,
    );
    for (const target of targets) target.classList.add("active-playback-event");
  }

  function renderPlaybackPosition(position, force = false) {
    if (!position) return;
    if (countInEndTime !== null && context?.currentTime < countInEndTime) {
      if (!countInVisualsHidden) {
        clearPlaybackPosition();
        countInVisualsHidden = true;
      }
      return;
    }
    const countInCompleted = countInEndTime !== null;
    countInEndTime = null;
    countInVisualsHidden = false;
    if (countInCompleted && running) setRunningStatus();
    const event = eventAt(position);
    if (!event) return;
    setActivePlaybackEvent(event, force);

    const score = document.querySelector(".practice-score");
    const ribbon = score?.querySelector(".practice-ribbon");
    const playhead = ribbon?.querySelector(".practice-playhead");
    const measure = score?.querySelector(
      `.measure-heading[data-measure="${position.measure}"]`,
    );
    if (!ribbon || !playhead || !measure) {
      if (playhead) playhead.hidden = true;
      return;
    }

    const scroller = horizontalScroller(score);
    if (!scroller) {
      playhead.hidden = true;
      return;
    }

    const viewport = scroller.getBoundingClientRect();
    playhead.hidden = false;
    const lineWidth = playhead.getBoundingClientRect().width;
    if (viewport.width <= lineWidth) {
      playhead.hidden = true;
      return;
    }
    const desiredLeft = (window.innerWidth - lineWidth) / 2;
    const signature = ribbon.querySelector(".practice-signature");
    const signatureRatio = Number(getComputedStyle(ribbon).getPropertyValue("--signature-ratio"));
    const naturalSignatureWidth = signature ? measure.getBoundingClientRect().width * signatureRatio : 0;
    // Keep the signature readable without covering the playhead on narrow screens.
    const minSignatureWidth = Math.min(64, viewport.width / 3);
    const signatureLimit = Math.max(minSignatureWidth, desiredLeft - viewport.left - 8);
    const signatureScale = naturalSignatureWidth
      ? Math.min(1, signatureLimit / naturalSignatureWidth) : 1;
    const limitValue = `${signatureLimit}px`;
    const scaleValue = `${signatureScale}`;
    if (ribbon.style.getPropertyValue("--playback-signature-limit") !== limitValue) {
      ribbon.style.setProperty("--playback-signature-limit", limitValue);
    }
    if (ribbon.style.getPropertyValue("--playback-signature-scale") !== scaleValue) {
      ribbon.style.setProperty("--playback-signature-scale", scaleValue);
    }
    const signatureWidth = signature?.getBoundingClientRect().width || 0;
    const minLeft = viewport.left + Math.min(signatureWidth, viewport.width - lineWidth);
    const maxLeft = viewport.right - lineWidth;
    const targetLeft = Math.min(maxLeft, Math.max(minLeft, desiredLeft));
    // Add enough scroll range to center even the first and last beats.
    const leadingSpace = `${Math.max(0, targetLeft - viewport.left - signatureWidth)}px`;
    const trailingSpace = `${Math.max(0, viewport.right - targetLeft)}px`;
    if (ribbon.style.getPropertyValue("--playback-leading-space") !== leadingSpace) {
      ribbon.style.setProperty("--playback-leading-space", leadingSpace);
    }
    if (ribbon.style.getPropertyValue("--playback-trailing-space") !== trailingSpace) {
      ribbon.style.setProperty("--playback-trailing-space", trailingSpace);
    }

    const measureBeats = requested.measures[position.measure - 1];
    const beat = position.pulse + position.fraction;
    const measureRect = measure.getBoundingClientRect();
    const ribbonRect = ribbon.getBoundingClientRect();
    const offset = measureRect.width * beat / measureBeats;
    const x = measureRect.left - ribbonRect.left + offset;
    playhead.style.transform = `translateX(${x}px)`;
    scroller.scrollTo({
      left: scroller.scrollLeft + measureRect.left + offset - targetLeft,
      behavior: "instant",
    });
  }

  function horizontalScroller(score) {
    if (scrollScore === score && scoreScroller?.isConnected) return scoreScroller;
    scrollScore = score;
    scoreScroller = null;
    let element = score.parentElement;
    while (element && element !== document.body) {
      const overflow = getComputedStyle(element).overflowX;
      if (overflow === "auto" || overflow === "scroll") {
        scoreScroller = element;
        break;
      }
      element = element.parentElement;
    }
    return scoreScroller;
  }

  function scrollToMeasure(measureNumber) {
    const score = document.querySelector(".practice-score");
    const measure = score?.querySelector(
      `.measure-heading[data-measure="${measureNumber}"]`,
    );
    if (!score || !measure) return;
    const scroller = horizontalScroller(score);
    if (!scroller) return;

    const viewport = scroller.getBoundingClientRect();
    const signature = score.querySelector(".practice-signature");
    const fixedWidth = signature?.getBoundingClientRect().width || 0;
    const measureLeft = measure.getBoundingClientRect().left;
    const target = scroller.scrollLeft + measureLeft - viewport.left - fixedWidth;
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    scroller.scrollTo({
      left: Math.max(0, Math.min(target, maxScroll)),
      behavior: "smooth",
    });
  }

  function clearPlaybackPosition() {
    setActivePlaybackEvent(null, true);
    const playhead = document.querySelector(".practice-playhead");
    if (playhead) playhead.hidden = true;
    const ribbon = playhead?.closest(".practice-ribbon");
    if (ribbon) {
      ribbon.style.removeProperty("--playback-leading-space");
      ribbon.style.removeProperty("--playback-trailing-space");
      ribbon.style.removeProperty("--playback-signature-limit");
      ribbon.style.removeProperty("--playback-signature-scale");
    }
  }

  function updatePlaybackFrame() {
    playbackFrame = null;
    if (destroyed || !running || !context || context.state !== "running") return;
    renderPlaybackPosition(positionAt(context.currentTime));
    playbackFrame = requestAnimationFrame(updatePlaybackFrame);
  }

  function startPlaybackFrame() {
    if (playbackFrame === null) playbackFrame = requestAnimationFrame(updatePlaybackFrame);
  }

  function stopPlaybackFrame() {
    if (playbackFrame === null) return;
    cancelAnimationFrame(playbackFrame);
    playbackFrame = null;
  }

  function restorePlaybackPosition(force = false) {
    const position = running && context
      ? positionAt(context.currentTime)
      : paused ? pausedPosition : null;
    if (!position) return;
    renderPlaybackPosition(position, force);
    requestAnimationFrame(() => {
      if (!destroyed) {
        const currentPosition = running && context
          ? positionAt(context.currentTime)
          : paused ? pausedPosition : null;
        if (currentPosition) renderPlaybackPosition(currentPosition, true);
      }
    });
  }

  function handleResize() {
    restorePlaybackPosition(true);
  }

  function scheduleGuideChange(time, note, noteId) {
    let timer;
    timer = setTimeout(() => {
      guideTimers.delete(timer);
      if (destroyed || (note === null && activeGuideId !== noteId)) return;
      activeGuideId = note === null ? null : noteId;
      activeGuideNote = note;
      renderActiveNote(note);
    }, Math.max(0, (time - context.currentTime) * 1000));
    guideTimers.add(timer);
  }

  function cancelGuideChanges() {
    const shouldClear = activeGuideId !== null || guideTimers.size > 0;
    for (const timer of guideTimers) clearTimeout(timer);
    guideTimers.clear();
    activeGuideId = null;
    activeGuideNote = null;
    if (shouldClear) renderActiveNote(null);
  }

  function cancelVoices(fromTime = 0, selected = voices) {
    if (!context) return;
    const now = context.currentTime;
    for (const voice of selected) {
      if (voice.startTime < fromTime) continue;
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(0, now);
        voice.source.stop(now + 0.005);
      } catch (error) {
        if (error.name !== "InvalidStateError") throw error;
      }
    }
  }

  function cancelMelodyVoices() {
    cancelVoices(0, melodyVoices);
  }

  function playClick(time, accent) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const peak = accent ? 0.32 : 0.21;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(accent ? 1320 : 880, time);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(peak, time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_DURATION_SECONDS);
    oscillator.connect(envelope);
    envelope.connect(masterGain);
    oscillator.start(time);
    oscillator.stop(time + CLICK_DURATION_SECONDS);
    const voice = {source: oscillator, gain: envelope, startTime: time};
    voices.add(voice);
    oscillator.addEventListener("ended", () => voices.delete(voice), {once: true});
  }

  function playMelodyNote(note, startTime, duration) {
    const sample = nearestHarmonicaSample(melodySamples, note.pitch, note.hole === null || note.blow);
    const endTime = startTime + duration;
    const source = context.createBufferSource();
    const envelope = context.createGain();
    const attack = Math.min(0.025, duration * 0.25);
    const release = Math.min(0.08, duration * 0.25);
    source.buffer = sample.sample.buffer;
    source.playbackRate.setValueAtTime(sample.playbackRate, startTime);
    source.loop = true;
    source.loopStart = sample.sample.loopStart;
    source.loopEnd = sample.sample.loopEnd;
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.linearRampToValueAtTime(1, startTime + attack);
    envelope.gain.setValueAtTime(1, Math.max(startTime + attack, endTime - release));
    envelope.gain.linearRampToValueAtTime(0.0001, endTime);
    source.connect(envelope);
    envelope.connect(melodyGain);
    const voice = {source, gain: envelope, startTime};
    voices.add(voice);
    melodyVoices.add(voice);
    source.addEventListener("ended", () => {
      voices.delete(voice);
      melodyVoices.delete(voice);
    }, {once: true});
    source.start(startTime);
    source.stop(endTime);
  }

  function playAccompanimentNote(name, note, startTime, duration) {
    const track = accompaniment[name];
    const sample = nearestAccompanimentSample(
      track.samples, note.pitch, ACCOMPANIMENT_INSTRUMENTS[name].transpose,
    );
    const endTime = startTime + duration;
    const source = context.createBufferSource();
    const envelope = context.createGain();
    const attack = Math.min(0.01, duration * 0.25);
    const release = Math.min(0.08, duration * 0.25);
    source.buffer = sample.sample.buffer;
    source.playbackRate.setValueAtTime(sample.playbackRate, startTime);
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.linearRampToValueAtTime(1, startTime + attack);
    envelope.gain.setValueAtTime(1, Math.max(startTime + attack, endTime - release));
    envelope.gain.linearRampToValueAtTime(0.0001, endTime);
    source.connect(envelope);
    envelope.connect(track.gain);
    const voice = {source, gain: envelope, startTime};
    voices.add(voice);
    track.voices.add(voice);
    source.addEventListener("ended", () => {
      voices.delete(voice);
      track.voices.delete(voice);
    }, {once: true});
    source.start(startTime);
    source.stop(endTime);
  }

  function scheduleMelodyForCycle(item, horizon) {
    const config = item.config;
    const playHarmonica = config.melodyEnabled && requested.melodyEnabled && !melodyBypassed
      && melodyReady && melodySamples;
    const playingAccompaniment = Object.entries(accompaniment)
      .filter(([name, track]) => config[`${name}Enabled`] && requested[`${name}Enabled`]
        && !track.bypassed && track.ready && track.samples)
      .map(([name]) => name);
    if (!playHarmonica && playingAccompaniment.length === 0) return;
    const beatLength = 60 / config.tempo;
    while (item.nextMelodyEvent < config.melodyEvents.length) {
      const note = config.melodyEvents[item.nextMelodyEvent];
      const noteStart = item.startTime + note.startBeats * beatLength;
      const noteEnd = noteStart + note.durationBeats * beatLength;
      if (noteStart >= horizon) break;
      const startTime = Math.max(noteStart, context.currentTime + 0.005);
      if (noteEnd > startTime) {
        const nextNote = config.melodyEvents[item.nextMelodyEvent + 1];
        const nextStart = nextNote
          ? item.startTime + nextNote.startBeats * beatLength
          : item.startTime + loopBeats(config) * beatLength
            + (config.melodyEvents[0]?.startBeats || 0) * beatLength;
        const clearAtEnd = noteEnd + 1e-6 < nextStart;
        const noteId = `${item.startTime}:${note.measureNumber}:${note.eventIndex}`;
        const duration = noteEnd - startTime;
        if (playHarmonica) playMelodyNote(note, startTime, duration);
        for (const name of playingAccompaniment) {
          playAccompanimentNote(name, note, startTime, duration);
        }
        scheduleGuideChange(startTime, {
          measure: note.measureNumber, event: note.eventIndex,
          pitch: note.pitch, hole: note.hole, blow: note.blow,
        }, noteId);
        if (clearAtEnd) scheduleGuideChange(noteEnd, null, noteId);
      }
      item.nextMelodyEvent += 1;
    }
  }

  function reportMelodyLoadError(error, token) {
    if (destroyed || token !== melodyLoadToken || !requested.melodyEnabled) return;
    melodyLoading = false;
    melodyReady = false;
    melodySamples = null;
    melodyError = error instanceof Error ? error.message : "Error desconocido";
    if (running) pause();
    setStatus("No se pudo cargar la melodía.", true);
  }

  function prepareMelody() {
    if (!requested.melodyEnabled || melodyReady || melodyLoading || melodyBypassed) return;
    melodyLoading = true;
    melodyError = null;
    const token = ++melodyLoadToken;
    updateButtons();
    if (!context) {
      try {
        makeContext();
      } catch (error) {
        reportMelodyLoadError(error, token);
        return;
      }
    }
    setStatus("Cargando melodía de armónica en C…", true);
    loadHarmonicaSamples(context).then((samples) => {
      if (destroyed || token !== melodyLoadToken) return;
      melodyLoading = false;
      melodyReady = true;
      melodySamples = samples;
      updateButtons();
      if (running) {
        setStatus("Melodía lista; se incorpora en la próxima vuelta");
      } else if (paused) {
        setStatus("Melodía lista; pulsa Play para continuar");
      } else {
        setStatus("Melodía de armónica en C lista");
      }
    }).catch((error) => reportMelodyLoadError(error, token));
  }

  function reportAccompanimentLoadError(name, error, token) {
    const track = accompaniment[name];
    if (destroyed || token !== track.loadToken || !requested[`${name}Enabled`]) return;
    track.loading = false;
    track.ready = false;
    track.samples = null;
    track.error = error instanceof Error ? error.message : "Error desconocido";
    setStatus("No se pudo cargar el instrumento.", true);
  }

  function prepareAccompaniment(name) {
    const track = accompaniment[name];
    if (!requested[`${name}Enabled`] || track.ready || track.loading || track.bypassed) return;
    track.loading = true;
    track.error = null;
    const token = ++track.loadToken;
    updateButtons();
    if (!context) {
      try {
        makeContext();
      } catch (error) {
        reportAccompanimentLoadError(name, error, token);
        return;
      }
    }
    const label = ACCOMPANIMENT_INSTRUMENTS[name].label;
    setStatus(`Cargando ${label}…`, true);
    loadAccompanimentSamples(context, name).then((samples) => {
      if (destroyed || token !== track.loadToken) return;
      track.loading = false;
      track.ready = true;
      track.samples = samples;
      updateButtons();
      if (running) {
        setStatus(`${label} listo; se incorpora en la próxima vuelta`);
      } else if (paused) {
        setStatus(`${label} listo; pulsa Play para continuar`);
      } else {
        setStatus(`${label} listo`);
      }
    }).catch((error) => reportAccompanimentLoadError(name, error, token));
  }

  function stopPreview() {
    const active = preview;
    if (!active) return;
    preview = null;
    if (active.frame !== null) cancelAnimationFrame(active.frame);
    for (const voice of active.voices) {
      try {
        voice.gain.gain.cancelScheduledValues(context.currentTime);
        voice.gain.gain.setValueAtTime(0, context.currentTime);
        voice.source.stop(context.currentTime + 0.005);
      } catch (error) {
        if (error.name !== "InvalidStateError") throw error;
      }
    }
    previewButton.disabled = false;
    previewButton.textContent = active.originalLabel;
    renderActiveNote(activeGuideNote);
    updateButtons();
  }

  function updatePreviewFrame(active) {
    active.frame = null;
    if (preview !== active || destroyed) return;
    const elapsed = context.currentTime - active.startTime;
    if (elapsed >= HARMONICA_PREVIEW_NOTES.length * PREVIEW_NOTE_INTERVAL_SECONDS) {
      stopPreview();
      if (!running && !paused) setStatus("Preescucha de armónica en C completada");
      return;
    }
    const index = Math.floor(elapsed / PREVIEW_NOTE_INTERVAL_SECONDS);
    const note = context.state === "running" && index >= 0
      && elapsed - index * PREVIEW_NOTE_INTERVAL_SECONDS < PREVIEW_NOTE_DURATION_SECONDS
      ? HARMONICA_PREVIEW_NOTES[index] : null;
    if (active.note !== note) {
      active.note = note;
      renderActiveNote(activeGuideNote);
    }
    active.frame = requestAnimationFrame(() => updatePreviewFrame(active));
  }

  async function previewHarmonica() {
    if (preview) return;
    const active = {
      originalLabel: previewButton.textContent, startTime: null,
      note: null, frame: null, voices: new Set(),
    };
    preview = active;
    previewButton.disabled = true;
    previewButton.textContent = "Cargando…";
    updateButtons();
    try {
      await resumeContext();
      if (preview !== active || destroyed) return;
      if (!running && !paused) setStatus("Cargando armónica en C…");
      const samples = await loadHarmonicaSamples(context);
      if (preview !== active || destroyed) return;
      if (context.state !== "running") await context.resume();
      if (preview !== active || destroyed) return;
      const startTime = context.currentTime + START_DELAY_SECONDS;
      const previewGain = context.createGain();
      previewGain.gain.value = 0.2;
      previewGain.connect(context.destination);
      HARMONICA_PREVIEW_NOTES.forEach(({pitch, blow}, index) => {
        const source = context.createBufferSource();
        const envelope = context.createGain();
        const noteStart = startTime + index * PREVIEW_NOTE_INTERVAL_SECONDS;
        const noteEnd = noteStart + PREVIEW_NOTE_DURATION_SECONDS;
        const sample = nearestHarmonicaSample(samples, pitch, blow);
        source.buffer = sample.sample.buffer;
        source.playbackRate.setValueAtTime(sample.playbackRate, noteStart);
        envelope.gain.setValueAtTime(0.0001, noteStart);
        envelope.gain.linearRampToValueAtTime(1, noteStart + 0.02);
        envelope.gain.setValueAtTime(1, noteEnd - 0.08);
        envelope.gain.linearRampToValueAtTime(0.0001, noteEnd);
        source.connect(envelope);
        envelope.connect(previewGain);
        const voice = {source, gain: envelope, startTime: noteStart};
        active.voices.add(voice);
        source.addEventListener("ended", () => active.voices.delete(voice), {once: true});
        source.start(noteStart);
        source.stop(noteEnd);
      });
      previewButton.textContent = "♪ Sonando";
      active.startTime = startTime;
      if (!running && !paused) setStatus("Probando armónica en C");
      renderActiveNote(activeGuideNote);
      updatePreviewFrame(active);
    } catch (error) {
      if (preview !== active || destroyed) return;
      stopPreview();
      const message = error instanceof Error ? error.message : "Error desconocido";
      setStatus(`No se pudo cargar la armónica en C: ${message}`, true);
    }
  }

  function beginCycle(startTime, config) {
    cycle = {startTime, config, nextMelodyEvent: 0};
    cycles.push(cycle);
    if (cycles.length > 4) cycles.shift();
    nextPulse = 0;
    nextPulseTime = startTime;
  }

  function schedulerTick() {
    if (!running || context?.state !== "running") return;
    const horizon = context.currentTime + LOOKAHEAD_SECONDS;
    while (nextPulseTime < horizon) {
      if (nextPulse >= loopBeats(cycle.config)) {
        const hasPendingConfig = pendingConfig !== null;
        activeConfig = pendingConfig || requested;
        pendingConfig = null;
        beginCycle(nextPulseTime, activeConfig);
        if (hasPendingConfig) setRunningStatus();
      }
      playClick(nextPulseTime, nextPulse % 4 === 0);
      nextPulseTime += 60 / cycle.config.tempo;
      nextPulse += 1;
    }
    for (const item of cycles) scheduleMelodyForCycle(item, horizon);
  }

  function startScheduler() {
    if (scheduler === null) scheduler = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
    schedulerTick();
  }

  function stopScheduler() {
    if (scheduler !== null) clearInterval(scheduler);
    scheduler = null;
  }

  function makeContext() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error("Este navegador no admite Web Audio.");
    }
    context = new AudioContextConstructor();
    masterGain = context.createGain();
    masterGain.gain.value = requested.metronomeEnabled ? requested.volume : 0;
    masterGain.connect(context.destination);
    melodyGain = context.createGain();
    melodyGain.gain.value = requested.melodyEnabled && !melodyBypassed ? requested.melodyVolume : 0;
    melodyGain.connect(context.destination);
    for (const [name, track] of Object.entries(accompaniment)) {
      track.gain = context.createGain();
      track.gain.gain.value = requested[`${name}Enabled`] && !track.bypassed
        ? requested[`${name}Volume`] * ACCOMPANIMENT_INSTRUMENTS[name].gain : 0;
      track.gain.connect(context.destination);
    }
    context.addEventListener("statechange", () => {
      if (destroyed) return;
      if (context.state === "suspended" && running) {
        const position = positionAt(context.currentTime);
        stopPlaybackFrame();
        renderPlaybackPosition(position, true);
        cancelGuideChanges();
        setStatus("Audio pausado por el navegador; pulsa Play para continuar.", true);
      } else if (context.state === "running" && running) {
        setRunningStatus();
        renderPlaybackPosition(positionAt(context.currentTime), true);
        startPlaybackFrame();
      }
    });
  }

  function resumeContext() {
    if (context === null) makeContext();
    return context.state === "running" ? Promise.resolve() : context.resume();
  }

  function startFresh() {
    const firstBeatTime = context.currentTime + START_DELAY_SECONDS;
    activeConfig = requested;
    pendingConfig = null;
    cycles = [];
    pausedDuringCountIn = false;
    countInVisualsHidden = false;
    if (activeConfig.countInEnabled) {
      const beatLength = 60 / activeConfig.tempo;
      countInEndTime = firstBeatTime + 4 * beatLength;
      cancelMelodyVoices();
      for (const track of Object.values(accompaniment)) cancelVoices(0, track.voices);
      cancelGuideChanges();
      for (let beat = 0; beat < 4; beat += 1) {
        playClick(firstBeatTime + beat * beatLength, beat === 0);
      }
    } else {
      countInEndTime = null;
    }
    const startTime = countInEndTime || firstBeatTime;
    beginCycle(startTime, activeConfig);
    running = true;
    paused = false;
    pausedPosition = null;
    setRunningStatus();
    renderPlaybackPosition(positionAt(context.currentTime), true);
    startPlaybackFrame();
    startScheduler();
  }

  function resumePaused() {
    if (pausedDuringCountIn) {
      activeConfig = requested;
      pendingConfig = null;
      cycles = [];
      countInEndTime = null;
      countInVisualsHidden = false;
      pausedDuringCountIn = false;
      const startTime = context.currentTime + START_DELAY_SECONDS;
      beginCycle(startTime, activeConfig);
      running = true;
      paused = false;
      pausedPosition = null;
      setRunningStatus();
      renderPlaybackPosition(positionAt(context.currentTime), true);
      startPlaybackFrame();
      startScheduler();
      return;
    }
    const current = pausedPosition || {measure: requested.startMeasure, pulse: 0, fraction: 0};
    activeConfig = requested;
    pendingConfig = null;
    cycles = [];
    const pulseIndex = (current.measure - activeConfig.startMeasure) * 4 + current.pulse;
    const beatLength = 60 / activeConfig.tempo;
    const nextTime = context.currentTime + Math.max(
      START_DELAY_SECONDS,
      (1 - current.fraction) * beatLength,
    );
    beginCycle(nextTime - (pulseIndex + 1) * beatLength, activeConfig);
    nextPulse = pulseIndex + 1;
    nextPulseTime = nextTime;
    running = true;
    paused = false;
    setRunningStatus();
    renderPlaybackPosition(positionAt(context.currentTime), true);
    startPlaybackFrame();
    startScheduler();
  }

  function play() {
    if (!requested.supported) {
      setStatus("Solo se admite 4/4 con cuatro negras por compás.", true);
      return;
    }
    let resume;
    try {
      resume = resumeContext();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo iniciar el audio.", true);
      return;
    }
    Promise.resolve(resume).then(() => {
      if (destroyed) return;
      if (running) {
        setRunningStatus();
        startScheduler();
      } else if (paused) {
        resumePaused();
      } else {
        startFresh();
      }
    }).catch((error) => {
      setStatus(error instanceof Error ? `No se pudo activar el audio: ${error.message}` : "No se pudo activar el audio.", true);
    });
  }

  function pause() {
    if (!running || !context || context.state !== "running") return;
    stopPreview();
    pausedDuringCountIn = countInEndTime !== null && context.currentTime < countInEndTime;
    pausedPosition = positionAt(context.currentTime);
    stopPlaybackFrame();
    renderPlaybackPosition(pausedPosition, true);
    cancelVoices();
    cancelGuideChanges();
    running = false;
    paused = true;
    stopScheduler();
    setStatus("En pausa");
  }

  function stop() {
    stopPreview();
    stopPlaybackFrame();
    clearPlaybackPosition();
    scrollToMeasure(requested.startMeasure);
    cancelVoices();
    cancelGuideChanges();
    stopScheduler();
    running = false;
    paused = false;
    pausedPosition = null;
    cycles = [];
    activeConfig = requested;
    pendingConfig = null;
    countInEndTime = null;
    countInVisualsHidden = false;
    pausedDuringCountIn = false;
    setStatus("Detenido");
  }

  function continueWithoutMelody() {
    const skipped = [];
    if (melodyError && requested.melodyEnabled) {
      skipped.push("armónica");
      melodyBypassed = true;
      melodyError = null;
      cancelMelodyVoices();
    }
    for (const [name, track] of Object.entries(accompaniment)) {
      if (!track.error || !requested[`${name}Enabled`]) continue;
      skipped.push(ACCOMPANIMENT_INSTRUMENTS[name].label);
      track.bypassed = true;
      track.error = null;
      cancelVoices(0, track.voices);
    }
    if (skipped.length === 0) return;
    updateMelodyGain();
    updateAccompanimentGains();
    updateButtons();
    setStatus(`Se omite ${skipped.join(" y ")}; desactiva y vuelve a activar en Ajustes para reintentar.`, true);
  }

  function update(data) {
    const next = normalizedConfig(data);
    const melodyConfigChanged = next.melodyEnabled !== requested.melodyEnabled
      || JSON.stringify(next.melodyEvents) !== JSON.stringify(requested.melodyEvents);
    const accompanimentChanged = Object.keys(accompaniment).some(
      (name) => next[`${name}Enabled`] !== requested[`${name}Enabled`],
    );
    const changed = next.tempo !== requested.tempo
      || next.startMeasure !== requested.startMeasure
      || next.endMeasure !== requested.endMeasure
      || melodyConfigChanged || accompanimentChanged;
    const soundChanged = next.metronomeEnabled !== requested.metronomeEnabled
      || next.volume !== requested.volume
      || next.melodyEnabled !== requested.melodyEnabled
      || next.melodyVolume !== requested.melodyVolume
      || Object.keys(accompaniment).some((name) =>
        next[`${name}Enabled`] !== requested[`${name}Enabled`]
        || next[`${name}Volume`] !== requested[`${name}Volume`]);
    if (!next.melodyEnabled) {
      melodyBypassed = false;
      melodyError = null;
      if (melodyLoading) {
        melodyLoadToken += 1;
        melodyLoading = false;
      }
      cancelMelodyVoices();
    } else if (!requested.melodyEnabled) {
      melodyBypassed = false;
    }
    for (const [name, track] of Object.entries(accompaniment)) {
      if (!next[`${name}Enabled`]) {
        track.bypassed = false;
        track.error = null;
        if (track.loading) {
          track.loadToken += 1;
          track.loading = false;
        }
        cancelVoices(0, track.voices);
      } else if (!requested[`${name}Enabled`]) {
        track.bypassed = false;
      }
    }
    if (!next.melodyEnabled && !next.pianoEnabled && !next.bassEnabled) cancelGuideChanges();
    requested = next;
    if (soundChanged) {
      updateMasterGain();
      updateMelodyGain();
      updateAccompanimentGains();
    }
    if (requested.melodyEnabled && !melodyReady && !melodyBypassed) prepareMelody();
    for (const name of Object.keys(accompaniment)) prepareAccompaniment(name);
    if (running && changed) {
      if (cycle && cycle.startTime > context.currentTime) {
        cancelVoices(cycle.startTime);
        cancelGuideChanges();
        cycles = cycles.filter((item) => item !== cycle);
        activeConfig = next;
        pendingConfig = null;
        beginCycle(cycle.startTime, next);
      } else {
        pendingConfig = next;
        setRunningStatus();
      }
    } else if (paused && changed) {
      activeConfig = next;
      pendingConfig = null;
      if (pausedPosition.measure < next.startMeasure || pausedPosition.measure > next.endMeasure) {
        pausedPosition = {measure: next.startMeasure, pulse: 0, fraction: 0};
      }
    } else if (!running && !paused) {
      activeConfig = next;
    }
    if (running && soundChanged) setRunningStatus();
    if (!requested.supported) {
      setStatus("Solo se admite 4/4 con cuatro negras por compás.", true);
    } else if (!running && !paused) {
      if (!melodyLoading) setStatus("Audio listo");
    } else if (!running && paused) {
      setStatus("En pausa");
    }
    updateButtons();
    renderActiveNote(activeGuideNote);
    requestAnimationFrame(() => {
      if (!destroyed) renderActiveNote(activeGuideNote);
    });
    restorePlaybackPosition(true);
  }

  playButton.addEventListener("click", play);
  pauseButton.addEventListener("click", pause);
  stopButton.addEventListener("click", stop);
  previewButton.addEventListener("click", previewHarmonica);
  continueButton.addEventListener("click", continueWithoutMelody);
  document.addEventListener("click", repeatCurrentMeasure);
  window.addEventListener("resize", handleResize);
  if (requested.melodyEnabled) prepareMelody();
  for (const name of Object.keys(accompaniment)) prepareAccompaniment(name);
  if (!requested.supported) {
    setStatus("Solo se admite 4/4 con cuatro negras por compás.", true);
  } else {
    updateButtons();
  }

  return {
    update,
    destroy() {
      destroyed = true;
      stop();
      stopScheduler();
      if (context && context.state !== "closed") {
        context.close().catch((error) => {
          setStatus(`No se pudo cerrar el audio: ${error.message}`, true);
        });
      }
      playButton.removeEventListener("click", play);
      pauseButton.removeEventListener("click", pause);
      stopButton.removeEventListener("click", stop);
      previewButton.removeEventListener("click", previewHarmonica);
      continueButton.removeEventListener("click", continueWithoutMelody);
      document.removeEventListener("click", repeatCurrentMeasure);
      window.removeEventListener("resize", handleResize);
    },
  };
}

export default function ({parentElement, data, setTriggerValue}) {
  const existing = instances.get(parentElement);
  if (existing) {
    existing.update(data);
    return;
  }
  const instance = createInstance(parentElement, data, setTriggerValue);
  instances.set(parentElement, instance);
  return () => {
    instance.destroy();
    instances.delete(parentElement);
  };
}
