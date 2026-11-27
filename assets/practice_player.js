const instances = new WeakMap();
const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;
const CLICK_DURATION_SECONDS = 0.045;
const START_DELAY_SECONDS = 0.05;

function normalizedConfig(data) {
  return {
    tempo: Number(data.tempo),
    startMeasure: Number(data.startMeasure),
    endMeasure: Number(data.endMeasure),
    measureCount: Number(data.measureCount),
    measures: data.measures.map((beats) => Number(beats)),
    supported: data.meter === "4/4" && data.measures.every((beats) => Number(beats) === 4),
  };
}

function loopBeats(config) {
  return (config.endMeasure - config.startMeasure + 1) * 4;
}

function createInstance(parentElement, data) {
  const playButton = parentElement.querySelector('[data-action="play"]');
  const pauseButton = parentElement.querySelector('[data-action="pause"]');
  const stopButton = parentElement.querySelector('[data-action="stop"]');
  const statusElement = parentElement.querySelector(".player-status");
  const positionElement = parentElement.querySelector(".player-position");

  let requested = normalizedConfig(data);
  let activeConfig = requested;
  let pendingConfig = null;
  let context = null;
  let masterGain = null;
  let scheduler = null;
  let animation = null;
  let running = false;
  let paused = false;
  let pausedPosition = null;
  let cycle = null;
  let nextPulse = 0;
  let nextPulseTime = 0;
  let cycles = [];
  let voices = new Set();
  let destroyed = false;

  function setPosition(measure, pulse) {
    positionElement.textContent = `Compás ${measure} · pulso ${pulse}/4`;
  }

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

  function renderPosition() {
    if (destroyed) return;
    if (running && context?.state === "running") {
      const position = positionAt(context.currentTime);
      setPosition(position.measure, position.pulse + 1);
    } else if (paused && pausedPosition) {
      setPosition(pausedPosition.measure, pausedPosition.pulse + 1);
    } else {
      setPosition(requested.startMeasure, 1);
    }
    animation = requestAnimationFrame(renderPosition);
  }

  function updateButtons() {
    playButton.disabled = !requested.supported || (running && context?.state === "running");
    pauseButton.disabled = !running || context?.state !== "running";
    stopButton.disabled = !running && !paused;
  }

  function setStatus(message) {
    statusElement.textContent = message;
    updateButtons();
  }

  function runningStatus() {
    return pendingConfig ? `Próximo: ${pendingConfig.tempo} BPM` : "Reproduciendo";
  }

  function cancelVoices(fromTime = 0) {
    if (!context) return;
    const now = context.currentTime;
    for (const voice of voices) {
      if (voice.startTime < fromTime) continue;
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(0, now);
        voice.oscillator.stop(now + 0.005);
      } catch (error) {
        if (error.name !== "InvalidStateError") throw error;
      }
    }
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
    const voice = {oscillator, gain: envelope, startTime: time};
    voices.add(voice);
    oscillator.addEventListener("ended", () => voices.delete(voice), {once: true});
  }

  function beginCycle(startTime, config) {
    cycle = {startTime, config};
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
        if (hasPendingConfig) setStatus("Reproduciendo");
      }
      playClick(nextPulseTime, nextPulse % 4 === 0);
      nextPulseTime += 60 / cycle.config.tempo;
      nextPulse += 1;
    }
  }

  function startScheduler() {
    if (scheduler === null) scheduler = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
    schedulerTick();
    if (animation === null) renderPosition();
  }

  function stopScheduler() {
    if (scheduler !== null) clearInterval(scheduler);
    if (animation !== null) cancelAnimationFrame(animation);
    scheduler = null;
    animation = null;
  }

  function makeContext() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error("Este navegador no admite Web Audio.");
    }
    context = new AudioContextConstructor();
    masterGain = context.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(context.destination);
    context.addEventListener("statechange", () => {
      if (destroyed) return;
      if (context.state === "suspended" && running) {
        setStatus("Audio pausado por el navegador; pulsa Play para continuar.");
      } else if (context.state === "running" && running) {
        setStatus(runningStatus());
      }
    });
  }

  function resumeContext() {
    if (context === null) makeContext();
    return context.state === "running" ? Promise.resolve() : context.resume();
  }

  function startFresh() {
    const startTime = context.currentTime + START_DELAY_SECONDS;
    activeConfig = requested;
    pendingConfig = null;
    cycles = [];
    beginCycle(startTime, activeConfig);
    running = true;
    paused = false;
    pausedPosition = null;
    setStatus("Reproduciendo");
    startScheduler();
  }

  function resumePaused() {
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
    setStatus("Reproduciendo");
    startScheduler();
  }

  function play() {
    if (!requested.supported) {
      setStatus("Solo se admite 4/4 con cuatro negras por compás.");
      return;
    }
    let resume;
    try {
      resume = resumeContext();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo iniciar el audio.");
      return;
    }
    Promise.resolve(resume).then(() => {
      if (destroyed) return;
      if (running) {
        setStatus(runningStatus());
        startScheduler();
      } else if (paused) {
        resumePaused();
      } else {
        startFresh();
      }
    }).catch((error) => {
      setStatus(error instanceof Error ? `No se pudo activar el audio: ${error.message}` : "No se pudo activar el audio.");
    });
  }

  function pause() {
    if (!running || !context || context.state !== "running") return;
    pausedPosition = positionAt(context.currentTime);
    cancelVoices();
    running = false;
    paused = true;
    stopScheduler();
    setStatus("En pausa");
  }

  function stop() {
    cancelVoices();
    stopScheduler();
    running = false;
    paused = false;
    pausedPosition = null;
    cycles = [];
    activeConfig = requested;
    pendingConfig = null;
    setStatus("Detenido");
    setPosition(requested.startMeasure, 1);
  }

  function update(data) {
    const next = normalizedConfig(data);
    const changed = next.tempo !== requested.tempo
      || next.startMeasure !== requested.startMeasure
      || next.endMeasure !== requested.endMeasure;
    requested = next;
    if (running && changed) {
      if (cycle && cycle.startTime > context.currentTime) {
        cancelVoices(cycle.startTime);
        activeConfig = next;
        pendingConfig = null;
        beginCycle(cycle.startTime, next);
      } else {
        pendingConfig = next;
        setStatus(runningStatus());
      }
    } else if (paused && changed) {
      activeConfig = next;
      pendingConfig = null;
      if (pausedPosition.measure < next.startMeasure || pausedPosition.measure > next.endMeasure) {
        pausedPosition = {measure: next.startMeasure, pulse: 0, fraction: 0};
      }
      setPosition(pausedPosition.measure, pausedPosition.pulse + 1);
    } else if (!running && !paused) {
      activeConfig = next;
      setPosition(next.startMeasure, 1);
    }
    if (!requested.supported) {
      setStatus("Solo se admite 4/4 con cuatro negras por compás.");
    } else if (!running && !paused) {
      setStatus("Audio listo");
    } else if (!running && paused) {
      setStatus("En pausa");
    }
    updateButtons();
  }

  playButton.addEventListener("click", play);
  pauseButton.addEventListener("click", pause);
  stopButton.addEventListener("click", stop);
  updateButtons();
  renderPosition();

  return {
    update,
    destroy() {
      destroyed = true;
      stop();
      stopScheduler();
      if (context && context.state !== "closed") {
        context.close().catch((error) => {
          setStatus(`No se pudo cerrar el audio: ${error.message}`);
        });
      }
      playButton.removeEventListener("click", play);
      pauseButton.removeEventListener("click", pause);
      stopButton.removeEventListener("click", stop);
    },
  };
}

export default function ({parentElement, data}) {
  const existing = instances.get(parentElement);
  if (existing) {
    existing.update(data);
    return;
  }
  const instance = createInstance(parentElement, data);
  instances.set(parentElement, instance);
  return () => {
    instance.destroy();
    instances.delete(parentElement);
  };
}
