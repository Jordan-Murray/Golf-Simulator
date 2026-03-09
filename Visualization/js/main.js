import { createScene, frameHole, focusCameraForPutt } from './scene.js?v=20260309i';
import { buildHole } from './course.js?v=20260309m';
import { buildShots, buildShotSpread, nextShot, prevShot, togglePlay, goToShot, getCurrentShot, updateAnimation, getShotCount, getPlaybackValue, seekPlayback, setCinematicMode, getBallPositionXZ } from './shots.js?v=20260309m';
import { initUI, populateRoundSelector, updateHoleInfo, updateShotInfo, updateCourseInfo, buildScorecard, onHoleClick, setPlayIcon, updateGeometryDebug, setTimelineBounds, setTimelineValue, onTimelineInput, onCinematicModeChange, onSpreadModeChange, setSpreadMode, setGeometryDebugVisible, updateHoleAnalytics, onSpreadFiltersChange, getSpreadFilters, onBestHoleReplay, onWorstHoleReplay, setRoundSelection, onSimulateApi, updateSimApiSummary } from './ui.js?v=20260309o';

let vizData = null;
let geometryData = null;
let currentRoundIdx = 0;
let currentHoleIdx = 0;
let currentHoleForRender = null;
let currentHoleGeometry = null;
let cameraPuttMode = false;
let cameraUserOverrideUntil = 0;
let geometryDebugVisible = false;
let spreadMode = false;
let spreadFilters = { club: 'all', range: '20', heatmap: true };
let sceneCtx = null;
const clock = { last: 0 };
const FORCE_GEOMETRY_FLIP_180 = false;
const STRICT_VISUAL_ANCHOR_MODE = false;
const AUTO_MIRROR_GEOMETRY = false;
const API_BASE = resolveApiBase();

async function init() {
    initUI();
    setSpreadMode(false);
    setGeometryDebugVisible(geometryDebugVisible);
    updateSimApiSummary('Ready. Click "Run Sim API" to request server-side simulation rounds.');

    try {
        vizData = await fetchApiFirstJson('/api/data/visualization', 'data/visualization_data.json');
    } catch (e) {
        document.getElementById('loading').textContent =
            'Could not load visualization data from API or local file - run the ArccosScraper export first.';
        console.error(e);
        return;
    }

    try {
        geometryData = await fetchApiFirstJson('/api/data/geometry', 'data/course_geometry.json');
    } catch {
        geometryData = null;
    }

    if (!vizData.rounds || vizData.rounds.length === 0) {
        document.getElementById('loading').textContent = 'No rounds found in data.';
        return;
    }

    document.getElementById('loading').style.display = 'none';

    const canvas = document.getElementById('canvas');
    sceneCtx = createScene(canvas);
    sceneCtx.controls.addEventListener('start', () => {
        cameraUserOverrideUntil = performance.now() + 2000;
    });
    sceneCtx.controls.addEventListener('end', () => {
        cameraUserOverrideUntil = performance.now() + 1400;
    });

    populateRoundSelector(vizData.rounds);
    loadRound(0);

    document.getElementById('round-select').addEventListener('change', e => {
        loadRound(parseInt(e.target.value, 10));
    });
    document.getElementById('btn-prev-hole').addEventListener('click', () => changeHole(-1));
    document.getElementById('btn-next-hole').addEventListener('click', () => changeHole(1));
    document.getElementById('btn-prev-shot').addEventListener('click', () => {
        if (spreadMode) return;
        prevShot();
        const shot = getCurrentShot();
        updateShotInfo(shot);
        syncShotCamera(1 / 60, shot);
        setTimelineValue(getPlaybackValue(), shot);
    });
    document.getElementById('btn-next-shot').addEventListener('click', () => {
        if (spreadMode) return;
        nextShot();
        const shot = getCurrentShot();
        updateShotInfo(shot);
        syncShotCamera(1 / 60, shot);
        setTimelineValue(getPlaybackValue(), shot);
    });
    document.getElementById('btn-play').addEventListener('click', () => {
        if (spreadMode) return;
        const playing = togglePlay();
        setPlayIcon(playing);
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') {
            if (spreadMode) return;
            nextShot();
            const shot = getCurrentShot();
            updateShotInfo(shot);
            syncShotCamera(1 / 60, shot);
            setTimelineValue(getPlaybackValue(), shot);
        }
        if (e.key === 'ArrowLeft') {
            if (spreadMode) return;
            prevShot();
            const shot = getCurrentShot();
            updateShotInfo(shot);
            syncShotCamera(1 / 60, shot);
            setTimelineValue(getPlaybackValue(), shot);
        }
        if (e.key === 'ArrowUp') changeHole(1);
        if (e.key === 'ArrowDown') changeHole(-1);
        if (e.key === ' ') {
            e.preventDefault();
            const playing = togglePlay();
            setPlayIcon(playing);
        }
        if (e.key.toLowerCase() === 'g') {
            geometryDebugVisible = !geometryDebugVisible;
            setGeometryDebugVisible(geometryDebugVisible);
        }
        if (e.key.toLowerCase() === 'b') {
            replayBestHoleForCurrent();
        }
        if (e.key.toLowerCase() === 'w') {
            replayWorstHoleForCurrent();
        }
    });

    onHoleClick(idx => {
        currentHoleIdx = idx;
        loadHole();
    });

    onTimelineInput(value => {
        if (spreadMode) return;
        seekPlayback(value);
        const shot = getCurrentShot();
        updateShotInfo(shot);
        setTimelineValue(getPlaybackValue(), shot);
        syncShotCamera(1 / 60, shot);
        setPlayIcon(false);
    });

    onCinematicModeChange(enabled => {
        setCinematicMode(enabled);
    });
    onSpreadModeChange(enabled => {
        spreadMode = enabled;
        loadHole();
    });
    onSpreadFiltersChange(filters => {
        spreadFilters = filters;
        if (spreadMode) loadHole();
    });
    onBestHoleReplay(() => {
        replayBestHoleForCurrent();
    });
    onWorstHoleReplay(() => {
        replayWorstHoleForCurrent();
    });
    onSimulateApi(async ({ holes, rounds }) => {
        await runSimulationApi(holes, rounds);
    });
    spreadFilters = getSpreadFilters();
    setCinematicMode(true);

    clock.last = performance.now();
    requestAnimationFrame(animate);
}

async function fetchApiFirstJson(apiPath, fallbackPath) {
    try {
        const apiResp = await fetch(toApiUrl(apiPath), { cache: 'no-store' });
        if (apiResp.ok) {
            return await apiResp.json();
        }
    } catch {
        // Fall back to local static file.
    }

    const fallbackResp = await fetch(fallbackPath, { cache: 'no-store' });
    if (!fallbackResp.ok) {
        throw new Error(`Failed to load ${fallbackPath}: HTTP ${fallbackResp.status}`);
    }
    return await fallbackResp.json();
}

async function runSimulationApi(holes, rounds) {
    const currentRound = vizData?.rounds?.[currentRoundIdx];
    const courseName = currentRound?.courseName;
    if (!courseName) {
        updateSimApiSummary('Cannot run simulation: no course loaded.');
        return;
    }

    updateSimApiSummary('Running simulation API...');
    try {
        const resp = await fetch(toApiUrl('/api/simulate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                courseName,
                holes: Number(holes),
                rounds: Number(rounds),
                verbose: false
            })
        });

        if (!resp.ok) {
            const errText = await resp.text();
            updateSimApiSummary(`Simulation API failed (${resp.status}).\n${errText}`);
            return;
        }

        const data = await resp.json();
        updateSimApiSummary(formatSimApiSummary(data));
    } catch (err) {
        updateSimApiSummary(`Simulation API error.\n${String(err)}`);
    }
}

function resolveApiBase() {
    const queryBase = new URLSearchParams(window.location.search).get('apiBase');
    if (queryBase) return trimTrailingSlash(queryBase);
    if (typeof window !== 'undefined' && typeof window.GOLF_API_BASE === 'string' && window.GOLF_API_BASE.trim()) {
        return trimTrailingSlash(window.GOLF_API_BASE.trim());
    }
    return '';
}

function toApiUrl(path) {
    if (!API_BASE) return path;
    return `${API_BASE}${path}`;
}

function trimTrailingSlash(value) {
    return value.endsWith('/') ? value.slice(0, -1) : value;
}

function formatSimApiSummary(data) {
    const rounds = Array.isArray(data?.rounds) ? data.rounds : [];
    if (rounds.length === 0) {
        return 'Simulation completed but no rounds returned.';
    }

    const totals = rounds.map(r => Number(r.totalScore)).filter(Number.isFinite);
    const best = Math.min(...totals);
    const worst = Math.max(...totals);
    const avgScore = totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length);
    const sample = rounds.slice(0, 8).map((r, i) => `R${i + 1}: ${r.totalScore}`);

    return [
        `Course: ${data.courseName ?? '-'}`,
        `Requested: ${data.roundsRequested ?? rounds.length} rounds, ${data.holesPlayed ?? '-'} holes`,
        `Avg: ${avgScore.toFixed(1)}`,
        `Best: ${best}`,
        `Worst: ${worst}`,
        `Samples: ${sample.join(' | ')}`,
        '',
        `Calibration: penalties/18=${Number(data?.calibration?.averagePenaltiesPerRound ?? 0).toFixed(2)}`
    ].join('\n');
}

function loadRound(idx) {
    currentRoundIdx = idx;
    currentHoleIdx = 0;
    setRoundSelection(idx);
    const round = vizData.rounds[currentRoundIdx];
    updateCourseInfo(round);
    buildScorecard(round.holes, currentHoleIdx);
    loadHole();
}

function replayBestHoleForCurrent() {
    replayExtremeHoleForCurrent('best');
}

function replayWorstHoleForCurrent() {
    replayExtremeHoleForCurrent('worst');
}

function replayExtremeHoleForCurrent(mode) {
    const currentRound = vizData?.rounds?.[currentRoundIdx];
    const hole = currentRound?.holes?.[currentHoleIdx];
    if (!currentRound || !hole) return;

    const courseName = normalize(currentRound.courseName);
    const holeNumber = Number(hole.holeNumber);
    const candidates = [];

    for (let i = 0; i < vizData.rounds.length; i++) {
        const r = vizData.rounds[i];
        if (normalize(r.courseName) !== courseName) continue;
        const holeIdx = (r.holes ?? []).findIndex(h => Number(h.holeNumber) === holeNumber);
        if (holeIdx < 0) continue;
        const h = r.holes[holeIdx];
        candidates.push({
            roundIdx: i,
            holeIdx,
            holeScore: Number(h.score),
            par: Number(h.par),
            totalScore: Number(r.totalScore),
            date: String(r.date ?? '')
        });
    }

    if (candidates.length === 0) return;

    candidates.sort((a, b) => {
        const scoreCmp = mode === 'worst'
            ? b.holeScore - a.holeScore
            : a.holeScore - b.holeScore;
        if (scoreCmp !== 0) return scoreCmp;

        const dToParA = a.holeScore - a.par;
        const dToParB = b.holeScore - b.par;
        const toParCmp = mode === 'worst'
            ? dToParB - dToParA
            : dToParA - dToParB;
        if (toParCmp !== 0) return toParCmp;

        const totalCmp = mode === 'worst'
            ? b.totalScore - a.totalScore
            : a.totalScore - b.totalScore;
        if (totalCmp !== 0) return totalCmp;

        return b.date.localeCompare(a.date);
    });

    const chosen = candidates[0];
    spreadMode = false;
    setSpreadMode(false);
    currentRoundIdx = chosen.roundIdx;
    currentHoleIdx = chosen.holeIdx;
    setRoundSelection(chosen.roundIdx);
    const chosenRound = vizData.rounds[chosen.roundIdx];
    updateCourseInfo(chosenRound);
    buildScorecard(chosenRound.holes, currentHoleIdx);
    loadHole();
}

function loadHole() {
    const round = vizData.rounds[currentRoundIdx];
    const selectedHole = round.holes[currentHoleIdx];
    const geometryStatus = inspectHoleGeometry(round, selectedHole);
    const rawSpreadSamples = spreadMode
        ? getHoleSamples(round, selectedHole.holeNumber, spreadFilters)
        : [];
    const spreadSamples = spreadMode
        ? normalizeSamplesToReference(rawSpreadSamples, selectedHole)
        : [];
    const referenceHole = spreadMode
        ? buildAggregateHoleForFrame(selectedHole, spreadSamples)
        : selectedHole;
    const aligned = alignHoleGeometryToHole(geometryStatus.holeGeometry, referenceHole);
    const holeGeometry = aligned.geometry;
    const holeForRender = getHoleForRender(referenceHole, holeGeometry);
    currentHoleForRender = holeForRender;
    currentHoleGeometry = holeGeometry;
    cameraPuttMode = false;
    aligned.holePin = selectedHole?.pin ? [Number(selectedHole.pin.x), Number(selectedHole.pin.z)] : null;
    const greenCenter = centroid(holeGeometry?.green);
    aligned.renderPin = holeForRender?.pin ? [Number(holeForRender.pin.x), Number(holeForRender.pin.z)] : null;
    aligned.greenCenter = greenCenter;
    aligned.renderPinDelta = (greenCenter && aligned.renderPin)
        ? Math.hypot(aligned.renderPin[0] - greenCenter[0], aligned.renderPin[1] - greenCenter[1])
        : null;

    clearDynamicSceneGroups(sceneCtx.scene);
    buildHole(sceneCtx.scene, holeForRender, holeGeometry);
    if (spreadMode) {
        buildShotSpread(sceneCtx.scene, spreadSamples, spreadFilters);
        setTimelineBounds(0);
        setTimelineValue(0, null);
        setPlayIcon(false);
        frameHole(sceneCtx.camera, sceneCtx.controls, holeForRender, holeGeometry);
        updateHoleAnalytics(formatHoleAnalytics(selectedHole, spreadSamples, holeGeometry));
        updateShotInfo(null);
    } else {
        buildShots(sceneCtx.scene, selectedHole);
        setTimelineBounds(getShotCount());
        frameHole(sceneCtx.camera, sceneCtx.controls, getHoleForRender(selectedHole, holeGeometry), holeGeometry);
        updateHoleAnalytics('Spread mode off');
        updateShotInfo(null);
    }
    const sceneDiag = inspectSceneGroups(sceneCtx.scene);
    updateHoleInfo(selectedHole);
    buildScorecard(round.holes, currentHoleIdx);
    goToShot(-1);
    setPlayIcon(false);
    setTimelineValue(0, null);
    updateGeometryDebug(formatGeometryDebug(geometryStatus, aligned, sceneDiag));
}

function normalizeSamplesToReference(samples, referenceHole) {
    if (!Array.isArray(samples) || samples.length === 0) return [];
    const normalized = [];
    for (const hole of samples) {
        normalized.push(normalizeHoleToReference(hole, referenceHole));
    }
    return normalized;
}

function normalizeHoleToReference(hole, referenceHole) {
    const refTee = getHoleTee(referenceHole);
    const refPin = getHolePin(referenceHole);
    const srcTee = getHoleTee(hole);
    const srcPin = getHolePin(hole);

    if (!refTee || !refPin || !srcTee || !srcPin) {
        return hole;
    }

    const noMirror = buildSimilarityTransform(srcTee, srcPin, refTee, refPin, false);
    const withMirror = buildSimilarityTransform(srcTee, srcPin, refTee, refPin, true);

    const firstTeeEnd = getFirstTeeEnd(hole);
    let chosen = noMirror;
    if (firstTeeEnd) {
        const direct = transformPointSimilarity(firstTeeEnd, noMirror);
        const mirrored = transformPointSimilarity(firstTeeEnd, withMirror);
        const scoreDirect = scoreTeeShotFit(direct, refTee, refPin);
        const scoreMirrored = scoreTeeShotFit(mirrored, refTee, refPin);
        chosen = scoreMirrored + 1e-6 < scoreDirect ? withMirror : noMirror;
    }

    const mappedShots = (hole.shots ?? []).map(shot => {
        const start = transformPointSimilarity([Number(shot.start?.x), Number(shot.start?.z)], chosen);
        const end = transformPointSimilarity([Number(shot.end?.x), Number(shot.end?.z)], chosen);
        return {
            ...shot,
            start: {
                ...shot.start,
                x: round2(start[0]),
                z: round2(start[1])
            },
            end: {
                ...shot.end,
                x: round2(end[0]),
                z: round2(end[1])
            }
        };
    });

    const mappedPin = transformPointSimilarity(srcPin, chosen);
    return {
        ...hole,
        pin: {
            ...hole.pin,
            x: round2(mappedPin[0]),
            z: round2(mappedPin[1])
        },
        shots: mappedShots,
        _normalized: true,
        _normalizedMirrored: chosen.mirrored
    };
}

function getHoleTee(hole) {
    const first = (hole?.shots ?? [])[0];
    if (!first) return null;
    const x = Number(first.start?.x);
    const z = Number(first.start?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return [x, z];
}

function getHolePin(hole) {
    const x = Number(hole?.pin?.x);
    const z = Number(hole?.pin?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return [x, z];
}

function getFirstTeeEnd(hole) {
    const tee = (hole?.shots ?? []).find(s => Number(s.shotNumber) === 1);
    if (!tee) return null;
    const x = Number(tee.end?.x);
    const z = Number(tee.end?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return [x, z];
}

function buildSimilarityTransform(srcTee, srcPin, dstTee, dstPin, mirrored = false) {
    const srcVec = [srcPin[0] - srcTee[0], srcPin[1] - srcTee[1]];
    const dstVec = [dstPin[0] - dstTee[0], dstPin[1] - dstTee[1]];
    const srcLen = Math.hypot(srcVec[0], srcVec[1]);
    const dstLen = Math.hypot(dstVec[0], dstVec[1]);
    if (srcLen < 1e-6 || dstLen < 1e-6) {
        return { srcTee, dstTee, scale: 1, cos: 1, sin: 0, mirrored, srcUnit: [1, 0] };
    }

    const srcUnit = [srcVec[0] / srcLen, srcVec[1] / srcLen];
    const dstUnit = [dstVec[0] / dstLen, dstVec[1] / dstLen];
    const cos = srcUnit[0] * dstUnit[0] + srcUnit[1] * dstUnit[1];
    const sin = srcUnit[0] * dstUnit[1] - srcUnit[1] * dstUnit[0];

    return {
        srcTee,
        dstTee,
        scale: dstLen / srcLen,
        cos,
        sin,
        mirrored,
        srcUnit
    };
}

function transformPointSimilarity(point, t) {
    let x = Number(point[0]) - t.srcTee[0];
    let z = Number(point[1]) - t.srcTee[1];

    if (t.mirrored) {
        const ux = t.srcUnit[0];
        const uz = t.srcUnit[1];
        const lx = -uz;
        const lz = ux;
        const along = x * ux + z * uz;
        let lateral = x * lx + z * lz;
        lateral = -lateral;
        x = along * ux + lateral * lx;
        z = along * uz + lateral * lz;
    }

    const xr = (x * t.cos - z * t.sin) * t.scale + t.dstTee[0];
    const zr = (x * t.sin + z * t.cos) * t.scale + t.dstTee[1];
    return [xr, zr];
}

function scoreTeeShotFit(endPoint, teePoint, pinPoint) {
    const vx = pinPoint[0] - teePoint[0];
    const vz = pinPoint[1] - teePoint[1];
    const len = Math.hypot(vx, vz);
    if (len < 1e-6) return Number.POSITIVE_INFINITY;
    const ux = vx / len;
    const uz = vz / len;
    const lx = -uz;
    const lz = ux;

    const rx = endPoint[0] - teePoint[0];
    const rz = endPoint[1] - teePoint[1];
    const along = rx * ux + rz * uz;
    const lateral = rx * lx + rz * lz;
    const alongPenalty = along < 0 ? Math.abs(along) * 3 : Math.max(0, along - len * 1.4);
    return Math.abs(lateral) + alongPenalty;
}

function changeHole(delta) {
    const round = vizData.rounds[currentRoundIdx];
    const newIdx = currentHoleIdx + delta;
    if (newIdx >= 0 && newIdx < round.holes.length) {
        currentHoleIdx = newIdx;
        loadHole();
    }
}

function animate(now) {
    requestAnimationFrame(animate);

    const delta = (now - clock.last) / 1000;
    clock.last = now;

    if (!spreadMode) {
        const animating = updateAnimation(delta);
        const activeShot = getCurrentShot();
        if (animating) {
            updateShotInfo(activeShot);
        }
        syncShotCamera(delta, activeShot);
        setTimelineValue(getPlaybackValue(), activeShot);
    }

    sceneCtx.controls.update();
    sceneCtx.renderer.render(sceneCtx.scene, sceneCtx.camera);
}

init();

function syncShotCamera(deltaTime, shot = null) {
    if (spreadMode) return;
    if (!sceneCtx || !currentHoleForRender) return;

    const activeShot = shot ?? getCurrentShot();
    const isPutt = Number(activeShot?.clubId) === 13;

    if (isPutt && activeShot) {
        if (performance.now() >= cameraUserOverrideUntil) {
            focusCameraForPutt(
                sceneCtx.camera,
                sceneCtx.controls,
                currentHoleForRender,
                activeShot,
                getBallPositionXZ(),
                deltaTime
            );
        }
        cameraPuttMode = true;
        return;
    }

    if (cameraPuttMode) {
        frameHole(sceneCtx.camera, sceneCtx.controls, currentHoleForRender, currentHoleGeometry);
        cameraPuttMode = false;
    }
}

function getHoleSamples(round, holeNumber, filters = { range: '20' }) {
    const courseName = normalize(round.courseName);
    let samples = (vizData.rounds ?? [])
        .filter(r => normalize(r.courseName) === courseName)
        .map(r => {
            const h = (r.holes ?? []).find(x => Number(x.holeNumber) === Number(holeNumber));
            return h ? { ...h, _roundDate: r.date } : null;
        })
        .filter(h => !!h)
        .sort((a, b) => String(b._roundDate).localeCompare(String(a._roundDate)));
    const rangeN = String(filters?.range ?? '20');
    if (rangeN !== 'all') {
        const n = Number(rangeN);
        if (Number.isFinite(n) && n > 0) {
            samples = samples.slice(0, n);
        }
    }
    return samples;
}

function buildAggregateHoleForFrame(baseHole, samples) {
    const pin = averagePin(samples) ?? baseHole.pin;
    const shots = [];
    for (const h of samples) {
        for (const s of h.shots ?? []) {
            shots.push(s);
        }
    }
    return {
        ...baseHole,
        pin,
        shots
    };
}

function averagePin(samples) {
    if (!samples || samples.length === 0) return null;
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (const h of samples) {
        const x = Number(h?.pin?.x);
        const z = Number(h?.pin?.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        sx += x;
        sz += z;
        n++;
    }
    if (n === 0) return null;
    return { x: sx / n, z: sz / n };
}

function formatHoleAnalytics(currentHole, samples, alignedGeometry = null) {
    if (!samples || samples.length === 0) {
        return 'No samples found for this hole.';
    }

    const rounds = samples.length;
    const avgScore = avg(samples.map(h => Number(h.score)));
    const puttsPerHole = samples.map(h => (h.shots ?? []).filter(s => Number(s.clubId) === 13).length);
    const penaltiesPerHole = samples.map(h => countPenalties(h.shots ?? []));
    const firstPuttDists = samples
        .map(h => (h.shots ?? []).find(s => Number(s.clubId) === 13))
        .filter(s => !!s)
        .map(s => Number(s.distance));
    const girCount = samples.filter(h => isGir(h)).length;
    const threePuttCount = puttsPerHole.filter(p => p >= 3).length;
    const fir = computeFir(samples, alignedGeometry);
    const lateral = lateralBias(samples);
    const dateSpan = buildDateSpan(samples);
    const normalizedCount = samples.filter(s => s._normalized).length;
    const mirroredCount = samples.filter(s => s._normalizedMirrored).length;

    return [
        `Rounds sampled: ${rounds}`,
        `Window: ${dateSpan}`,
        `Coords normalized: ${normalizedCount}/${rounds} (mirrored ${mirroredCount})`,
        `Avg score: ${avgScore.toFixed(2)} (par ${currentHole.par})`,
        `Avg putts/hole: ${avg(puttsPerHole).toFixed(2)}`,
        `Avg penalties/hole: ${avg(penaltiesPerHole).toFixed(2)}`,
        `GIR: ${(girCount / rounds * 100).toFixed(1)}%`,
        fir,
        `3-putt rate: ${(threePuttCount / rounds * 100).toFixed(1)}%`,
        `Avg first putt: ${firstPuttDists.length ? avg(firstPuttDists).toFixed(1) : '-'} yds`,
        `Tee miss bias: ${lateral}`
    ].join('\n');
}

function buildDateSpan(samples) {
    const dates = samples.map(s => String(s._roundDate ?? '')).filter(Boolean).sort();
    if (dates.length === 0) return '-';
    return dates.length === 1 ? dates[0] : `${dates[0]} -> ${dates[dates.length - 1]}`;
}

function computeFir(samples, alignedGeometry) {
    const fairway = alignedGeometry?.fairway;
    if (!Array.isArray(fairway) || fairway.length < 3) {
        return 'FIR (geom): n/a (no fairway polygon)';
    }
    const eligible = samples.filter(h => Number(h.par) >= 4);
    if (eligible.length === 0) return 'FIR (geom): n/a';

    let hits = 0;
    let total = 0;
    for (const h of eligible) {
        const teeShot = (h.shots ?? []).find(s => Number(s.shotNumber) === 1);
        if (!teeShot) continue;
        const p = [Number(teeShot.end?.x), Number(teeShot.end?.z)];
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        total++;
        if (pointInPolygon2D(p, fairway)) hits++;
    }
    if (total === 0) return 'FIR (geom): n/a';
    return `FIR (geom): ${hits}/${total} (${(hits / total * 100).toFixed(1)}%)`;
}

function lateralBias(samples) {
    const vals = [];
    for (const h of samples) {
        const tee = (h.shots ?? []).find(s => Number(s.shotNumber) === 1);
        const sx = Number(tee?.start?.x);
        const sz = Number(tee?.start?.z);
        const ex = Number(tee?.end?.x);
        const ez = Number(tee?.end?.z);
        const px = Number(h?.pin?.x);
        const pz = Number(h?.pin?.z);
        if (![sx, sz, ex, ez, px, pz].every(Number.isFinite)) continue;

        const vx = px - sx;
        const vz = pz - sz;
        const len = Math.hypot(vx, vz);
        if (len < 1e-6) continue;
        const ux = vx / len;
        const uz = vz / len;
        const lx = -uz;
        const lz = ux;
        const rx = ex - sx;
        const rz = ez - sz;
        const lateral = rx * lx + rz * lz;
        vals.push(lateral);
    }
    if (vals.length === 0) return 'n/a';
    const mean = avg(vals);
    const side = mean > 0 ? 'right' : 'left';
    return `${Math.abs(mean).toFixed(1)}m ${side} (avg lateral)`;
}

function countPenalties(shots) {
    let count = 0;
    for (const s of shots) {
        const name = normalize(s.clubName);
        if (name.includes('penalty') || Number(s.clubId) === 99) {
            count++;
        }
    }
    return count;
}

function isGir(hole) {
    const par = Number(hole.par);
    const firstPuttIdx = (hole.shots ?? []).findIndex(s => Number(s.clubId) === 13);
    if (firstPuttIdx < 0) return false;
    const strokesToGreen = firstPuttIdx;
    return strokesToGreen <= Math.max(1, par - 2);
}

function avg(values) {
    const valid = values.filter(v => Number.isFinite(v));
    if (valid.length === 0) return 0;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function normalize(value) {
    return String(value ?? '').trim().toLowerCase();
}

function inspectHoleGeometry(round, hole) {
    const normalizedCourseName = normalize(round.courseName);
    const courses = Array.isArray(geometryData?.courses) ? geometryData.courses : [];
    const matchedCourse = courses.find(c => normalize(c.courseName) === normalizedCourseName) ?? null;
    const holeGeometry = matchedCourse?.holes?.find(h => Number(h.holeNumber) === Number(hole.holeNumber)) ?? null;

    return {
        geometryLoaded: !!geometryData,
        totalCourses: courses.length,
        requestedCourseName: round.courseName,
        matchedCourseName: matchedCourse?.courseName ?? null,
        holeNumber: hole.holeNumber,
        holeGeometry
    };
}

function formatGeometryDebug(status, aligned, sceneDiag = null) {
    if (!status.geometryLoaded) {
        return [
            'Status: no course_geometry.json loaded',
            'Using procedural fallback.'
        ].join('\n');
    }

    const lines = [];
    lines.push(`Status: geometry file loaded (${status.totalCourses} course(s))`);
    lines.push(`Requested course: ${status.requestedCourseName}`);
    lines.push(`Matched course: ${status.matchedCourseName ?? 'none'}`);
    lines.push(`Hole: ${status.holeNumber}`);
    lines.push(`Alignment: ${aligned.applied ? 'applied' : 'not applied'}`);
    if (sceneDiag) {
        lines.push(`scene groups: total=${sceneDiag.totalGroups}, taggedCourse=${sceneDiag.courseGroups}, taggedShots=${sceneDiag.shotGroups}`);
    }
    if (aligned.applied) {
        lines.push(` scale: ${aligned.scale.toFixed(3)}`);
        lines.push(` rotation: ${aligned.rotationDeg.toFixed(1)} deg`);
        lines.push(` mirrored: ${aligned.mirrored ? 'yes' : 'no'}`);
        lines.push(` flipped180: ${aligned.flipped180 ? 'yes' : 'no'}`);
        if (aligned.forcedMirrored !== null) {
            lines.push(` forced mirrored: ${aligned.forcedMirrored ? 'yes' : 'no'}`);
        }
        if (aligned.forcedFlip180 !== null) {
            lines.push(` forced flip180: ${aligned.forcedFlip180 ? 'yes' : 'no'}`);
        }
        lines.push(` pinOffsetFix: dx=${aligned.pinOffsetDx.toFixed(1)}, dz=${aligned.pinOffsetDz.toFixed(1)}`);
        lines.push(` teeOffsetFix: dx=${aligned.teeOffsetDx.toFixed(1)}, dz=${aligned.teeOffsetDz.toFixed(1)}`);
        if (aligned.renderPin && aligned.greenCenter) {
            if (aligned.holePin) {
                lines.push(` holePin(raw): x=${aligned.holePin[0].toFixed(1)}, z=${aligned.holePin[1].toFixed(1)}`);
            }
            lines.push(` renderPin: x=${aligned.renderPin[0].toFixed(1)}, z=${aligned.renderPin[1].toFixed(1)}`);
            lines.push(` greenCenter: x=${aligned.greenCenter[0].toFixed(1)}, z=${aligned.greenCenter[1].toFixed(1)}`);
            lines.push(` pin-green delta: ${aligned.renderPinDelta.toFixed(2)}m`);
        }
    }

    if (!status.holeGeometry) {
        lines.push('Hole geometry: not found (fallback active)');
        return lines.join('\n');
    }

    const g = status.holeGeometry;
    lines.push('Hole geometry: found');
    lines.push(` tee polygon: ${pointCount(g.tee)}`);
    lines.push(` fairway polygon: ${pointCount(g.fairway)}`);
    lines.push(` green polygon: ${pointCount(g.green)}`);
    lines.push(` bunkers: ${polygonCount(g.bunkers)} polygon(s)`);
    lines.push(` water: ${polygonCount(g.water)} polygon(s)`);
    lines.push(` trees: ${pointCount(g.trees)} point(s)`);
    return lines.join('\n');
}

function clearDynamicSceneGroups(scene) {
    const groups = scene.children.filter(child => child?.isGroup);
    for (const group of groups) {
        scene.remove(group);
        disposeObjectTree(group);
    }
}

function disposeObjectTree(obj) {
    obj.traverse(node => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
            if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
            else node.material.dispose();
        }
    });
}

function inspectSceneGroups(scene) {
    const groups = scene.children.filter(child => child?.isGroup);
    let courseGroups = 0;
    let shotGroups = 0;
    for (const g of groups) {
        const tag = String(g?.userData?.tag ?? '');
        if (tag === 'golf-course-group') courseGroups++;
        if (tag === 'golf-shot-group') shotGroups++;
    }
    return {
        totalGroups: groups.length,
        courseGroups,
        shotGroups
    };
}

function pointCount(points) {
    return Array.isArray(points) ? points.length : 0;
}

function polygonCount(polygons) {
    return Array.isArray(polygons) ? polygons.length : 0;
}

function alignHoleGeometryToHole(holeGeometry, hole) {
    if (!holeGeometry) {
        return { geometry: null, applied: false, scale: 1, rotationDeg: 0 };
    }

    const sourceTee = centroid(holeGeometry.tee) ?? centroid(holeGeometry.fairway) ?? [0, 0];
    const sourceTarget = centroid(holeGeometry.green) ?? centroid(holeGeometry.fairway);
    const firstShot = Array.isArray(hole.shots) && hole.shots.length > 0 ? hole.shots[0] : null;
    const firstNonPutt = (hole.shots ?? []).find(s => Number(s.clubId) !== 13) ?? firstShot;
    const targetTee = firstShot
        ? [Number(firstShot.start.x), Number(firstShot.start.z)]
        : [0, 0];
    const pinTarget = [Number(hole.pin.x), Number(hole.pin.z)];
    const targetTarget = STRICT_VISUAL_ANCHOR_MODE
        ? buildStrictDirectionTarget(targetTee, firstNonPutt, pinTarget)
        : pinTarget;

    if (!sourceTarget || !Number.isFinite(targetTarget[0]) || !Number.isFinite(targetTarget[1])) {
        return { geometry: holeGeometry, applied: false, scale: 1, rotationDeg: 0 };
    }

    const srcVec = [sourceTarget[0] - sourceTee[0], sourceTarget[1] - sourceTee[1]];
    const dstVec = [targetTarget[0] - targetTee[0], targetTarget[1] - targetTee[1]];
    const srcLen = Math.hypot(srcVec[0], srcVec[1]);
    const dstLen = Math.hypot(dstVec[0], dstVec[1]);

    if (srcLen < 1 || dstLen < 1) {
        return { geometry: holeGeometry, applied: false, scale: 1, rotationDeg: 0 };
    }

    const scale = dstLen / srcLen;
    const srcUnit = [srcVec[0] / srcLen, srcVec[1] / srcLen];
    const dstUnit = [dstVec[0] / dstLen, dstVec[1] / dstLen];
    const baseCos = srcUnit[0] * dstUnit[0] + srcUnit[1] * dstUnit[1];
    const baseSin = srcUnit[0] * dstUnit[1] - srcUnit[1] * dstUnit[0];
    const forcedMirrored = typeof holeGeometry?.forceMirrored === 'boolean' ? holeGeometry.forceMirrored : null;
    const forcedFlip180 = typeof holeGeometry?.forceFlip180 === 'boolean'
        ? holeGeometry.forceFlip180
        : (FORCE_GEOMETRY_FLIP_180 ? true : null);

    const mirrorModes = forcedMirrored !== null
        ? [forcedMirrored]
        : (AUTO_MIRROR_GEOMETRY ? [false, true] : [false]);
    const candidates = [];
    for (const mirrored of mirrorModes) {
        candidates.push({ mirrored, flipped180: false, cos: baseCos, sin: baseSin });
        candidates.push({ mirrored, flipped180: true, cos: -baseCos, sin: -baseSin });
    }

    const scored = candidates.map(c =>
    {
        const geometry = transformGeometry(holeGeometry, sourceTee, targetTee, scale, c.cos, c.sin, c.mirrored, srcUnit);
        return { ...c, geometry, score: scoreGeometryFit(geometry, hole) };
    });

    let eligible = scored;
    if (forcedFlip180 !== null) {
        eligible = eligible.filter(x => x.flipped180 === forcedFlip180);
    }
    if (forcedMirrored !== null) {
        eligible = eligible.filter(x => x.mirrored === forcedMirrored);
    }
    if (eligible.length === 0) {
        eligible = scored;
    }
    let best = eligible[0];
    for (const c of eligible) {
        if (c.score < best.score) best = c;
    }

    let transformed = best.geometry;
    const cos = best.cos;
    const sin = best.sin;
    const rot = Math.atan2(sin, cos);
    const movedToPin = anchorGreenToPin(transformed, targetTarget);
    transformed = movedToPin.geometry;
    const movedToTee = STRICT_VISUAL_ANCHOR_MODE
        ? anchorTeeToFirstShot(transformed, targetTee)
        : { geometry: transformed, dx: 0, dz: 0 };
    transformed = movedToTee.geometry;

    return {
        geometry: transformed,
        applied: true,
        scale,
        rotationDeg: rot * 180 / Math.PI,
        mirrored: best.mirrored,
        flipped180: best.flipped180,
        forcedMirrored,
        forcedFlip180,
        pinOffsetDx: movedToPin.dx,
        pinOffsetDz: movedToPin.dz,
        teeOffsetDx: movedToTee.dx,
        teeOffsetDz: movedToTee.dz
    };
}

function centroid(points) {
    if (!Array.isArray(points) || points.length === 0) return null;
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (const p of points) {
        if (!Array.isArray(p) || p.length < 2) continue;
        const x = Number(p[0]);
        const z = Number(p[1]);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        sx += x;
        sz += z;
        n++;
    }
    if (n === 0) return null;
    return [sx / n, sz / n];
}

function round2(v) {
    return Math.round(v * 100) / 100;
}

function anchorGreenToPin(geometry, targetPin) {
    const c = centroid(geometry?.green);
    if (!c) {
        return { geometry, dx: 0, dz: 0 };
    }

    const dx = targetPin[0] - c[0];
    const dz = targetPin[1] - c[1];
    if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) {
        return { geometry, dx: 0, dz: 0 };
    }

    const shiftPoint = p => {
        if (!Array.isArray(p) || p.length < 2) return p;
        return [round2(Number(p[0]) + dx), round2(Number(p[1]) + dz)];
    };
    const shiftPoly = poly => Array.isArray(poly) ? poly.map(shiftPoint) : poly;
    const shiftPolys = polys => Array.isArray(polys) ? polys.map(shiftPoly) : polys;

    return {
        geometry: {
            ...geometry,
            tee: shiftPoly(geometry.tee),
            fairway: shiftPoly(geometry.fairway),
            green: shiftPoly(geometry.green),
            bunkers: shiftPolys(geometry.bunkers),
            water: shiftPolys(geometry.water),
            trees: shiftPoly(geometry.trees)
        },
        dx,
        dz
    };
}

function anchorTeeToFirstShot(geometry, targetTee) {
    const c = centroid(geometry?.tee) ?? centroid(geometry?.fairway);
    if (!c) {
        return { geometry, dx: 0, dz: 0 };
    }

    const dx = targetTee[0] - c[0];
    const dz = targetTee[1] - c[1];
    if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) {
        return { geometry, dx: 0, dz: 0 };
    }

    const shiftPoint = p => {
        if (!Array.isArray(p) || p.length < 2) return p;
        return [round2(Number(p[0]) + dx), round2(Number(p[1]) + dz)];
    };
    const shiftPoly = poly => Array.isArray(poly) ? poly.map(shiftPoint) : poly;
    const shiftPolys = polys => Array.isArray(polys) ? polys.map(shiftPoly) : polys;

    return {
        geometry: {
            ...geometry,
            tee: shiftPoly(geometry.tee),
            fairway: shiftPoly(geometry.fairway),
            green: shiftPoly(geometry.green),
            bunkers: shiftPolys(geometry.bunkers),
            water: shiftPolys(geometry.water),
            trees: shiftPoly(geometry.trees)
        },
        dx,
        dz
    };
}

function getHoleForRender(hole, holeGeometry) {
    if (!STRICT_VISUAL_ANCHOR_MODE || !holeGeometry) return hole;
    const greenCenter = centroid(holeGeometry.green);
    if (!greenCenter) return hole;
    return {
        ...hole,
        pin: {
            ...hole.pin,
            x: round2(greenCenter[0]),
            z: round2(greenCenter[1])
        }
    };
}

function buildStrictDirectionTarget(targetTee, firstNonPutt, pinTarget) {
    if (!firstNonPutt) return pinTarget;
    const sx = Number(firstNonPutt.start?.x);
    const sz = Number(firstNonPutt.start?.z);
    const ex = Number(firstNonPutt.end?.x);
    const ez = Number(firstNonPutt.end?.z);
    if (![sx, sz, ex, ez].every(Number.isFinite)) return pinTarget;

    const vx = ex - sx;
    const vz = ez - sz;
    const vLen = Math.hypot(vx, vz);
    const pinLen = Math.hypot(pinTarget[0] - targetTee[0], pinTarget[1] - targetTee[1]);
    if (vLen < 1 || pinLen < 1) return pinTarget;

    const ux = vx / vLen;
    const uz = vz / vLen;
    return [round2(targetTee[0] + ux * pinLen), round2(targetTee[1] + uz * pinLen)];
}

function transformGeometry(holeGeometry, sourceTee, targetTee, scale, cos, sin, mirrored = false, sourceDir = null) {
    const mapPoint = p => {
        if (!Array.isArray(p) || p.length < 2) return p;
        let x = Number(p[0]) - sourceTee[0];
        let z = Number(p[1]) - sourceTee[1];

        if (mirrored && sourceDir) {
            const ux = sourceDir[0];
            const uz = sourceDir[1];
            const lx = -uz;
            const lz = ux;
            const along = x * ux + z * uz;
            let lateral = x * lx + z * lz;
            lateral = -lateral;
            x = along * ux + lateral * lx;
            z = along * uz + lateral * lz;
        }

        const xr = (x * cos - z * sin) * scale + targetTee[0];
        const zr = (x * sin + z * cos) * scale + targetTee[1];
        return [round2(xr), round2(zr)];
    };

    const mapPolygon = poly => Array.isArray(poly) ? poly.map(mapPoint) : poly;
    const mapPolygons = polys => Array.isArray(polys) ? polys.map(mapPolygon) : polys;

    return {
        ...holeGeometry,
        tee: mapPolygon(holeGeometry.tee),
        fairway: mapPolygon(holeGeometry.fairway),
        green: mapPolygon(holeGeometry.green),
        bunkers: mapPolygons(holeGeometry.bunkers),
        water: mapPolygons(holeGeometry.water),
        trees: mapPolygon(holeGeometry.trees)
    };
}

function scoreGeometryFit(geometry, hole) {
    const fairway = Array.isArray(geometry?.fairway) ? geometry.fairway : null;
    const green = Array.isArray(geometry?.green) ? geometry.green : null;
    const polygons = [fairway, green].filter(p => Array.isArray(p) && p.length >= 3);
    if (polygons.length === 0) return Number.POSITIVE_INFINITY;

    const shotEnds = (hole.shots ?? [])
        .filter(s => Number(s.clubId) !== 13)
        .map(s => [Number(s.end.x), Number(s.end.z)])
        .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (shotEnds.length === 0) return Number.POSITIVE_INFINITY;

    let sum = 0;
    for (const p of shotEnds) {
        let best = Number.POSITIVE_INFINITY;
        for (const poly of polygons) {
            best = Math.min(best, distancePointToPolygon2D(p, poly));
        }
        sum += Math.min(best, 200);
    }
    return sum / shotEnds.length;
}

function distancePointToPolygon2D(point, polygon) {
    if (pointInPolygon2D(point, polygon)) return 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        best = Math.min(best, distancePointToSegment2D(point, a, b));
    }
    return best;
}

function pointInPolygon2D(point, polygon) {
    const [x, z] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = Number(polygon[i][0]), zi = Number(polygon[i][1]);
        const xj = Number(polygon[j][0]), zj = Number(polygon[j][1]);
        const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function distancePointToSegment2D(p, a, b) {
    const px = p[0], pz = p[1];
    const ax = Number(a[0]), az = Number(a[1]);
    const bx = Number(b[0]), bz = Number(b[1]);
    const vx = bx - ax, vz = bz - az;
    const wx = px - ax, wz = pz - az;
    const c1 = vx * wx + vz * wz;
    if (c1 <= 0) return Math.hypot(px - ax, pz - az);
    const c2 = vx * vx + vz * vz;
    if (c2 <= c1) return Math.hypot(px - bx, pz - bz);
    const t = c1 / c2;
    const qx = ax + t * vx;
    const qz = az + t * vz;
    return Math.hypot(px - qx, pz - qz);
}
