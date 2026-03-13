import * as THREE from 'three';
import { createScene, frameHole, focusCameraForPutt } from './scene.js?v=20260309i';
import { buildHole } from './course.js?v=20260311n';
import { buildShots, buildShotSpread, nextShot, prevShot, togglePlay, goToShot, getCurrentShot, updateAnimation, getShotCount, getPlaybackValue, seekPlayback, setCinematicMode, getBallPositionXZ } from './shots.js?v=20260312b';
import { initUI, populateRoundSelector, updateHoleInfo, updateShotInfo, updateCourseInfo, buildScorecard, onHoleClick, setPlayIcon, updateGeometryDebug, setTimelineBounds, setTimelineValue, onTimelineInput, onCinematicModeChange, setGeometryDebugVisible, updateHoleAnalytics, updateCaddiePlan, onCaddiePlanSelect, setCaddieVisible, setSpreadLegendVisible, syncSpreadLegendItems, setHolePanelVisible, setHoleAnalyticsVisible, setShotPanelVisible, onSpreadFiltersChange, getSpreadFilters, onPanelVisibilityChange, getPanelVisibility, onBestHoleReplay, onWorstHoleReplay, setRoundSelection, onImportGeometry, onMenuSettingsToggle, setMenuSettingsVisible, updateSimApiSummary, setMainMenuVisible, onMainMenuSelect, onOpenMainMenu, onAnalyticsToggle, setAnalyticsDetailsVisible } from './ui.js?v=20260313b';

let vizData = null;
let geometryData = null;
let smartDistancesData = [];
let clubNameIndex = new Map();
let shotOutcomeIndexByClubId = new Map();
let shotOutcomeIndexByLie = new Map();
let shotOutcomeIndexAll = [];
let currentRoundIdx = 0;
let currentHoleIdx = 0;
let currentHoleForRender = null;
let currentHoleGeometry = null;
let currentAnalysisGeometry = null;
let currentSelectedHole = null;
let currentSpreadSamples = [];
let currentAnalysisSamples = [];
let cameraPuttMode = false;
let cameraUserOverrideUntil = 0;
let geometryDebugVisible = false;
let spreadMode = false;
let spreadFilters = {
    club: 'all',
    range: 'all',
    showShots: false,
    heatmap: false,
    insightAim: true,
    insightDispersion: true,
    insightPenalty: false
};
let selectedTeePlanClub = null;
let analyticsDetailsVisible = false;
let panelVisibility = {
    hole: true,
    analytics: true,
    shot: true,
    caddie: true,
    spreadLegend: true
};
let sceneCtx = null;
const clock = { last: 0 };
const METERS_TO_YARDS = 1.09361;
const FORCE_GEOMETRY_FLIP_180 = false;
const STRICT_VISUAL_ANCHOR_MODE = false;
const AUTO_MIRROR_GEOMETRY = true;
const API_BASE = resolveApiBase();

async function init() {
    initUI();
    setMainMenuVisible(true);
    setMenuSettingsVisible(false);
    setGeometryDebugVisible(geometryDebugVisible);
    setAnalyticsDetailsVisible(false);
    updateSimApiSummary('Ready. Use Settings to import geometry.');
    panelVisibility = getPanelVisibility();
    applyPanelVisibility();

    try {
        vizData = await fetchApiFirstJson('/api/data/visualization', 'data/visualization_data.json');
    } catch (e) {
        document.getElementById('loading').textContent =
            'Could not load visualization data from API or local file - run the ArccosScraper export first.';
        console.error(e);
        return;
    }
    clubNameIndex = buildClubNameIndex(vizData.rounds ?? []);

    try {
        geometryData = await fetchApiFirstJson('/api/data/geometry', 'data/course_geometry.json');
    } catch {
        geometryData = null;
    }

    rebuildShotOutcomeIndex();

    try {
        const payload = await fetchApiFirstJson('/api/data/smart-distances', 'data/smart_distances.json');
        smartDistancesData = Array.isArray(payload) ? payload : [];
    } catch {
        smartDistancesData = [];
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
        if (spreadMode) {
            startReplayFromSpreadView();
            return;
        }
        const playing = togglePlay();
        setPlayIcon(playing);
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (isMainMenuVisible()) {
                setMainMenuVisible(false);
                setMenuSettingsVisible(false);
            }
            return;
        }
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
            if (spreadMode) {
                startReplayFromSpreadView();
                return;
            }
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
        if (e.key.toLowerCase() === 'm') {
            setMainMenuVisible(true);
        }
    });

    onHoleClick(idx => {
        currentHoleIdx = idx;
        selectedTeePlanClub = null;
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
    onAnalyticsToggle(() => {
        analyticsDetailsVisible = !analyticsDetailsVisible;
        setAnalyticsDetailsVisible(analyticsDetailsVisible);
    });
    onSpreadFiltersChange(filters => {
        const prev = spreadFilters;
        spreadFilters = filters;
        syncSpreadLegendItems(spreadFilters);
        if (!spreadMode) return;
        const rangeChanged = String(prev?.range ?? '') !== String(filters?.range ?? '');
        if (rangeChanged) {
            loadHole();
            return;
        }
        refreshSpreadLayerVisuals();
    });
    onPanelVisibilityChange(next => {
        panelVisibility = next;
        applyPanelVisibility();
    });
    onBestHoleReplay(() => {
        replayBestHoleForCurrent();
    });
    onWorstHoleReplay(() => {
        replayWorstHoleForCurrent();
    });
    onCaddiePlanSelect(club => {
        if (!club || normalize(club) === normalize(selectedTeePlanClub)) return;
        selectedTeePlanClub = club;
        refreshCaddieAndInsights();
    });
    onImportGeometry(async file => {
        await runGeometryImportApi(file);
    });
    onMenuSettingsToggle(() => {
        const next = !isMenuSettingsVisible();
        setMenuSettingsVisible(next);
    });
    onMainMenuSelect(async mode => {
        setMainMenuVisible(false);
        setMenuSettingsVisible(false);
        if (mode === 'replay') {
            spreadMode = false;
            analyticsDetailsVisible = false;
            setAnalyticsDetailsVisible(analyticsDetailsVisible);
            applyPanelVisibility();
            loadHole();
            return;
        }
        if (mode === 'spread') {
            spreadMode = true;
            analyticsDetailsVisible = true;
            setAnalyticsDetailsVisible(analyticsDetailsVisible);
            applyPanelVisibility();
            loadHole();
            return;
        }
    });
    onOpenMainMenu(() => {
        setMainMenuVisible(true);
        setMenuSettingsVisible(false);
    });
    const mainMenu = document.getElementById('main-menu');
    mainMenu?.addEventListener('click', e => {
        if (e.target !== mainMenu) return;
        setMainMenuVisible(false);
        setMenuSettingsVisible(false);
    });
    spreadFilters = getSpreadFilters();
    syncSpreadLegendItems(spreadFilters);
    setCinematicMode(true);
    applyPanelVisibility();

    clock.last = performance.now();
    requestAnimationFrame(animate);
}

function applyPanelVisibility() {
    setHolePanelVisible(panelVisibility.hole);
    setHoleAnalyticsVisible(panelVisibility.analytics);
    setShotPanelVisible(panelVisibility.shot);
    setCaddieVisible(panelVisibility.caddie);
    setSpreadLegendVisible(spreadMode && panelVisibility.spreadLegend);
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

async function runGeometryImportApi(file) {
    if (!file) return;
    updateSimApiSummary(`Importing geometry: ${file.name} ...`);
    try {
        const formData = new FormData();
        formData.append('file', file);
        const resp = await fetch(toApiUrl('/api/geometry/import'), {
            method: 'POST',
            body: formData
        });

        const text = await resp.text();
        let payload = null;
        try {
            payload = JSON.parse(text);
        } catch {
            payload = null;
        }

        if (!resp.ok) {
            const message = payload?.message ?? text ?? `HTTP ${resp.status}`;
            updateSimApiSummary(`Geometry import failed (${resp.status}).\n${message}`);
            return;
        }

        updateSimApiSummary(`Geometry import complete.\n${payload?.sourceFile ?? file.name}`);

        try {
            geometryData = await fetchApiFirstJson('/api/data/geometry', 'data/course_geometry.json');
            rebuildShotOutcomeIndex();
            loadHole();
        } catch (e) {
            updateSimApiSummary(`Imported but failed to reload geometry.\n${String(e)}`);
        }
    } catch (err) {
        updateSimApiSummary(`Geometry import error.\n${String(err)}`);
    }
}

function isMenuSettingsVisible() {
    const el = document.getElementById('menu-settings');
    if (!el) return false;
    return el.style.display !== 'none';
}

function isMainMenuVisible() {
    const el = document.getElementById('main-menu');
    if (!el) return false;
    return el.style.display !== 'none';
}

function resolveApiBase() {
    const queryBase = new URLSearchParams(window.location.search).get('apiBase');
    if (queryBase) return trimTrailingSlash(queryBase);
    if (typeof window !== 'undefined' && typeof window.GOLF_API_BASE === 'string' && window.GOLF_API_BASE.trim()) {
        return trimTrailingSlash(window.GOLF_API_BASE.trim());
    }
    // Local dev convenience: static frontend on 8080, API on 5077.
    if (window.location.hostname === 'localhost' && window.location.port === '8080') {
        return 'http://localhost:5077';
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

function buildClubNameIndex(rounds) {
    const votes = new Map();
    for (const round of rounds ?? []) {
        for (const hole of round?.holes ?? []) {
            for (const shot of hole?.shots ?? []) {
                const clubId = Number(shot?.clubId);
                const clubName = String(shot?.clubName ?? '').trim();
                if (!Number.isFinite(clubId) || !clubName) continue;
                const row = votes.get(clubId) ?? new Map();
                row.set(clubName, (row.get(clubName) ?? 0) + 1);
                votes.set(clubId, row);
            }
        }
    }

    const index = new Map();
    for (const [clubId, row] of votes.entries()) {
        const best = [...row.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best) index.set(clubId, best[0]);
    }
    return index;
}

function buildShotOutcomeIndex(rounds) {
    const byClubId = new Map();
    const byLie = new Map();
    const all = [];

    for (const round of rounds ?? []) {
        for (const hole of round?.holes ?? []) {
            const holeStatus = inspectHoleGeometry(round, hole);
            const holeForAnalysis = maybeMirrorHoleShots(hole, holeStatus.holeGeometry);
            const alignedGeometry = alignHoleGeometryToHole(holeStatus.holeGeometry, holeForAnalysis).geometry;
            const holeScore = Number(hole?.score);
            if (!Number.isFinite(holeScore)) continue;
            for (const shot of holeForAnalysis?.shots ?? []) {
                const clubId = Number(shot?.clubId);
                const shotNumber = Number(shot?.shotNumber);
                if (!Number.isFinite(clubId) || !Number.isFinite(shotNumber)) continue;
                if (shotNumber <= 1 || isPenaltyShot(shot)) continue;

                const startDistance = distanceToPinFromPoint(shot?.start, holeForAnalysis?.pin);
                const remainingAfter = holeScore - shotNumber;
                if (!Number.isFinite(startDistance) || !Number.isFinite(remainingAfter) || remainingAfter < 0) continue;
                const startPoint = [Number(shot?.start?.x), Number(shot?.start?.z)];
                const lie = alignedGeometry ? inferApproachLie(startPoint, alignedGeometry) : null;

                const sample = {
                    clubId,
                    startDistance,
                    remainingAfter,
                    lie
                };
                all.push(sample);
                const row = byClubId.get(clubId) ?? [];
                row.push(sample);
                byClubId.set(clubId, row);
                if (lie) {
                    const lieRows = byLie.get(lie) ?? [];
                    lieRows.push(sample);
                    byLie.set(lie, lieRows);
                }
            }
        }
    }

    return { byClubId, byLie, all };
}

function rebuildShotOutcomeIndex() {
    const shotOutcomeIndex = buildShotOutcomeIndex(vizData?.rounds ?? []);
    shotOutcomeIndexByClubId = shotOutcomeIndex.byClubId;
    shotOutcomeIndexByLie = shotOutcomeIndex.byLie;
    shotOutcomeIndexAll = shotOutcomeIndex.all;
}

function loadRound(idx) {
    currentRoundIdx = idx;
    selectedTeePlanClub = null;
    setRoundSelection(idx);
    const round = vizData.rounds[currentRoundIdx];
    const holeCount = Array.isArray(round?.holes) ? round.holes.length : 0;
    if (holeCount === 0) return;
    currentHoleIdx = Math.max(0, Math.min(currentHoleIdx, holeCount - 1));
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
    selectedTeePlanClub = null;
    analyticsDetailsVisible = false;
    setAnalyticsDetailsVisible(analyticsDetailsVisible);
    applyPanelVisibility();
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
    const selectedHoleRaw = round.holes[currentHoleIdx];
    const geometryStatus = inspectHoleGeometry(round, selectedHoleRaw);
    const selectedHole = maybeMirrorHoleShots(selectedHoleRaw, geometryStatus.holeGeometry);
    // Keep geometry orientation anchored to the selected round/hole view.
    // Spread mode should not re-decide mirroring from aggregated shot clouds.
    const aligned = alignHoleGeometryToHole(geometryStatus.holeGeometry, selectedHole);
    const holeGeometry = aligned.geometry;
    const analysisSamplesRaw = getHoleSamples(round, selectedHoleRaw.holeNumber, spreadFilters)
        .map(h => maybeMirrorHoleShots(h, geometryStatus.holeGeometry));
    const analysisSamples = normalizeSamplesToReference(analysisSamplesRaw, selectedHole, holeGeometry);
    const spreadSamples = spreadMode ? analysisSamples : [];
    const renderReferenceHole = spreadMode
        ? buildAggregateHoleForFrame(selectedHole, spreadSamples)
        : selectedHole;
    const analyticsHole = buildAggregateHoleForFrame(selectedHole, analysisSamples);
    const analyticsAligned = alignHoleGeometryToHole(geometryStatus.holeGeometry, analyticsHole);
    const analyticsGeometry = analyticsAligned.geometry ?? holeGeometry;
    const fairwayPolygons = asPolygonArrayFlexible(analyticsGeometry?.fairway);
    const teeOptions = enrichTeeOptionsForDecision(
        buildTeeClubDecisionStats(analysisSamples, fairwayPolygons),
        analyticsGeometry
    );
    selectedTeePlanClub = normalizeSelectedTeePlanClub(teeOptions, selectedTeePlanClub);
    const caddiePlanText = formatPreShotCaddiePlan(selectedHole, analysisSamples, analyticsGeometry, selectedTeePlanClub);
    const analyticsSummaryText = formatHoleAnalyticsBasic(selectedHole, analysisSamples, analyticsGeometry);
    const analyticsDetailsText = formatHoleAnalytics(selectedHole, analysisSamples, analyticsGeometry);
    const holeForRender = getHoleForRender(renderReferenceHole, holeGeometry);
    currentSelectedHole = selectedHole;
    currentSpreadSamples = spreadSamples;
    currentAnalysisSamples = analysisSamples;
    currentHoleForRender = holeForRender;
    currentHoleGeometry = holeGeometry;
    currentAnalysisGeometry = analyticsGeometry;
    cameraPuttMode = false;
    aligned.shotsMirrored = !!selectedHole?._forcedShotMirrored;
    aligned.holePin = selectedHole?.pin ? [Number(selectedHole.pin.x), Number(selectedHole.pin.z)] : null;
    const greenCenter = centroid(holeGeometry?.green);
    aligned.renderPin = holeForRender?.pin ? [Number(holeForRender.pin.x), Number(holeForRender.pin.z)] : null;
    aligned.greenCenter = greenCenter;
    aligned.renderPinDelta = (greenCenter && aligned.renderPin)
        ? Math.hypot(aligned.renderPin[0] - greenCenter[0], aligned.renderPin[1] - greenCenter[1])
        : null;

    clearDynamicSceneGroups(sceneCtx.scene);
    buildHole(sceneCtx.scene, holeForRender, holeGeometry);
    updateCaddiePlan(caddiePlanText);
    if (spreadMode) {
        buildShotSpread(sceneCtx.scene, spreadSamples, spreadFilters);
        const showInsights = spreadFilters.insightAim || spreadFilters.insightDispersion || spreadFilters.insightPenalty;
        if (showInsights) {
            buildSpreadInsightsOverlay(sceneCtx.scene, selectedHole, spreadSamples, holeGeometry, spreadFilters, selectedTeePlanClub);
        }
        setTimelineBounds(0);
        setTimelineValue(0, null);
        setPlayIcon(false);
        frameHole(sceneCtx.camera, sceneCtx.controls, holeForRender, holeGeometry);
        updateHoleAnalytics(analyticsSummaryText, analyticsDetailsText);
        setAnalyticsDetailsVisible(analyticsDetailsVisible);
        updateShotInfo(null);
    } else {
        buildShots(sceneCtx.scene, selectedHole);
        setTimelineBounds(getShotCount());
        frameHole(sceneCtx.camera, sceneCtx.controls, getHoleForRender(selectedHole, holeGeometry), holeGeometry);
        updateHoleAnalytics(analyticsSummaryText, analyticsDetailsText);
        setAnalyticsDetailsVisible(analyticsDetailsVisible);
        updateShotInfo(null);
    }
    const sceneDiag = inspectSceneGroups(sceneCtx.scene);
    updateHoleInfo(selectedHole);
    buildScorecard(round.holes, currentHoleIdx);
    goToShot(-1);
    setPlayIcon(false);
    setTimelineValue(0, null);
    updateGeometryDebug(formatGeometryDebug(geometryStatus, aligned, sceneDiag));
    applyPanelVisibility();
}

function refreshSpreadLayerVisuals() {
    if (!spreadMode || !sceneCtx) return;
    if (!currentSelectedHole) {
        loadHole();
        return;
    }

    clearTaggedSceneGroups(sceneCtx.scene, ['golf-shot-group', 'golf-insight-group']);
    buildShotSpread(sceneCtx.scene, currentSpreadSamples, spreadFilters);
    const showInsights = spreadFilters.insightAim || spreadFilters.insightDispersion || spreadFilters.insightPenalty;
    if (showInsights) {
        buildSpreadInsightsOverlay(sceneCtx.scene, currentSelectedHole, currentSpreadSamples, currentHoleGeometry, spreadFilters, selectedTeePlanClub);
    }
    updateShotInfo(null);
    setTimelineBounds(0);
    setTimelineValue(0, null);
    setPlayIcon(false);
}

function refreshCaddieAndInsights() {
    if (!currentSelectedHole) return;
    const fairwayPolygons = asPolygonArrayFlexible(currentAnalysisGeometry?.fairway);
    const teeOptions = enrichTeeOptionsForDecision(
        buildTeeClubDecisionStats(currentAnalysisSamples, fairwayPolygons),
        currentAnalysisGeometry
    );
    selectedTeePlanClub = normalizeSelectedTeePlanClub(teeOptions, selectedTeePlanClub);
    updateCaddiePlan(formatPreShotCaddiePlan(currentSelectedHole, currentAnalysisSamples, currentAnalysisGeometry, selectedTeePlanClub));
    if (spreadMode) {
        refreshSpreadLayerVisuals();
    }
}

function startReplayFromSpreadView() {
    spreadMode = false;
    analyticsDetailsVisible = false;
    setAnalyticsDetailsVisible(analyticsDetailsVisible);
    applyPanelVisibility();
    loadHole();
    const playing = togglePlay();
    setPlayIcon(playing);
}

function maybeMirrorHoleShots(hole, holeGeometry) {
    if (!hole || typeof holeGeometry?.forceMirrorShots !== 'boolean' || !holeGeometry.forceMirrorShots) {
        return hole;
    }

    const tee = getHoleTee(hole);
    const pin = getHolePin(hole);
    if (!tee || !pin) return hole;

    const vx = pin[0] - tee[0];
    const vz = pin[1] - tee[1];
    const len = Math.hypot(vx, vz);
    if (len < 1e-6) return hole;

    const ux = vx / len;
    const uz = vz / len;
    const mirror2d = (x, z) => {
        const rx = x - tee[0];
        const rz = z - tee[1];
        const lx = -uz;
        const lz = ux;
        const along = rx * ux + rz * uz;
        const lateral = rx * lx + rz * lz;
        const mx = tee[0] + along * ux - lateral * lx;
        const mz = tee[1] + along * uz - lateral * lz;
        return [round2(mx), round2(mz)];
    };
    const mirrorPoint3d = p => {
        if (!p) return p;
        const x = Number(p.x);
        const z = Number(p.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return p;
        const [mx, mz] = mirror2d(x, z);
        return { ...p, x: mx, z: mz };
    };

    return {
        ...hole,
        shots: (hole.shots ?? []).map(s => ({
            ...s,
            start: mirrorPoint3d(s.start),
            end: mirrorPoint3d(s.end)
        })),
        _forcedShotMirrored: true
    };
}

function normalizeSamplesToReference(samples, referenceHole, referenceGeometry = null) {
    if (!Array.isArray(samples) || samples.length === 0) return [];
    const normalized = [];
    for (const hole of samples) {
        normalized.push(normalizeHoleToReference(hole, referenceHole, referenceGeometry));
    }
    return normalized;
}

function normalizeHoleToReference(hole, referenceHole, referenceGeometry = null) {
    const refTee = getHoleTee(referenceHole);
    const refPin = getHolePin(referenceHole);
    const srcTee = getHoleTee(hole);
    const srcPin = getHolePin(hole);

    if (!refTee || !refPin || !srcTee || !srcPin) {
        return hole;
    }

    const noMirror = buildSimilarityTransform(srcTee, srcPin, refTee, refPin, false);
    const withMirror = buildSimilarityTransform(srcTee, srcPin, refTee, refPin, true);

    let chosen = noMirror;
    const geomDirect = scoreNormalizationAgainstGeometry(hole, noMirror, referenceGeometry, refTee, refPin);
    const geomMirror = scoreNormalizationAgainstGeometry(hole, withMirror, referenceGeometry, refTee, refPin);
    if (Number.isFinite(geomDirect) && Number.isFinite(geomMirror)) {
        chosen = geomMirror + 1e-6 < geomDirect ? withMirror : noMirror;
    } else {
        const firstTeeEnd = getFirstTeeEnd(hole);
        if (firstTeeEnd) {
            const direct = transformPointSimilarity(firstTeeEnd, noMirror);
            const mirrored = transformPointSimilarity(firstTeeEnd, withMirror);
            const scoreDirect = scoreTeeShotFit(direct, refTee, refPin);
            const scoreMirrored = scoreTeeShotFit(mirrored, refTee, refPin);
            chosen = scoreMirrored + 1e-6 < scoreDirect ? withMirror : noMirror;
        }
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

function scoreNormalizationAgainstGeometry(hole, transform, referenceGeometry, refTee, refPin) {
    const fairways = asPolygonArrayFlexible(referenceGeometry?.fairway);
    const greens = asPolygonArrayFlexible(referenceGeometry?.green);
    const surfaces = [...fairways, ...greens];
    if (surfaces.length === 0) return null;

    const nonPutts = (hole?.shots ?? [])
        .filter(s => Number(s?.clubId) !== 13 && !isPenaltyShot(s));
    if (nonPutts.length === 0) return null;

    let sum = 0;
    let n = 0;
    for (const shot of nonPutts) {
        const ex = Number(shot.end?.x);
        const ez = Number(shot.end?.z);
        if (!Number.isFinite(ex) || !Number.isFinite(ez)) continue;
        const p = transformPointSimilarity([ex, ez], transform);
        let best = Number.POSITIVE_INFINITY;
        for (const poly of surfaces) {
            best = Math.min(best, distancePointToPolygon2D(p, poly));
        }
        sum += Math.min(best, 200);
        n++;
    }
    if (n === 0) return null;

    let teeFairwayPenalty = 0;
    const teeShot = (hole.shots ?? []).find(s => Number(s.shotNumber) === 1 && Number(s.clubId) !== 13 && !isPenaltyShot(s));
    if (teeShot && fairways.length > 0) {
        const tx = Number(teeShot.end?.x);
        const tz = Number(teeShot.end?.z);
        if (Number.isFinite(tx) && Number.isFinite(tz)) {
            const teeEnd = transformPointSimilarity([tx, tz], transform);
            let bestFw = Number.POSITIVE_INFINITY;
            for (const fw of fairways) {
                bestFw = Math.min(bestFw, distancePointToPolygon2D(teeEnd, fw));
            }
            teeFairwayPenalty = Math.min(bestFw, 200) * 2.5;
        }
    }

    let directionalPenalty = 0;
    const firstEnd = getFirstTeeEnd(hole);
    if (firstEnd) {
        const teeEnd = transformPointSimilarity(firstEnd, transform);
        directionalPenalty = scoreTeeShotFit(teeEnd, refTee, refPin) * 0.25;
    }

    return (sum / n) + teeFairwayPenalty + directionalPenalty;
}

function changeHole(delta) {
    const round = vizData.rounds[currentRoundIdx];
    const newIdx = currentHoleIdx + delta;
    if (newIdx >= 0 && newIdx < round.holes.length) {
        currentHoleIdx = newIdx;
        selectedTeePlanClub = null;
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
    const s = buildHoleAnalyticsSummary(currentHole, samples, alignedGeometry);
    if (!s) return '<div class="analytics-muted">No samples found for this hole.</div>';

    const confidenceBadges = renderAnalyticsBadgeRow([
        ['Score', s.confidence.score],
        ['Tee', s.confidence.teePlan],
        ['FIR', s.confidence.fir],
        ['Putting', s.confidence.putting]
    ]);

    return [
        '<div class="analytics-stack">',
        renderAnalyticsSection('Sample', [
            ['Window', `${s.dateSpan} (${s.rounds} rounds)`],
            ['Normalized', `${s.normalizedCount}/${s.rounds} holes${s.mirroredCount > 0 ? ` | mirrored ${s.mirroredCount}` : ''}`]
        ], confidenceBadges),
        renderAnalyticsSection('Scoring', [
            ['This round', `${escapeHtml(String(currentHole.score))} (${escapeHtml(s.currentToParLabel)})`],
            ['Average', `${s.avgScore.toFixed(2)} per round`],
            ['Best', `${escapeHtml(String(s.bestRound.score))} (${escapeHtml(s.bestRound.toParLabel)}) on ${escapeHtml(s.bestRound.date)}`]
        ]),
        renderAnalyticsSection('Tee Game', [
            ['Primary plan', formatTeeOptionCompact(s.primaryTeeOption)],
            ['Safer fallback', formatTeeOptionCompact(s.conservativeTeeOption)],
            ['Usage', s.teeClubUsage],
            ['FIR', s.fir],
            ['FIR by club', s.teeFirByClub],
            ['Score by club', s.scoreByTeeClub]
        ]),
        renderAnalyticsSection('Approach And Green', [
            ['GIR', `${s.girPct.toFixed(1)}%`],
            ['Approach GIR', s.girByApproachClub],
            ['Avg putts', `${s.avgPutts.toFixed(2)} / hole`],
            ['3-putt rate', `${s.threePuttRate.toFixed(1)}%`],
            ['First putt', s.avgFirstPutt]
        ]),
        renderAnalyticsSection('Risk', [
            ['Penalties', `${s.avgPenalties.toFixed(2)} / hole`],
            ['Penalty events', s.penaltySummary.overview],
            ['Penalty split', s.penaltySummary.split],
            ['Penalty clubs', s.penaltySummary.byClub]
        ]),
        renderAnalyticsSection('Pattern And Plan', [
            ['Miss bias', s.lateral.text],
            ['Aim note', s.aimNote],
            ['Practice focus', s.practiceFocus]
        ]),
        '</div>'
    ].join('');
}

function formatHoleAnalyticsBasic(currentHole, samples, alignedGeometry = null) {
    const s = buildHoleAnalyticsSummary(currentHole, samples, alignedGeometry);
    if (!s) return '<div class="analytics-muted">No samples found for this hole.</div>';

    return [
        '<div class="analytics-stack">',
        '<div class="analytics-kpi-grid">',
        renderAnalyticsKpi('This Round', `${escapeHtml(String(currentHole.score))} (${escapeHtml(s.currentToParLabel)})`, `${s.rounds} rounds sampled`),
        renderAnalyticsKpi('Average', s.avgScore.toFixed(2), `Best ${escapeHtml(String(s.bestRound.score))} (${escapeHtml(s.bestRound.toParLabel)})`),
        renderAnalyticsKpi('FIR', s.firCompact, formatTeeOptionCompact(s.primaryTeeOption)),
        renderAnalyticsKpi('GIR / Putts', `${s.girPct.toFixed(1)}%`, `${s.avgPutts.toFixed(2)} putts | 3-putt ${s.threePuttRate.toFixed(1)}%`),
        '</div>',
        renderAnalyticsNote('Miss Pattern', `${escapeHtml(s.lateral.text)}<br><span class="analytics-muted">${escapeHtml(s.aimNote)}</span>`),
        renderAnalyticsNote('Practice Focus', escapeHtml(s.practiceFocus)),
        '</div>'
    ].join('');
}

function formatPreShotCaddiePlan(currentHole, samples, alignedGeometry = null, selectedClub = null) {
    if (!samples || samples.length === 0) {
        return '<div class="analytics-muted">No caddie data yet. Play more rounds on this hole to build recommendations.</div>';
    }

    const fairwayPolygons = asPolygonArrayFlexible(alignedGeometry?.fairway);
    const options = enrichTeeOptionsForDecision(
        buildTeeClubDecisionStats(samples, fairwayPolygons),
        alignedGeometry
    );
    if (options.length === 0) {
        return '<div class="analytics-muted">No valid tee-shot samples found for caddie planning.</div>';
    }

    const primary = choosePrimaryTeeOption(options);
    const conservative = chooseConservativeTeeOption(options, primary);
    const activeOption = resolveTeePlanOption(options, selectedClub) ?? primary;
    const planModel = buildSpreadInsightModel(currentHole, samples, alignedGeometry, activeOption?.club);
    const planAimNote = buildPlanAimNote(planModel?.teeStats, activeOption) ?? buildAimNote(lateralBiasStats(samples));
    const dateSpan = buildDateSpan(samples);
    const comparison = buildTeePlanComparison(primary, conservative);
    const primaryApproachPlan = buildApproachPlanForOption(primary, alignedGeometry);
    const conservativeApproachPlan = buildApproachPlanForOption(conservative, alignedGeometry);

    return [
        '<div class="caddie-stack">',
        `<div class="caddie-meta">Hole ${escapeHtml(String(currentHole.holeNumber))} (Par ${escapeHtml(String(currentHole.par))})<br>Window: ${escapeHtml(dateSpan)} (${samples.length} rounds)<br><span class="analytics-muted">Click a tee plan to preview its aim line and dispersion.</span></div>`,
        '<div class="caddie-plan-grid">',
        renderCaddiePlan(primary, primaryApproachPlan, 'Primary tee plan', 'primary', normalize(activeOption?.club) === normalize(primary?.club)),
        conservative && conservative.club !== primary?.club
            ? renderCaddiePlan(conservative, conservativeApproachPlan, 'Safer fallback', 'secondary', normalize(activeOption?.club) === normalize(conservative?.club))
            : '<div class="caddie-plan secondary disabled"><div class="caddie-plan-header"><div><div class="caddie-plan-label">Safer fallback</div><div class="caddie-plan-club">No distinct backup yet</div></div></div><div class="caddie-subnote">You need a few more rounds with a second tee club before a backup line is reliable.</div></div>',
        '</div>',
        renderCaddieCallout('Aim cue', escapeHtml(planAimNote)),
        comparison ? renderCaddieCallout('Tradeoff', comparison) : '',
        '</div>'
    ].join('');
}

function renderAnalyticsKpi(label, value, sub = '') {
    return [
        '<div class="analytics-kpi">',
        `<span class="analytics-kpi-label">${escapeHtml(label)}</span>`,
        `<span class="analytics-kpi-value">${escapeHtml(String(value ?? '-'))}</span>`,
        sub ? `<span class="analytics-kpi-sub">${escapeHtml(String(sub))}</span>` : '',
        '</div>'
    ].join('');
}

function renderAnalyticsNote(title, bodyHtml) {
    return [
        '<div class="analytics-note">',
        `<div class="analytics-note-title">${escapeHtml(title)}</div>`,
        `<div class="analytics-note-body">${bodyHtml}</div>`,
        '</div>'
    ].join('');
}

function renderAnalyticsSection(title, rows, prefixHtml = '') {
    return [
        '<section class="analytics-section">',
        `<div class="analytics-section-title">${escapeHtml(title)}</div>`,
        prefixHtml || '',
        '<div class="analytics-row-list">',
        rows.map(([label, value]) => renderAnalyticsRow(label, value)).join(''),
        '</div>',
        '</section>'
    ].join('');
}

function renderAnalyticsRow(label, value) {
    return [
        '<div class="analytics-row">',
        `<div class="analytics-row-label">${escapeHtml(label)}</div>`,
        `<div class="analytics-row-value">${escapeHtml(String(value ?? '-'))}</div>`,
        '</div>'
    ].join('');
}

function renderAnalyticsBadgeRow(badges) {
    const html = (badges ?? [])
        .filter(([label, value]) => !!label && !!value)
        .map(([label, value]) => `<span class="analytics-badge"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></span>`)
        .join('');
    return html ? `<div class="analytics-badge-row">${html}</div>` : '';
}

function renderCaddiePlan(option, approachPlan, label, tone, selected = false) {
    if (!option) {
        return `<div class="caddie-plan ${tone}"><div class="caddie-plan-header"><div><div class="caddie-plan-label">${escapeHtml(label)}</div><div class="caddie-plan-club">No data</div></div></div></div>`;
    }

    const sampleBadge = `${option.confidence} | n=${option.n}`;
    const leaveText = option.leaveDistance === null
        ? 'Leave distance not available'
        : `Leaves ~${option.leaveDistance.toFixed(0)} yds`;
    const landingText = option.avgTeeDistance === null
        ? 'Landing window building'
        : `Landing window ~${option.avgTeeDistance.toFixed(0)} yds`;
    const approachText = approachPlan?.label ?? 'Smart distances unavailable';

    const expectedScore = Number.isFinite(option.strategyExpectedScore) ? option.strategyExpectedScore : option.adjustedExpectedScore;
    const toPar = Number.isFinite(option.strategyToPar) ? option.strategyToPar : option.adjustedToPar;

    const rowsHtml = [
        renderCaddieRow('Expected score', `${expectedScore.toFixed(2)} (${formatSigned(toPar, 1)})`),
        renderCaddieRow('Fairway / risk', `${formatOptionFir(option)} | Pen ${(option.penaltyHoleRateAdj * 100).toFixed(0)}%`),
        renderCaddieRow('Tee outcome', `${landingText} | ${leaveText}`),
        renderCaddieRow('Smart next club', approachText),
        renderCaddieRow('Avg putts', `${option.avgPutts.toFixed(2)} / hole`)
    ].join('');

    return [
        `<button type="button" class="caddie-plan ${tone}${selected ? ' selected' : ''}" data-tee-plan-club="${escapeHtml(option.club)}">`,
        '<div class="caddie-plan-header">',
        `<div><div class="caddie-plan-label">${escapeHtml(label)}</div><div class="caddie-plan-club">${escapeHtml(option.club)}</div></div>`,
        `<div class="caddie-plan-badge">${selected ? 'Previewing' : escapeHtml(sampleBadge)}</div>`,
        '</div>',
        `<div class="caddie-row-list">${rowsHtml}</div>`,
        option.note ? `<div class="caddie-subnote">${escapeHtml(option.note)}</div>` : '',
        '</button>'
    ].join('');
}

function renderCaddieRow(label, value) {
    return [
        '<div class="caddie-row">',
        `<div class="caddie-row-label">${escapeHtml(label)}</div>`,
        `<div class="caddie-row-value">${escapeHtml(String(value ?? '-'))}</div>`,
        '</div>'
    ].join('');
}

function renderCaddieCallout(title, bodyHtml) {
    return [
        '<div class="caddie-callout">',
        `<div class="caddie-callout-title">${escapeHtml(title)}</div>`,
        `<div class="caddie-callout-body">${bodyHtml}</div>`,
        '</div>'
    ].join('');
}

function buildSpreadInsightsOverlay(scene, referenceHole, samples, alignedGeometry = null, options = {}, teePlanClub = null) {
    if (!scene || !referenceHole || !Array.isArray(samples) || samples.length === 0) return;
    const model = buildSpreadInsightModel(referenceHole, samples, alignedGeometry, teePlanClub);
    if (!model) return;

    const group = new THREE.Group();
    group.userData.tag = 'golf-insight-group';

    const showAim = options.insightAim !== false;
    const showDispersion = options.insightDispersion !== false;
    const showPenalty = options.insightPenalty !== false;

    if (showAim) {
        addDashedGroundLine(group, model.tee, model.pin, 0xe6eeff, 0.30, 0.85, 4);
    }

    if (model.teeStats) {
        const s = model.teeStats;
        if (showAim) {
            addDashedGroundLine(group, model.tee, s.idealAimPoint, 0x80deea, 0.92, 1.0, 4.5);
            addGroundRing(group, s.idealAimPoint, 2.0, 0x80deea, 0.72);

            addGroundLine(group, s.centerlinePoint, s.meanEnd, 0xff8a65, 0.95, 1.8);
            addGroundArrowHead(group, s.centerlinePoint, s.meanEnd, 0xff8a65);
            addGroundRing(group, s.meanEnd, 1.3, 0xff8a65, 0.68);
        }

        if (showDispersion) {
            const dispersion = buildDispersionEllipsePoints(
                model.tee,
                model.axis.u,
                model.axis.l,
                s.meanAlong,
                s.meanLateral,
                s.stdAlong,
                s.stdLateral
            );
            if (dispersion.length >= 3) {
                const pts = dispersion.map(p => new THREE.Vector3(p[0], 0.11, p[1]));
                pts.push(new THREE.Vector3(dispersion[0][0], 0.11, dispersion[0][1]));
                const geom = new THREE.BufferGeometry().setFromPoints(pts);
                const mat = new THREE.LineBasicMaterial({ color: 0xb2ebf2, transparent: true, opacity: 0.85 });
                const line = new THREE.Line(geom, mat);
                group.add(line);
            }
        }
    }

    if (showPenalty) {
        for (const hotspot of model.penaltyHotspots) {
            const radius = 1.2 + Math.sqrt(hotspot.count) * 0.9;
            const alpha = Math.min(0.46, 0.14 + hotspot.count * 0.05);
            addGroundDisc(group, hotspot.point, radius, 0xef5350, alpha, 0.09);
            addGroundRing(group, hotspot.point, radius + 0.45, 0xffcccb, 0.55);
        }
    }

    scene.add(group);
}

function buildSpreadInsightModel(referenceHole, samples, alignedGeometry = null, teePlanClub = null) {
    const tee = getHoleTee(referenceHole);
    const pin = getHolePin(referenceHole);
    if (!tee || !pin) return null;

    const vx = pin[0] - tee[0];
    const vz = pin[1] - tee[1];
    const pinLen = Math.hypot(vx, vz);
    if (pinLen < 1e-6) return null;

    const ux = vx / pinLen;
    const uz = vz / pinLen;
    const lx = -uz;
    const lz = ux;
    const fairwayPolygons = asPolygonArrayFlexible(alignedGeometry?.fairway);
    const teeOptions = enrichTeeOptionsForDecision(
        buildTeeClubDecisionStats(samples, fairwayPolygons),
        alignedGeometry
    );
    const primaryOption = choosePrimaryTeeOption(teeOptions);
    const activeOption = resolveTeePlanOption(teeOptions, teePlanClub) ?? primaryOption;
    let teeStats = buildTeeShotShapeStats(referenceHole, samples, activeOption?.club);
    if ((!teeStats || teeStats.n < 2) && samples.length > 0) {
        teeStats = buildTeeShotShapeStats(referenceHole, samples, null);
    }

    if (teeStats) {
        const targetAlong = clamp(teeStats.meanAlong, pinLen * 0.35, pinLen * 0.95);
        const fallbackAim = projectLocalToWorld(tee, [ux, uz], [lx, lz], targetAlong, teeStats.meanLateral);
        const fairwayAim = findFairwayAimPoint(fairwayPolygons, tee, [ux, uz], [lx, lz], targetAlong);
        const idealAimPoint = fairwayAim ?? fallbackAim;
        teeStats = {
            ...teeStats,
            idealAimPoint,
            primaryClub: activeOption?.club ?? teeStats.club ?? null
        };
    }

    const penaltyHotspots = buildPenaltyHotspotsFromSamples(samples, alignedGeometry);

    return {
        tee,
        pin,
        axis: {
            u: [ux, uz],
            l: [lx, lz]
        },
        primaryOption: activeOption,
        teeStats,
        penaltyHotspots
    };
}

function buildTeeShotShapeStats(referenceHole, samples, club = null) {
    const tee = getHoleTee(referenceHole);
    const pin = getHolePin(referenceHole);
    if (!tee || !pin) return null;

    const vx = pin[0] - tee[0];
    const vz = pin[1] - tee[1];
    const pinLen = Math.hypot(vx, vz);
    if (pinLen < 1e-6) return null;
    const ux = vx / pinLen;
    const uz = vz / pinLen;
    const lx = -uz;
    const lz = ux;

    const alongVals = [];
    const lateralVals = [];
    let matchedClub = null;

    for (const h of samples ?? []) {
        const teeShot = (h.shots ?? []).find(s => Number(s.shotNumber) === 1 && Number(s.clubId) !== 13 && !isPenaltyShot(s));
        if (!teeShot) continue;
        const teeClub = resolveClubName(teeShot);
        if (club && normalize(teeClub) !== normalize(club)) continue;
        const ex = Number(teeShot.end?.x);
        const ez = Number(teeShot.end?.z);
        if (!Number.isFinite(ex) || !Number.isFinite(ez)) continue;
        const rx = ex - tee[0];
        const rz = ez - tee[1];
        alongVals.push(rx * ux + rz * uz);
        lateralVals.push(rx * lx + rz * lz);
        matchedClub = teeClub;
    }

    if (alongVals.length === 0) return null;

    const meanAlong = avg(alongVals);
    const meanLateral = avg(lateralVals);
    return {
        club: matchedClub,
        n: alongVals.length,
        meanAlong,
        meanLateral,
        stdAlong: stddev(alongVals, meanAlong),
        stdLateral: stddev(lateralVals, meanLateral),
        centerlinePoint: projectLocalToWorld(tee, [ux, uz], [lx, lz], meanAlong, 0),
        meanEnd: projectLocalToWorld(tee, [ux, uz], [lx, lz], meanAlong, meanLateral)
    };
}

function findFairwayAimPoint(polygons, tee, unitForward, unitLateral, targetAlong) {
    if (!Array.isArray(polygons) || polygons.length === 0) return null;
    const searchOffsets = [0, 6, -6, 12, -12, 18, -18, 26, -26, 36, -36];
    for (const offset of searchOffsets) {
        const slice = findFairwaySliceAtAlong(polygons, tee, unitForward, unitLateral, targetAlong + offset);
        if (!slice) continue;
        return projectLocalToWorld(tee, unitForward, unitLateral, targetAlong + offset, slice.center);
    }

    const centroids = polygons
        .map(poly => centroid(poly))
        .filter(Boolean)
        .map(c => {
            const rx = c[0] - tee[0];
            const rz = c[1] - tee[1];
            return {
                point: c,
                along: rx * unitForward[0] + rz * unitForward[1]
            };
        });
    if (centroids.length === 0) return null;
    centroids.sort((a, b) => Math.abs(a.along - targetAlong) - Math.abs(b.along - targetAlong));
    return centroids[0].point;
}

function findFairwaySliceAtAlong(polygons, tee, unitForward, unitLateral, alongTarget) {
    const candidates = [];
    const eps = 1e-6;

    for (const poly of polygons ?? []) {
        const locals = poly.map(p => {
            const rx = p[0] - tee[0];
            const rz = p[1] - tee[1];
            return {
                along: rx * unitForward[0] + rz * unitForward[1],
                lateral: rx * unitLateral[0] + rz * unitLateral[1]
            };
        });

        const laterals = [];
        for (let i = 0; i < locals.length; i++) {
            const a = locals[i];
            const b = locals[(i + 1) % locals.length];
            const da = a.along - alongTarget;
            const db = b.along - alongTarget;

            if (Math.abs(da) < eps && Math.abs(db) < eps) {
                laterals.push(a.lateral, b.lateral);
                continue;
            }
            if (Math.abs(a.along - b.along) < eps) continue;
            if ((da <= 0 && db >= 0) || (da >= 0 && db <= 0)) {
                const t = (alongTarget - a.along) / (b.along - a.along);
                if (t >= -eps && t <= 1 + eps) {
                    laterals.push(a.lateral + (b.lateral - a.lateral) * t);
                }
            }
        }

        laterals.sort((a, b) => a - b);
        for (let i = 0; i + 1 < laterals.length; i += 2) {
            const left = laterals[i];
            const right = laterals[i + 1];
            const width = right - left;
            if (!Number.isFinite(width) || width <= 0.5) continue;
            candidates.push({
                center: (left + right) / 2,
                width
            });
        }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
        const byWidth = b.width - a.width;
        if (Math.abs(byWidth) > 0.25) return byWidth;
        return Math.abs(a.center) - Math.abs(b.center);
    });
    return candidates[0];
}

function projectLocalToWorld(origin, unitForward, unitLateral, along, lateral) {
    return [
        origin[0] + unitForward[0] * along + unitLateral[0] * lateral,
        origin[1] + unitForward[1] * along + unitLateral[1] * lateral
    ];
}

function buildPenaltyHotspotsFromSamples(samples, alignedGeometry = null) {
    const grid = 10;
    const map = new Map();

    for (const h of samples) {
        const analysis = analyzePenaltyEvents(h.shots ?? []);
        for (const ev of analysis.events) {
            const p = ev.sourcePoint;
            if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
            const gx = Math.round(p[0] / grid);
            const gz = Math.round(p[1] / grid);
            const key = `${gx},${gz}`;
            const row = map.get(key) ?? { sumX: 0, sumZ: 0, count: 0 };
            row.sumX += p[0];
            row.sumZ += p[1];
            row.count++;
            map.set(key, row);
        }
    }

    const hotspots = [...map.values()]
        .map(v => ({
            point: [v.sumX / v.count, v.sumZ / v.count],
            count: v.count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    // Keep hotspots only where geometry exists nearby when fairway/green polygons are available.
    const surfaces = [
        ...asPolygonArrayFlexible(alignedGeometry?.fairway),
        ...asPolygonArrayFlexible(alignedGeometry?.green)
    ];
    if (surfaces.length === 0) return hotspots;
    return hotspots.filter(h => {
        let best = Number.POSITIVE_INFINITY;
        for (const poly of surfaces) {
            best = Math.min(best, distancePointToPolygon2D(h.point, poly));
        }
        return best <= 70;
    });
}

function buildDispersionEllipsePoints(tee, unitForward, unitLateral, meanAlong, meanLateral, stdAlong, stdLateral) {
    const alongRadius = clamp(Math.max(6, stdAlong * 1.45), 6, 80);
    const latRadius = clamp(Math.max(4, stdLateral * 1.45), 4, 65);
    const points = [];
    const steps = 44;
    for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const along = meanAlong + Math.cos(t) * alongRadius;
        const lateral = meanLateral + Math.sin(t) * latRadius;
        points.push([
            tee[0] + unitForward[0] * along + unitLateral[0] * lateral,
            tee[1] + unitForward[1] * along + unitLateral[1] * lateral
        ]);
    }
    return points;
}

function addGroundLine(group, a, b, color, opacity = 1, y = 0.1) {
    const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a[0], y, a[1]),
        new THREE.Vector3(b[0], y, b[1])
    ]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    group.add(new THREE.Line(geom, mat));
}

function addDashedGroundLine(group, a, b, color, opacity = 0.8, y = 0.1, dashSize = 4) {
    const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a[0], y, a[1]),
        new THREE.Vector3(b[0], y, b[1])
    ]);
    const mat = new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity,
        dashSize,
        gapSize: dashSize * 0.8
    });
    const line = new THREE.Line(geom, mat);
    line.computeLineDistances();
    group.add(line);
}

function addGroundRing(group, point, radius, color, opacity = 0.7, y = 0.105) {
    const geom = new THREE.RingGeometry(Math.max(0.2, radius - 0.22), radius, 28);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geom, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(point[0], y, point[1]);
    group.add(ring);
}

function addGroundDisc(group, point, radius, color, opacity = 0.3, y = 0.085) {
    const geom = new THREE.CircleGeometry(radius, 24);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(geom, mat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(point[0], y, point[1]);
    group.add(disc);
}

function addGroundArrowHead(group, from, to, color) {
    const vx = to[0] - from[0];
    const vz = to[1] - from[1];
    const len = Math.hypot(vx, vz);
    if (len < 0.4) return;
    const ux = vx / len;
    const uz = vz / len;
    const lx = -uz;
    const lz = ux;
    const headLen = clamp(len * 0.12, 1.3, 3.8);
    const headWidth = headLen * 0.55;
    const tip = to;
    const base = [to[0] - ux * headLen, to[1] - uz * headLen];
    const left = [base[0] + lx * headWidth, base[1] + lz * headWidth];
    const right = [base[0] - lx * headWidth, base[1] - lz * headWidth];
    const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(tip[0], 0.12, tip[1]),
        new THREE.Vector3(left[0], 0.12, left[1]),
        new THREE.Vector3(right[0], 0.12, right[1]),
        new THREE.Vector3(tip[0], 0.12, tip[1])
    ]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 });
    group.add(new THREE.Line(geom, mat));
}

function buildHoleAnalyticsSummary(currentHole, samples, alignedGeometry = null) {
    if (!samples || samples.length === 0) return null;

    const rounds = samples.length;
    const holePar = avg(samples.map(h => Number(h.par))) || Number(currentHole?.par) || 0;
    const avgScore = avg(samples.map(h => Number(h.score)));
    const puttsPerHole = samples.map(h => (h.shots ?? []).filter(s => Number(s.clubId) === 13).length);
    const penaltiesPerHole = samples.map(h => countPenalties(h.shots ?? []));
    const firstPuttDists = samples
        .map(h => (h.shots ?? []).find(s => Number(s.clubId) === 13))
        .filter(s => !!s)
        .map(s => Number(s.distance));
    const girCount = samples.filter(h => isGir(h)).length;
    const girPct = rounds > 0 ? (girCount / rounds * 100) : 0;
    const threePuttCount = puttsPerHole.filter(p => p >= 3).length;
    const threePuttRate = rounds > 0 ? (threePuttCount / rounds * 100) : 0;
    const fairwayPolygons = asPolygonArrayFlexible(alignedGeometry?.fairway);
    const firStats = computeFirStats(samples, alignedGeometry);
    const fir = firStats.available
        ? `FIR (geom): ${firStats.hits}/${firStats.total} (${firStats.pct.toFixed(1)}%)`
        : firStats.label;
    const firCompact = firStats.available
        ? `FIR ${firStats.hits}/${firStats.total} (${firStats.pct.toFixed(1)}%)`
        : 'FIR n/a';
    const lateral = lateralBiasStats(samples);
    const dateSpan = buildDateSpan(samples);
    const normalizedCount = samples.filter(s => s._normalized).length;
    const mirroredCount = samples.filter(s => s._normalizedMirrored).length;
    const bestRound = findBestRoundOnHole(samples, Number(currentHole.par));
    const teeFirByClub = buildTeeFirByClub(samples, fairwayPolygons);
    const girByApproachClub = buildGirByApproachClub(samples);
    const scoreByTeeClub = buildScoreByTeeClub(samples);
    const teeClubUsage = buildTeeClubUsage(samples);
    const penaltySummary = buildPenaltySummary(samples);
    const teeOptions = enrichTeeOptionsForDecision(
        buildTeeClubDecisionStats(samples, fairwayPolygons),
        alignedGeometry
    );
    const primaryTeeOption = choosePrimaryTeeOption(teeOptions);
    const conservativeTeeOption = chooseConservativeTeeOption(teeOptions, primaryTeeOption);
    const teeRecommendation = buildBestTeeRecommendation(samples, fairwayPolygons, alignedGeometry);
    const aimNote = buildAimNote(lateral);
    const currentToParLabel = formatToPar(Number(currentHole.score) - Number(currentHole.par));
    const confidence = {
        score: formatConfidenceBadge(rounds, { high: 18, medium: 8 }),
        teePlan: formatConfidenceBadge(primaryTeeOption?.n ?? 0, { high: 8, medium: 4 }),
        fir: firStats.available ? formatConfidenceBadge(firStats.total, { high: 16, medium: 8 }) : 'n/a',
        putting: formatConfidenceBadge(firstPuttDists.length, { high: 18, medium: 8 })
    };
    const practiceFocus = buildPracticeFocus({
        avgPenalties: avg(penaltiesPerHole),
        threePuttRate,
        girPct,
        firPct: firStats.available ? firStats.pct : null
    });

    return {
        rounds,
        holePar,
        avgScore,
        avgPutts: avg(puttsPerHole),
        avgPenalties: avg(penaltiesPerHole),
        avgFirstPutt: firstPuttDists.length ? `${avg(firstPuttDists).toFixed(1)} yds` : '-',
        girPct,
        threePuttRate,
        fir,
        firCompact,
        firPct: firStats.available ? firStats.pct : null,
        lateral,
        dateSpan,
        normalizedCount,
        mirroredCount,
        bestRound,
        teeFirByClub,
        girByApproachClub,
        scoreByTeeClub,
        teeClubUsage,
        penaltySummary,
        teeOptions,
        primaryTeeOption,
        conservativeTeeOption,
        teeRecommendation,
        aimNote,
        currentToParLabel,
        confidence,
        practiceFocus
    };
}

function buildDateSpan(samples) {
    const dates = samples.map(s => String(s._roundDate ?? '')).filter(Boolean).sort();
    if (dates.length === 0) return '-';
    return dates.length === 1 ? dates[0] : `${dates[0]} -> ${dates[dates.length - 1]}`;
}

function computeFirStats(samples, alignedGeometry) {
    const fairwayPolygons = asPolygonArrayFlexible(alignedGeometry?.fairway);
    if (fairwayPolygons.length === 0) {
        return { available: false, label: 'FIR (geom): n/a (no fairway polygons)' };
    }
    const eligible = samples.filter(h => Number(h.par) >= 4);
    if (eligible.length === 0) {
        return { available: false, label: 'FIR (geom): n/a' };
    }

    let hits = 0;
    let total = 0;
    for (const h of eligible) {
        const teeShot = (h.shots ?? []).find(s => Number(s.shotNumber) === 1);
        if (!teeShot) continue;
        const p = [Number(teeShot.end?.x), Number(teeShot.end?.z)];
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        total++;
        if (pointInAnyPolygon2D(p, fairwayPolygons)) hits++;
    }
    if (total === 0) {
        return { available: false, label: 'FIR (geom): n/a' };
    }
    return {
        available: true,
        hits,
        total,
        pct: (hits / total * 100),
        label: `FIR (geom): ${hits}/${total} (${(hits / total * 100).toFixed(1)}%)`
    };
}

function lateralBiasStats(samples) {
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
    if (vals.length === 0) {
        return { hasData: false, mean: 0, side: 'n/a', text: 'n/a' };
    }
    const mean = avg(vals);
    const side = mean >= 0 ? 'right' : 'left';
    return {
        hasData: true,
        mean,
        side,
        text: `${Math.abs(mean).toFixed(1)}m ${side} (avg lateral)`
    };
}

function buildAimNote(lateral) {
    if (!lateral?.hasData) return 'Collect more rounds for a pattern.';
    const miss = Math.abs(Number(lateral.mean));
    if (!Number.isFinite(miss) || miss < 3) {
        return 'Miss pattern is relatively centered.';
    }
    const counter = lateral.side === 'left' ? 'right' : 'left';
    const offset = Math.max(2, Math.min(20, miss * 0.35));
    return `Misses trend ${lateral.side}; test starting ${counter} by ~${offset.toFixed(1)}m.`;
}

function buildPracticeFocus(summary) {
    if (!summary) return 'Collect more rounds for a stable signal.';
    if (summary.avgPenalties >= 0.35) {
        return 'Penalty control first. Use the conservative tee plan until penalties fall below 0.25/hole.';
    }
    if (summary.threePuttRate >= 20) {
        return 'Lag putting focus. Prioritize 20-40 ft distance control and leave inside 3 ft.';
    }
    if (summary.girPct < 30) {
        return 'Approach proximity focus. Practice your most common approach-yardage windows.';
    }
    if (Number.isFinite(summary.firPct) && summary.firPct < 45) {
        return 'Tee dispersion focus. Build one fairway-finder stock shot off this tee.';
    }
    return 'Scoring stability focus. Keep current tee strategy and sharpen birdie-putt conversion.';
}

function formatConfidenceBadge(sampleCount, thresholds = { high: 18, medium: 8 }) {
    const n = Number(sampleCount);
    if (!Number.isFinite(n) || n <= 0) return 'Low (n=0)';
    if (n >= thresholds.high) return `High (n=${n})`;
    if (n >= thresholds.medium) return `Medium (n=${n})`;
    return `Low (n=${n})`;
}

function formatToPar(diff) {
    if (!Number.isFinite(diff)) return '-';
    if (diff === 0) return 'E';
    return diff > 0 ? `+${diff}` : `${diff}`;
}

function formatSigned(value, decimals = 1) {
    if (!Number.isFinite(value)) return '-';
    const abs = Math.abs(value);
    if (abs < Math.pow(10, -decimals) / 2) return 'E';
    const sign = value > 0 ? '+' : '-';
    return `${sign}${abs.toFixed(decimals)}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function findBestRoundOnHole(samples, par) {
    let best = null;
    for (const h of samples) {
        const score = Number(h?.score);
        if (!Number.isFinite(score)) continue;
        if (!best || score < best.score) {
            best = { score, date: String(h?._roundDate ?? '-') };
        }
    }
    if (!best) {
        return { score: '-', date: '-', toParLabel: '-' };
    }
    const p = Number(par);
    if (!Number.isFinite(p)) {
        return { score: best.score, date: best.date, toParLabel: '-' };
    }
    const diff = best.score - p;
    const toParLabel = diff === 0 ? 'E' : (diff > 0 ? `+${diff}` : `${diff}`);
    return { score: best.score, date: best.date, toParLabel };
}

function resolveClubName(shot) {
    const name = String(shot?.clubName ?? '').trim();
    if (name) return name;
    const id = Number(shot?.clubId);
    return Number.isFinite(id) ? `Club ${id}` : 'Unknown';
}

function buildTeeFirByClub(samples, fairwayPolygons) {
    if (!Array.isArray(fairwayPolygons) || fairwayPolygons.length === 0) {
        return 'n/a (no fairway polygons)';
    }
    const stats = new Map();
    for (const h of samples) {
        if (Number(h?.par) < 4) continue;
        const teeShot = (h.shots ?? []).find(s => Number(s.shotNumber) === 1);
        if (!teeShot) continue;
        if (isPenaltyShot(teeShot)) continue;
        const p = [Number(teeShot.end?.x), Number(teeShot.end?.z)];
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        const club = resolveClubName(teeShot);
        const row = stats.get(club) ?? { total: 0, hits: 0 };
        row.total++;
        if (pointInAnyPolygon2D(p, fairwayPolygons)) row.hits++;
        stats.set(club, row);
    }
    if (stats.size === 0) return 'n/a';
    const lines = [...stats.entries()]
        .sort((a, b) => {
            const byTotal = b[1].total - a[1].total;
            if (byTotal !== 0) return byTotal;
            const ra = a[1].total > 0 ? a[1].hits / a[1].total : 0;
            const rb = b[1].total > 0 ? b[1].hits / b[1].total : 0;
            return rb - ra;
        })
        .slice(0, 3)
        .map(([club, row]) => `${club} ${row.hits}/${row.total} (${(row.hits / row.total * 100).toFixed(0)}%)`);
    return lines.join(' | ');
}

function buildGirByApproachClub(samples) {
    const stats = new Map();
    for (const h of samples) {
        const firstPuttIdx = (h.shots ?? []).findIndex(s => Number(s.clubId) === 13);
        if (firstPuttIdx <= 0) continue;
        let approachShot = null;
        for (let i = firstPuttIdx - 1; i >= 0; i--) {
            const s = h.shots[i];
            if (Number(s?.clubId) !== 13 && !isPenaltyShot(s)) {
                approachShot = s;
                break;
            }
        }
        if (!approachShot) continue;
        const club = resolveClubName(approachShot);
        const row = stats.get(club) ?? { total: 0, hits: 0 };
        row.total++;
        if (isGir(h)) row.hits++;
        stats.set(club, row);
    }
    if (stats.size === 0) return 'n/a';
    const lines = [...stats.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 3)
        .map(([club, row]) => `${club} ${row.hits}/${row.total} (${(row.hits / row.total * 100).toFixed(0)}%)`);
    return lines.join(' | ');
}

function buildScoreByTeeClub(samples) {
    const stats = new Map();
    for (const h of samples) {
        const teeShot = (h.shots ?? []).find(s => Number(s.shotNumber) === 1);
        if (!teeShot) continue;
        if (isPenaltyShot(teeShot)) continue;
        const score = Number(h?.score);
        if (!Number.isFinite(score)) continue;
        const club = resolveClubName(teeShot);
        const row = stats.get(club) ?? { total: 0, sumScore: 0 };
        row.total++;
        row.sumScore += score;
        stats.set(club, row);
    }
    if (stats.size === 0) return 'n/a';
    const lines = [...stats.entries()]
        .map(([club, row]) => ({ club, n: row.total, avg: row.sumScore / row.total }))
        .sort((a, b) => {
            const byAvg = a.avg - b.avg;
            if (byAvg !== 0) return byAvg;
            return b.n - a.n;
        })
        .slice(0, 3)
        .map(x => `${x.club} ${x.avg.toFixed(2)} (n=${x.n})`);
    return lines.join(' | ');
}

function buildTeeClubUsage(samples) {
    const counts = new Map();
    let total = 0;

    for (const h of samples) {
        const teeShot = (h.shots ?? []).find(s => Number(s.shotNumber) === 1);
        if (!teeShot) continue;
        if (isPenaltyShot(teeShot)) continue;
        const club = resolveClubName(teeShot);
        counts.set(club, (counts.get(club) ?? 0) + 1);
        total++;
    }

    if (counts.size === 0 || total === 0) return 'n/a';
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([club, count]) => `${club} ${(count / total * 100).toFixed(0)}% (n=${count})`)
        .join(' | ');
}

function buildTeeClubDecisionStats(samples, fairwayPolygons) {
    const stats = new Map();
    const hasFairwayGeom = Array.isArray(fairwayPolygons) && fairwayPolygons.length > 0;
    const validScores = (samples ?? [])
        .map(h => Number(h?.score))
        .filter(Number.isFinite);
    const holeAvgScore = validScores.length > 0 ? avg(validScores) : 0;
    const holePar = avg((samples ?? []).map(h => Number(h?.par))) || 0;
    const priorRounds = 6;

    for (const h of samples ?? []) {
        const teeShot = (h.shots ?? []).find(s => Number(s.shotNumber) === 1);
        if (!teeShot || isPenaltyShot(teeShot)) continue;

        const score = Number(h?.score);
        const par = Number(h?.par);
        if (!Number.isFinite(score) || !Number.isFinite(par)) continue;

        const club = resolveClubName(teeShot);
        const row = stats.get(club) ?? {
            n: 0,
            sumScore: 0,
            sumToPar: 0,
            sumPutts: 0,
            sumTeeDistance: 0,
            teeDistanceCount: 0,
            sumLeaveDistance: 0,
            leaveCount: 0,
            sumEndX: 0,
            sumEndZ: 0,
            endCount: 0,
            nextClubCounts: new Map(),
            nextShotCount: 0,
            sumNextShotDistance: 0,
            firHits: 0,
            firTotal: 0,
            penaltyHoles: 0,
            penaltyShots: 0
        };

        row.n++;
        row.sumScore += score;
        row.sumToPar += (score - par);
        row.sumPutts += countPutts(h.shots ?? []);

        const teeDistance = Number(teeShot.distance);
        if (Number.isFinite(teeDistance)) {
            row.sumTeeDistance += teeDistance;
            row.teeDistanceCount++;
        }

        const leaveDistance = distanceToPinFromShotEnd(teeShot, h);
        if (Number.isFinite(leaveDistance)) {
            row.sumLeaveDistance += leaveDistance;
            row.leaveCount++;
        }
        const endX = Number(teeShot.end?.x);
        const endZ = Number(teeShot.end?.z);
        if (Number.isFinite(endX) && Number.isFinite(endZ)) {
            row.sumEndX += endX;
            row.sumEndZ += endZ;
            row.endCount++;
        }

        const nextShot = findNextPlayableShotAfterTee(h.shots ?? []);
        if (nextShot) {
            const nextClub = resolveClubName(nextShot);
            row.nextClubCounts.set(nextClub, (row.nextClubCounts.get(nextClub) ?? 0) + 1);
            const nextDistance = Number(nextShot.distance);
            if (Number.isFinite(nextDistance)) {
                row.sumNextShotDistance += nextDistance;
                row.nextShotCount++;
            }
        }

        const penaltyCount = countPenalties(h.shots ?? []);
        if (penaltyCount > 0) row.penaltyHoles++;
        row.penaltyShots += penaltyCount;

        if (hasFairwayGeom && par >= 4) {
            const p = [Number(teeShot.end?.x), Number(teeShot.end?.z)];
            if (Number.isFinite(p[0]) && Number.isFinite(p[1])) {
                row.firTotal++;
                if (pointInAnyPolygon2D(p, fairwayPolygons)) row.firHits++;
            }
        }

        stats.set(club, row);
    }

    return [...stats.entries()].map(([club, row]) => {
        const avgScore = row.sumScore / row.n;
        const avgToPar = row.sumToPar / row.n;
        const adjustedExpectedScore = (row.sumScore + holeAvgScore * priorRounds) / (row.n + priorRounds);
        const adjustedToPar = adjustedExpectedScore - holePar;
        const firRate = row.firTotal > 0 ? row.firHits / row.firTotal : null;
        const firRateAdj = row.firTotal > 0 ? (row.firHits + 1) / (row.firTotal + 2) : null;
        const penaltyHoleRate = row.penaltyHoles / row.n;
        const penaltyHoleRateAdj = (row.penaltyHoles + 1) / (row.n + 2);
        const penaltyShotRate = row.penaltyShots / row.n;
        const avgPutts = row.sumPutts / row.n;
        const avgTeeDistance = row.teeDistanceCount > 0 ? row.sumTeeDistance / row.teeDistanceCount : null;
        const leaveDistance = row.leaveCount > 0 ? row.sumLeaveDistance / row.leaveCount : null;
        const meanEndPoint = row.endCount > 0 ? [row.sumEndX / row.endCount, row.sumEndZ / row.endCount] : null;
        const nextClubEntry = [...row.nextClubCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
        const historicalNextClub = nextClubEntry?.[0] ?? null;
        const historicalNextClubShare = nextClubEntry ? nextClubEntry[1] / row.n : 0;
        const avgNextShotDistance = row.nextShotCount > 0 ? row.sumNextShotDistance / row.nextShotCount : null;
        const samplePenalty = Math.max(0, 3 - row.n) * 0.08 + (priorRounds / (row.n + priorRounds)) * 0.08;
        const primaryScore = adjustedExpectedScore + penaltyHoleRateAdj * 0.2 + samplePenalty;
        const conservativeScore = adjustedExpectedScore
            + penaltyHoleRateAdj * 0.55
            + (firRateAdj === null ? 0.08 : (1 - firRateAdj) * 0.2)
            + samplePenalty * 0.35;
        const noteParts = [];
        if (Number.isFinite(avgTeeDistance)) {
            noteParts.push(`lands ~${avgTeeDistance.toFixed(0)} yds`);
        }
        if (Number.isFinite(leaveDistance)) {
            noteParts.push(`leaves ~${leaveDistance.toFixed(0)} yds`);
        }

        return {
            club,
            n: row.n,
            avgScore,
            avgToPar,
            adjustedExpectedScore,
            adjustedToPar,
            firRate,
            firRateAdj,
            penaltyHoleRate,
            penaltyHoleRateAdj,
            penaltyShotRate,
            avgPutts,
            avgTeeDistance,
            leaveDistance,
            meanEndPoint,
            historicalNextClub,
            historicalNextClubShare,
            avgNextShotDistance,
            primaryScore,
            conservativeScore,
            confidence: formatConfidenceBadge(row.n, { high: 8, medium: 4 }),
            note: noteParts.join(' | ')
        };
    });
}

function enrichTeeOptionsForDecision(options, alignedGeometry = null) {
    return (options ?? []).map(option => {
        const approachPlan = buildApproachPlanForOption(option, alignedGeometry);
        const continuation = estimateContinuationForApproachPlan(approachPlan, option.leaveDistance);
        const stateExpectedScore = continuation
            ? 1 + option.penaltyHoleRateAdj + continuation.strokesFromHere
            : option.adjustedExpectedScore + option.penaltyHoleRateAdj * 0.25;
        const modeledExpectedScore = continuation
            ? stateExpectedScore + (continuation.approachGapPenalty ?? 0)
            : stateExpectedScore;
        const observedWeight = clamp(option.n / 10, 0.18, 0.70);
        const strategyExpectedScore = (option.adjustedExpectedScore * observedWeight)
            + (modeledExpectedScore * (1 - observedWeight));
        const holePar = option.adjustedExpectedScore - option.adjustedToPar;
        const strategyToPar = strategyExpectedScore - holePar;
        const strategyPrimaryScore = strategyExpectedScore
            + Math.max(0, option.penaltyHoleRateAdj - 0.22) * 0.10
            + (Number.isFinite(option.firRateAdj) ? Math.max(0, 0.52 - option.firRateAdj) * 0.03 : 0);
        const strategyConservativeScore = strategyExpectedScore
            + option.penaltyHoleRateAdj * 0.40
            + (Number.isFinite(option.firRateAdj) ? (1 - option.firRateAdj) * 0.16 : 0.08);

        return {
            ...option,
            approachPlan,
            continuation,
            stateExpectedScore,
            modeledExpectedScore,
            strategyExpectedScore,
            strategyToPar,
            strategyPrimaryScore,
            strategyConservativeScore
        };
    });
}

function choosePrimaryTeeOption(options) {
    if (!Array.isArray(options) || options.length === 0) return null;
    const pool = stableTeeOptionPool(options);
    return [...pool].sort((a, b) => {
        if (a.n >= 3 && b.n < 3) return -1;
        if (b.n >= 3 && a.n < 3) return 1;
        const scoreA = Number.isFinite(a.strategyPrimaryScore) ? a.strategyPrimaryScore : a.primaryScore;
        const scoreB = Number.isFinite(b.strategyPrimaryScore) ? b.strategyPrimaryScore : b.primaryScore;
        if (Math.abs(scoreA - scoreB) > 0.03) return scoreA - scoreB;
        if (a.penaltyHoleRateAdj !== b.penaltyHoleRateAdj) return a.penaltyHoleRateAdj - b.penaltyHoleRateAdj;
        const firA = a.firRateAdj ?? -1;
        const firB = b.firRateAdj ?? -1;
        if (firA !== firB) return firB - firA;
        const expA = Number.isFinite(a.strategyExpectedScore) ? a.strategyExpectedScore : a.adjustedExpectedScore;
        const expB = Number.isFinite(b.strategyExpectedScore) ? b.strategyExpectedScore : b.adjustedExpectedScore;
        if (expA !== expB) return expA - expB;
        return b.n - a.n;
    })[0];
}

function chooseConservativeTeeOption(options, primary) {
    if (!Array.isArray(options) || options.length === 0) return null;
    const stable = stableTeeOptionPool(options);
    const others = stable.filter(o => o.club !== primary?.club);
    const pool = others.length > 0 ? others : options;
    return [...pool].sort((a, b) => {
        if (a.n >= 3 && b.n < 3) return -1;
        if (b.n >= 3 && a.n < 3) return 1;
        const scoreA = Number.isFinite(a.strategyConservativeScore) ? a.strategyConservativeScore : a.conservativeScore;
        const scoreB = Number.isFinite(b.strategyConservativeScore) ? b.strategyConservativeScore : b.conservativeScore;
        if (scoreA !== scoreB) return scoreA - scoreB;
        if (a.penaltyHoleRateAdj !== b.penaltyHoleRateAdj) return a.penaltyHoleRateAdj - b.penaltyHoleRateAdj;
        const firA = a.firRateAdj ?? -1;
        const firB = b.firRateAdj ?? -1;
        if (firA !== firB) return firB - firA;
        return b.n - a.n;
    })[0];
}

function stableTeeOptionPool(options, minSamples = 3) {
    const stable = (options ?? []).filter(o => Number(o?.n) >= minSamples);
    return stable.length > 0 ? stable : (options ?? []);
}

function resolveTeePlanOption(options, club) {
    const key = normalize(club);
    if (!key) return null;
    return (options ?? []).find(o => normalize(o?.club) === key) ?? null;
}

function normalizeSelectedTeePlanClub(options, club) {
    const match = resolveTeePlanOption(options, club);
    return match?.club ?? null;
}

function describeCaddieOption(option) {
    if (!option) return 'No option available.';
    const sampleTag = option.n < 3 ? ' (low sample)' : '';
    const firText = option.firRateAdj === null ? 'n/a' : `${(option.firRateAdj * 100).toFixed(0)}%`;
    const expectedScore = Number.isFinite(option.strategyExpectedScore) ? option.strategyExpectedScore : option.adjustedExpectedScore;
    const toPar = Number.isFinite(option.strategyToPar) ? option.strategyToPar : option.adjustedToPar;
    return [
        `${option.club}${sampleTag}`,
        `Expected score: ${expectedScore.toFixed(2)} (${formatSigned(toPar, 1)})`,
        `FIR: ${firText}`,
        `Penalty risk: ${(option.penaltyHoleRateAdj * 100).toFixed(0)}% holes`,
        `Leaves: ${option.leaveDistance === null ? 'n/a' : `${option.leaveDistance.toFixed(0)} yds`}`,
        `Sample: n=${option.n}`
    ].join('\n');
}

function buildBestTeeRecommendation(samples, fairwayPolygons, alignedGeometry = null) {
    const options = enrichTeeOptionsForDecision(
        buildTeeClubDecisionStats(samples, fairwayPolygons),
        alignedGeometry
    );
    if (options.length === 0) return 'n/a';
    const best = choosePrimaryTeeOption(options);
    if (!best) return 'n/a';

    const expectedScore = Number.isFinite(best.strategyExpectedScore) ? best.strategyExpectedScore : best.adjustedExpectedScore;
    const toPar = formatSigned(Number.isFinite(best.strategyToPar) ? best.strategyToPar : best.adjustedToPar, 1);
    const firText = best.firRateAdj === null ? 'FIR n/a' : `FIR ${(best.firRateAdj * 100).toFixed(0)}%`;
    const penText = `pen ${(best.penaltyHoleRateAdj * 100).toFixed(0)}%`;
    const sampleTag = best.n < 3 ? ', low sample' : '';
    const leaveText = best.leaveDistance === null ? '' : `, leaves ${best.leaveDistance.toFixed(0)} yds`;
    return `${best.club} (${expectedScore.toFixed(2)} ${toPar}, ${firText}, ${penText}${leaveText}, n=${best.n}${sampleTag})`;
}

function countPutts(shots) {
    return (shots ?? []).filter(s => Number(s?.clubId) === 13).length;
}

function distanceToPinFromShotEnd(shot, hole) {
    const ex = Number(shot?.end?.x);
    const ez = Number(shot?.end?.z);
    const px = Number(hole?.pin?.x);
    const pz = Number(hole?.pin?.z);
    if (![ex, ez, px, pz].every(Number.isFinite)) return null;
    return Math.hypot(px - ex, pz - ez) * METERS_TO_YARDS;
}

function distanceToPinFromPoint(point, pin) {
    const sx = Number(point?.x);
    const sz = Number(point?.z);
    const px = Number(pin?.x);
    const pz = Number(pin?.z);
    if (![sx, sz, px, pz].every(Number.isFinite)) return null;
    return Math.hypot(px - sx, pz - sz) * METERS_TO_YARDS;
}

function findNextPlayableShotAfterTee(shots) {
    const ordered = [...(shots ?? [])]
        .filter(s => Number.isFinite(Number(s?.shotNumber)))
        .sort((a, b) => Number(a.shotNumber) - Number(b.shotNumber));
    for (const shot of ordered) {
        if (Number(shot?.shotNumber) <= 1) continue;
        if (Number(shot?.clubId) === 13) continue;
        if (isPenaltyShot(shot)) continue;
        return shot;
    }
    return null;
}

function formatOptionFir(option) {
    const fir = option?.firRateAdj;
    if (!Number.isFinite(fir)) return 'FIR n/a';
    return `FIR ${(fir * 100).toFixed(0)}%`;
}

function formatTeeOptionCompact(option) {
    if (!option) return 'No stable recommendation yet';
    const leave = option.leaveDistance === null ? 'leave n/a' : `leave ${option.leaveDistance.toFixed(0)} yds`;
    const expectedScore = Number.isFinite(option.strategyExpectedScore) ? option.strategyExpectedScore : option.adjustedExpectedScore;
    const toPar = Number.isFinite(option.strategyToPar) ? option.strategyToPar : option.adjustedToPar;
    return `${option.club} | ${expectedScore.toFixed(2)} (${formatSigned(toPar, 1)}) | ${formatOptionFir(option)} | ${leave}`;
}

function buildPlanAimNote(teeStats, option) {
    if (!teeStats || !Number.isFinite(teeStats.meanLateral)) return null;
    const miss = Math.abs(teeStats.meanLateral);
    const side = teeStats.meanLateral >= 0 ? 'right' : 'left';
    if (miss < 2) {
        return option?.club
            ? `${option.club} starts close to center. Hold the current visual.`
            : 'Starts close to center. Hold the current visual.';
    }
    const counter = side === 'left' ? 'right' : 'left';
    const offset = Math.max(2, Math.min(18, miss * 0.45));
    const clubPrefix = option?.club ? `${option.club}: ` : '';
    return `${clubPrefix}misses trend ${side}; start ${counter} by ~${offset.toFixed(1)}m.`;
}

function buildTeePlanComparison(primary, conservative) {
    if (!primary || !conservative || primary.club === conservative.club) return '';
    const primaryExpected = Number.isFinite(primary.strategyExpectedScore) ? primary.strategyExpectedScore : primary.adjustedExpectedScore;
    const conservativeExpected = Number.isFinite(conservative.strategyExpectedScore) ? conservative.strategyExpectedScore : conservative.adjustedExpectedScore;
    const scoreDelta = conservativeExpected - primaryExpected;
    const firDelta = Number.isFinite(conservative.firRateAdj) && Number.isFinite(primary.firRateAdj)
        ? (conservative.firRateAdj - primary.firRateAdj) * 100
        : null;
    const penaltyDelta = (conservative.penaltyHoleRateAdj - primary.penaltyHoleRateAdj) * 100;
    const leaveDelta = Number.isFinite(conservative.leaveDistance) && Number.isFinite(primary.leaveDistance)
        ? conservative.leaveDistance - primary.leaveDistance
        : null;

    const parts = [`${escapeHtml(conservative.club)} trades ${formatSigned(scoreDelta, 2)} strokes versus ${escapeHtml(primary.club)}.`];
    if (Number.isFinite(firDelta)) {
        parts.push(`FIR ${formatSigned(firDelta, 0)} pts.`);
    }
    parts.push(`Penalty ${formatSigned(penaltyDelta, 0)} pts.`);
    if (Number.isFinite(leaveDelta)) {
        parts.push(`Leave ${formatSigned(leaveDelta, 0)} yds.`);
    }
    return parts.join(' ');
}

function buildApproachPlanForOption(option, alignedGeometry) {
    if (!option || !Number.isFinite(option.leaveDistance)) return null;
    const lie = inferApproachLie(option.meanEndPoint, alignedGeometry);
    if (lie === 'green') {
        return {
            clubId: 13,
            clubName: resolveClubNameById(13),
            lie,
            distance: option.leaveDistance,
            label: `Putter on green | ${option.leaveDistance.toFixed(0)} yds left`
        };
    }
    if (lie === 'hazard') {
        return {
            clubId: null,
            clubName: null,
            lie,
            distance: null,
            label: 'Penalty-heavy leave near water | no clean approach club'
        };
    }

    const smartClub = pickSmartApproachClub(option.leaveDistance, lie);
    if (!smartClub) {
        if (option.historicalNextClub) {
            return {
                clubId: null,
                clubName: option.historicalNextClub,
                lie,
                distance: null,
                label: `${option.historicalNextClub} (historical fallback)`
            };
        }
        return null;
    }

    return {
        clubId: smartClub.clubId,
        clubName: smartClub.clubName,
        lie,
        distance: smartClub.distance,
        label: `${smartClub.clubName} | ${smartClub.distance.toFixed(0)} yd smart from ${lie}`
    };
}

function estimateContinuationForApproachPlan(plan, targetDistanceYards) {
    if (!plan || !Number.isFinite(targetDistanceYards)) return null;
    const clubId = Number(plan.clubId);
    const lie = plan.lie ?? null;
    const stateEstimate = estimateRemainingStrokesForLie(lie, targetDistanceYards)
        ?? estimateRemainingStrokesAfterShot(shotOutcomeIndexAll, targetDistanceYards);
    const clubEstimate = Number.isFinite(clubId)
        ? estimateRemainingStrokesAfterShotForClub(clubId, targetDistanceYards, lie)
        : null;
    const estimate = blendContinuationEstimates(stateEstimate, clubEstimate);
    if (!estimate) return null;
    const smartDistance = Number(plan.distance);
    const gap = Number.isFinite(smartDistance) ? Math.abs(smartDistance - targetDistanceYards) : null;
    const approachGapPenalty = Number.isFinite(gap)
        ? Math.max(0, Math.min(0.3, (gap - 12) / 100))
        : 0;
    return {
        ...estimate,
        approachGapPenalty,
        strokesFromHere: 1 + estimate.remainingAfter
    };
}

function estimateRemainingStrokesAfterShotForClub(clubId, targetDistanceYards, lie = null) {
    const rows = shotOutcomeIndexByClubId.get(Number(clubId)) ?? [];
    return estimateRemainingStrokesAfterShot(rows, targetDistanceYards, lie);
}

function estimateRemainingStrokesForLie(lie, targetDistanceYards) {
    if (!lie) return null;
    const rows = shotOutcomeIndexByLie.get(lie) ?? [];
    return estimateRemainingStrokesAfterShot(rows, targetDistanceYards, lie);
}

function estimateRemainingStrokesAfterShot(rows, targetDistanceYards, lie = null) {
    if (!Array.isArray(rows) || rows.length === 0 || !Number.isFinite(targetDistanceYards)) return null;
    const normalizedLie = normalize(lie);
    const lieRows = normalizedLie
        ? rows.filter(row => normalize(row?.lie) === normalizedLie)
        : rows;
    const poolRows = lieRows.length >= 8 ? lieRows : rows;
    const nearest = poolRows
        .map(row => ({
            ...row,
            diff: Math.abs(row.startDistance - targetDistanceYards)
        }))
        .sort((a, b) => {
            if (a.diff !== b.diff) return a.diff - b.diff;
            const aLie = normalizedLie && normalize(a.lie) === normalizedLie ? 0 : 1;
            const bLie = normalizedLie && normalize(b.lie) === normalizedLie ? 0 : 1;
            return aLie - bLie;
        })
        .slice(0, Math.min(40, rows.length));
    if (nearest.length === 0) return null;

    const closeBand = nearest.some(r => r.diff <= 15) ? 20 : nearest.some(r => r.diff <= 30) ? 35 : 60;
    const pool = nearest.filter(r => r.diff <= closeBand);
    const use = pool.length >= 6 ? pool : nearest.slice(0, Math.min(18, nearest.length));

    let sum = 0;
    let weightSum = 0;
    for (const row of use) {
        const weight = 1 / Math.max(4, row.diff + 4);
        sum += row.remainingAfter * weight;
        weightSum += weight;
    }
    if (weightSum <= 0) return null;

    return {
        remainingAfter: sum / weightSum,
        sample: use.length,
        maxDiff: Math.max(...use.map(r => r.diff))
    };
}

function blendContinuationEstimates(stateEstimate, clubEstimate) {
    if (!stateEstimate && !clubEstimate) return null;
    if (!stateEstimate) return clubEstimate;
    if (!clubEstimate) return stateEstimate;

    const clubWeight = clubEstimate.sample >= 10 ? 0.30 : clubEstimate.sample >= 6 ? 0.18 : 0.08;
    const stateWeight = 1 - clubWeight;
    return {
        remainingAfter: stateEstimate.remainingAfter * stateWeight + clubEstimate.remainingAfter * clubWeight,
        sample: Math.max(stateEstimate.sample ?? 0, clubEstimate.sample ?? 0),
        maxDiff: Math.min(stateEstimate.maxDiff ?? Number.POSITIVE_INFINITY, clubEstimate.maxDiff ?? Number.POSITIVE_INFINITY)
    };
}

function inferApproachLie(point, alignedGeometry) {
    if (!Array.isArray(point) || point.length < 2) return 'rough';
    const p = [Number(point[0]), Number(point[1])];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return 'rough';
    if (pointInAnyPolygon2D(p, asPolygonArrayFlexible(alignedGeometry?.green))) return 'green';
    if (pointInAnyPolygon2D(p, asPolygonArrayFlexible(alignedGeometry?.water))) return 'hazard';
    if (pointInAnyPolygon2D(p, asPolygonArrayFlexible(alignedGeometry?.bunkers))) return 'sand';
    if (pointInAnyPolygon2D(p, asPolygonArrayFlexible(alignedGeometry?.fairway))) return 'fairway';
    return 'rough';
}

function pickSmartApproachClub(leaveDistanceYards, lie) {
    if (!Array.isArray(smartDistancesData) || smartDistancesData.length === 0) return null;
    const candidates = smartDistancesData
        .map(entry => {
            const clubId = Number(entry?.clubId);
            const distance = getSmartDistanceForLie(entry, lie);
            if (!Number.isFinite(clubId) || !Number.isFinite(distance) || clubId === 13) return null;
            const low = Number(entry?.range?.low);
            const high = Number(entry?.range?.high);
            const inRange = Number.isFinite(low) && Number.isFinite(high)
                ? leaveDistanceYards >= low && leaveDistanceYards <= high
                : false;
            const diff = Math.abs(distance - leaveDistanceYards);
            return {
                clubId,
                clubName: resolveClubNameById(clubId),
                distance,
                score: diff - (inRange ? 4 : 0) + (distance < leaveDistanceYards ? 0.8 : 0)
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score);

    return candidates[0] ?? null;
}

function getSmartDistanceForLie(entry, lie) {
    const terrain = entry?.terrain ?? {};
    const terrainDistance = Number(terrain?.[lie]?.distance);
    if (Number.isFinite(terrainDistance)) return terrainDistance;
    const generic = Number(entry?.smartDistance?.distance);
    return Number.isFinite(generic) ? generic : null;
}

function resolveClubNameById(clubId) {
    const id = Number(clubId);
    if (!Number.isFinite(id)) return 'Unknown';
    const fromShots = clubNameIndex.get(id);
    if (fromShots) return fromShots;
    const defaults = {
        1: 'Driver',
        2: '4 Hybrid',
        3: '5 Iron',
        4: '6 Iron',
        5: '7 Iron',
        6: '8 Iron',
        7: '9 Iron',
        8: 'Pitching Wedge',
        9: 'Gap Wedge',
        10: 'Approach Wedge',
        11: 'Sand Wedge',
        12: 'Lob Wedge',
        13: 'Putter',
        17: '3 Wood'
    };
    return defaults[id] ?? `Club ${id}`;
}

function buildPenaltySummary(samples) {
    let totalPenalties = 0;
    let holesWithPenalty = 0;
    let tee = 0;
    let longGame = 0;
    let shortGame = 0;
    let green = 0;
    const byClub = new Map();

    for (const h of samples) {
        const analysis = analyzePenaltyEvents(h.shots ?? []);
        totalPenalties += analysis.total;
        if (analysis.total > 0) holesWithPenalty++;

        for (const ev of analysis.events) {
            if (ev.phase === 'tee') tee++;
            else if (ev.phase === 'green') green++;
            else if (ev.phase === 'long') longGame++;
            else shortGame++;

            const club = ev.sourceClub || 'Unknown';
            byClub.set(club, (byClub.get(club) ?? 0) + 1);
        }
    }

    if (totalPenalties === 0) {
        return {
            overview: `0 on 0/${samples.length} holes (0.0%)`,
            split: 'Tee 0 | Long 0 | Short 0 | Green 0',
            byClub: 'none'
        };
    }

    const holeRate = samples.length > 0 ? (holesWithPenalty / samples.length * 100) : 0;
    const byClubText = [...byClub.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([club, n]) => `${club} ${n}`)
        .join(' | ');

    return {
        overview: `${totalPenalties} on ${holesWithPenalty}/${samples.length} holes (${holeRate.toFixed(1)}%)`,
        split: `Tee ${tee} | Long ${longGame} | Short ${shortGame} | Green ${green}`,
        byClub: byClubText || 'unknown'
    };
}

function countPenalties(shots) {
    return analyzePenaltyEvents(shots).total;
}

function isPenaltyShot(shot) {
    const name = normalize(shot?.clubName);
    return name.includes('penalty') || Number(shot?.clubId) === 99;
}

function analyzePenaltyEvents(shots) {
    const ordered = [...(shots ?? [])]
        .filter(s => Number.isFinite(Number(s?.shotNumber)))
        .sort((a, b) => Number(a.shotNumber) - Number(b.shotNumber));
    const firstPuttIdx = ordered.findIndex(s => Number(s.clubId) === 13);
    const events = [];

    // Explicit penalty shots if present in source data.
    for (let i = 0; i < ordered.length; i++) {
        if (!isPenaltyShot(ordered[i])) continue;
        const source = findPenaltySourceInfoFromIndex(ordered, i);
        events.push({
            phase: classifyPenaltyPhaseFromIndex(ordered, i, firstPuttIdx),
            sourceClub: source.club,
            sourcePoint: source.point,
            inferred: false
        });
    }

    // In Arccos exports, penalties are often encoded as shot-number gaps.
    for (let i = 1; i < ordered.length; i++) {
        const prev = Number(ordered[i - 1].shotNumber);
        const curr = Number(ordered[i].shotNumber);
        if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;
        const gap = curr - prev - 1;
        if (gap <= 0) continue;

        const phase = classifyPenaltyPhaseFromPrevious(ordered, i - 1, firstPuttIdx);
        const sourceClub = resolveClubName(ordered[i - 1]);
        const sourcePoint = getShotEndPoint2D(ordered[i - 1]);
        for (let g = 0; g < gap; g++) {
            events.push({
                phase,
                sourceClub,
                sourcePoint,
                inferred: true
            });
        }
    }

    return { total: events.length, events };
}

function classifyPenaltyPhaseFromIndex(shots, idx, firstPuttIdx) {
    const shotNumber = Number(shots[idx]?.shotNumber);
    if (shotNumber === 1) return 'tee';
    if (firstPuttIdx >= 0 && idx >= firstPuttIdx) return 'green';
    if (shotNumber <= 2) return 'long';
    return 'short';
}

function classifyPenaltyPhaseFromPrevious(shots, prevIdx, firstPuttIdx) {
    const prevShotNumber = Number(shots[prevIdx]?.shotNumber);
    if (prevShotNumber === 1) return 'tee';
    if (firstPuttIdx >= 0 && prevIdx >= firstPuttIdx) return 'green';
    if (prevShotNumber <= 2) return 'long';
    return 'short';
}

function findPenaltySourceInfoFromIndex(shots, penaltyIdx) {
    for (let i = penaltyIdx - 1; i >= 0; i--) {
        if (!isPenaltyShot(shots[i])) {
            return {
                club: resolveClubName(shots[i]),
                point: getShotEndPoint2D(shots[i])
            };
        }
    }
    return {
        club: penaltyIdx === 0 ? 'Tee ball' : 'Unknown',
        point: null
    };
}

function getShotEndPoint2D(shot) {
    const x = Number(shot?.end?.x);
    const z = Number(shot?.end?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return [x, z];
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

function stddev(values, meanValue = null) {
    const valid = values.filter(v => Number.isFinite(v));
    if (valid.length < 2) return 0;
    const mean = Number.isFinite(meanValue) ? meanValue : avg(valid);
    const variance = valid.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (valid.length - 1);
    return Math.sqrt(Math.max(0, variance));
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
        lines.push(` shots mirrored: ${aligned.shotsMirrored ? 'yes' : 'no'}`);
        lines.push(` pinOffsetFix: dx=${aligned.pinOffsetDx.toFixed(1)}, dz=${aligned.pinOffsetDz.toFixed(1)}`);
        lines.push(` teeOffsetFix: dx=${aligned.teeOffsetDx.toFixed(1)}, dz=${aligned.teeOffsetDz.toFixed(1)}`);
        if (Number.isFinite(aligned.alignmentScore)) {
            lines.push(` fitScore: ${aligned.alignmentScore.toFixed(2)}`);
        }
        if (Number.isFinite(aligned.teeFairwayDistance)) {
            lines.push(` tee->fairway dist: ${aligned.teeFairwayDistance.toFixed(2)}m`);
        }
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
    lines.push(` fairway polygons: ${polygonCountFlexible(g.fairway)}`);
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

function clearTaggedSceneGroups(scene, tags) {
    if (!scene || !Array.isArray(tags) || tags.length === 0) return;
    const tagSet = new Set(tags);
    const groups = scene.children.filter(child => child?.isGroup && tagSet.has(String(child?.userData?.tag ?? '')));
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

    const fairwayCenter = centroidFromPolygons(asPolygonArrayFlexible(holeGeometry.fairway));
    const sourceTee = centroid(holeGeometry.tee) ?? fairwayCenter ?? [0, 0];
    const sourceTarget = centroid(holeGeometry.green) ?? fairwayCenter;
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

    const scored = candidates.map(c => {
        const geometry = transformGeometry(holeGeometry, sourceTee, targetTee, scale, c.cos, c.sin, c.mirrored, srcUnit);
        const fit = scoreGeometryFit(geometry, hole);
        return { ...c, geometry, score: fit.score, teeFairwayDistance: fit.teeFairwayDistance };
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
        teeOffsetDz: movedToTee.dz,
        alignmentScore: best.score,
        teeFairwayDistance: best.teeFairwayDistance
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
            fairway: shiftPolysFlexible(geometry.fairway, dx, dz),
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
    const c = centroid(geometry?.tee) ?? centroidFromPolygons(asPolygonArrayFlexible(geometry?.fairway));
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
            fairway: shiftPolysFlexible(geometry.fairway, dx, dz),
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
    const mapFlexiblePolygons = value => {
        const polys = asPolygonArrayFlexible(value);
        if (polys.length === 0) return value;
        const mapped = polys.map(mapPolygon);
        if (isSinglePolygonLike(value)) return mapped[0];
        return mapped;
    };

    return {
        ...holeGeometry,
        tee: mapPolygon(holeGeometry.tee),
        fairway: mapFlexiblePolygons(holeGeometry.fairway),
        green: mapPolygon(holeGeometry.green),
        bunkers: mapPolygons(holeGeometry.bunkers),
        water: mapPolygons(holeGeometry.water),
        trees: mapPolygon(holeGeometry.trees)
    };
}

function scoreGeometryFit(geometry, hole) {
    const fairways = asPolygonArrayFlexible(geometry?.fairway);
    const greens = asPolygonArrayFlexible(geometry?.green);
    const polygons = [...fairways, ...greens];
    if (polygons.length === 0) {
        return { score: Number.POSITIVE_INFINITY, teeFairwayDistance: Number.POSITIVE_INFINITY };
    }

    const shotEnds = (hole.shots ?? [])
        .filter(s => Number(s.clubId) !== 13)
        .map(s => [Number(s.end.x), Number(s.end.z)])
        .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (shotEnds.length === 0) {
        return { score: Number.POSITIVE_INFINITY, teeFairwayDistance: Number.POSITIVE_INFINITY };
    }

    let sum = 0;
    for (const p of shotEnds) {
        let best = Number.POSITIVE_INFINITY;
        for (const poly of polygons) {
            best = Math.min(best, distancePointToPolygon2D(p, poly));
        }
        sum += Math.min(best, 200);
    }

    // Heavily weight first tee-shot landing distance to fairway to avoid mirrored misalignment.
    let teeFairwayDistance = 200;
    const teeShot = (hole.shots ?? []).find(s => Number(s.shotNumber) === 1);
    if (teeShot && fairways.length > 0) {
        const teeEnd = [Number(teeShot.end?.x), Number(teeShot.end?.z)];
        if (Number.isFinite(teeEnd[0]) && Number.isFinite(teeEnd[1])) {
            teeFairwayDistance = Number.POSITIVE_INFINITY;
            for (const fw of fairways) {
                teeFairwayDistance = Math.min(teeFairwayDistance, distancePointToPolygon2D(teeEnd, fw));
            }
        }
    }

    const base = sum / shotEnds.length;
    const weighted = base + Math.min(teeFairwayDistance, 200) * 3.0;
    return { score: weighted, teeFairwayDistance };
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

function normalizePoint2D(p) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const x = Number(p[0]);
    const z = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return [x, z];
}

function asPolygonArrayFlexible(value) {
    if (!Array.isArray(value) || value.length === 0) return [];
    if (isSinglePolygonLike(value)) {
        const poly = value.map(normalizePoint2D).filter(Boolean);
        return poly.length >= 3 ? [poly] : [];
    }
    const polygons = [];
    for (const poly of value) {
        if (!Array.isArray(poly)) continue;
        const normalized = poly.map(normalizePoint2D).filter(Boolean);
        if (normalized.length >= 3) polygons.push(normalized);
    }
    return polygons;
}

function isSinglePolygonLike(value) {
    if (!Array.isArray(value) || value.length === 0) return false;
    return normalizePoint2D(value[0]) !== null;
}

function centroidFromPolygons(polygons) {
    const pts = [];
    for (const poly of polygons ?? []) {
        for (const p of poly ?? []) pts.push(p);
    }
    return centroid(pts);
}

function pointInAnyPolygon2D(point, polygons) {
    for (const poly of polygons ?? []) {
        if (pointInPolygon2D(point, poly)) return true;
    }
    return false;
}

function polygonCountFlexible(value) {
    return asPolygonArrayFlexible(value).length;
}

function shiftPolysFlexible(value, dx, dz) {
    const polys = asPolygonArrayFlexible(value);
    if (polys.length === 0) return value;
    const shiftPoint = p => [round2(Number(p[0]) + dx), round2(Number(p[1]) + dz)];
    if (isSinglePolygonLike(value)) {
        return polys[0].map(shiftPoint);
    }
    return polys.map(poly => poly.map(shiftPoint));
}
