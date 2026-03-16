import * as THREE from 'three';
import { createScene, frameHole, focusCameraForPutt } from './scene.js?v=20260309i';
import { buildHole } from './course.js?v=20260311n';
import { buildShots, buildShotSpread, nextShot, prevShot, togglePlay, goToShot, getCurrentShot, updateAnimation, getShotCount, getPlaybackValue, seekPlayback, setCinematicMode, getBallPositionXZ } from './shots.js?v=20260312b';
import { initUI, populateRoundSelector, updateHoleInfo, updateShotInfo, updateCourseInfo, buildScorecard, onHoleClick, setPlayIcon, updateGeometryDebug, setTimelineBounds, setTimelineValue, onTimelineInput, onCinematicModeChange, setGeometryDebugVisible, updateHoleAnalytics, updateCaddiePlan, updatePlannerPanel, onCaddiePlanSelect, onPlannerChange, setCaddieVisible, setPlannerVisible, setSpreadLegendVisible, syncSpreadLegendItems, setHolePanelVisible, setHoleAnalyticsVisible, setShotPanelVisible, onSpreadFiltersChange, getSpreadFilters, onPanelVisibilityChange, getPanelVisibility, onBestHoleReplay, onWorstHoleReplay, setRoundSelection, onRoundSelectionChange, onImportGeometry, onMenuSettingsToggle, setMenuSettingsVisible, updateSimApiSummary, setMainMenuVisible, onMainMenuSelect, onOpenMainMenu, onAnalyticsToggle, setAnalyticsDetailsVisible, onAnalyticsBenchmarkModeChange, getAnalyticsBenchmarkMode, setAnalyticsBenchmarkMode, updateAnalyticsDashboard, setAnalyticsDashboardVisible, onAnalyticsDashboardClose, onAnalyticsDashboardHoleNav, setAnalyticsDashboardMode, onAnalyticsDashboardModeChange, onAnalyticsDashboardTabSelect, onAnalyticsDashboardHoleSelect } from './ui.js?v=20260316l';

let vizData = null;
let geometryData = null;
let smartDistancesData = [];
let clubNameIndex = new Map();
let shotOutcomeIndexByClubId = new Map();
let shotOutcomeIndexByLie = new Map();
let shotOutcomeIndexAll = [];
let stateBaselineIndexByLie = new Map();
let stateBaselineAll = [];
let targetBaselineIndexByLie = new Map();
let targetBaselineAll = [];
let targetBenchmarkInfo = {
    roundCount: 0,
    share: 0,
    label: 'Target benchmark unavailable'
};
let currentRoundIdx = 0;
let currentHoleIdx = 0;
let currentHoleForRender = null;
let currentHoleGeometry = null;
let currentAnalysisGeometry = null;
let currentSelectedHole = null;
let currentSpreadSamples = [];
let currentAnalysisSamples = [];
let currentHoleAnalyticsSummary = null;
let currentTeeOptions = [];
let currentPlannerOptions = [];
let currentPlannerModel = null;
let teeDispersionIndexByClub = new Map();
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
let analyticsBenchmarkMode = 'personal';
let analyticsDashboardVisible = false;
let analyticsDashboardMode = 'hole';
let analyticsDashboardTab = 'overview';
let roundStrokesDashboardCache = new Map();
let courseStrokesDashboardCache = new Map();
let courseHoleCardsCache = new Map();
let panelVisibility = {
    hole: true,
    analytics: true,
    shot: true,
    caddie: true,
    planner: true,
    spreadLegend: true
};
let plannerState = {
    club: null,
    aimOffsetMeters: 0,
    manualAimPoint: null
};
let sceneCtx = null;
const clock = { last: 0 };
const METERS_TO_YARDS = 1.09361;
const FORCE_GEOMETRY_FLIP_180 = false;
const STRICT_VISUAL_ANCHOR_MODE = false;
const AUTO_MIRROR_GEOMETRY = true;
const API_BASE = resolveApiBase();
const plannerRaycaster = new THREE.Raycaster();
const plannerGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

async function init() {
    initUI();
    analyticsBenchmarkMode = getAnalyticsBenchmarkMode();
    setAnalyticsBenchmarkMode(analyticsBenchmarkMode);
    setAnalyticsDashboardMode(analyticsDashboardMode);
    setMainMenuVisible(true);
    setMenuSettingsVisible(false);
    setGeometryDebugVisible(geometryDebugVisible);
    setAnalyticsDetailsVisible(false);
    setAnalyticsDashboardVisible(false);
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
    vizData = {
        ...vizData,
        rounds: sortRoundsDescByDate(vizData?.rounds ?? [])
    };
    clubNameIndex = buildClubNameIndex(vizData.rounds ?? []);

    try {
        geometryData = await fetchApiFirstJson('/api/data/geometry', 'data/course_geometry.json');
    } catch {
        geometryData = null;
    }

    rebuildDerivedIndexes();

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
    bindPlannerCanvasTargeting(canvas);
    sceneCtx.controls.addEventListener('start', () => {
        cameraUserOverrideUntil = performance.now() + 2000;
    });
    sceneCtx.controls.addEventListener('end', () => {
        cameraUserOverrideUntil = performance.now() + 1400;
    });

    populateRoundSelector(vizData.rounds);
    loadRound(0);

    onRoundSelectionChange(idx => {
        loadRound(idx);
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
        if (e.key === 'Escape') {
            if (analyticsDashboardVisible) {
                analyticsDashboardVisible = false;
                setAnalyticsDashboardVisible(false);
                applyPanelVisibility();
                return;
            }
            if (isMainMenuVisible()) {
                setMainMenuVisible(false);
                setMenuSettingsVisible(false);
            }
        }
    });

    onHoleClick(idx => {
        currentHoleIdx = idx;
        selectedTeePlanClub = null;
        plannerState = { club: null, aimOffsetMeters: 0, manualAimPoint: null };
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
    onAnalyticsBenchmarkModeChange(mode => {
        analyticsBenchmarkMode = normalizeAnalyticsBenchmarkMode(mode);
        setAnalyticsBenchmarkMode(analyticsBenchmarkMode);
        refreshAnalyticsPanelOnly();
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
        if (spreadMode) {
            refreshSpreadLayerVisuals();
        }
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
    onPlannerChange((next, meta = {}) => {
        if (meta.action === 'reset') {
            plannerState = {
                ...plannerState,
                manualAimPoint: null,
                aimOffsetMeters: 0
            };
            refreshPlannerAndInsights();
            return;
        }
        plannerState = {
            club: String(next?.club ?? '').trim() || plannerState.club,
            aimOffsetMeters: clamp(Number(next?.aimOffsetMeters) || 0, -24, 24),
            manualAimPoint: plannerState.manualAimPoint
        };
        if (meta.live && meta.source === 'aim') {
            refreshPlannerOverlayPreview();
            return;
        }
        refreshPlannerAndInsights();
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
        if (mode === 'analytics') {
            analyticsDashboardVisible = true;
            analyticsDetailsVisible = true;
            analyticsDashboardMode = 'hole';
            analyticsDashboardTab = 'overview';
            setAnalyticsDashboardMode(analyticsDashboardMode);
            setAnalyticsDetailsVisible(analyticsDetailsVisible);
            setAnalyticsDashboardVisible(true);
            applyPanelVisibility();
            refreshAnalyticsPanelOnly();
            return;
        }
        if (mode === 'replay') {
            analyticsDashboardVisible = false;
            setAnalyticsDashboardVisible(false);
            spreadMode = false;
            analyticsDetailsVisible = false;
            setAnalyticsDetailsVisible(analyticsDetailsVisible);
            applyPanelVisibility();
            loadHole();
            return;
        }
        if (mode === 'spread') {
            analyticsDashboardVisible = false;
            setAnalyticsDashboardVisible(false);
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
    onAnalyticsDashboardClose(() => {
        analyticsDashboardVisible = false;
        setAnalyticsDashboardVisible(false);
        applyPanelVisibility();
    });
    onAnalyticsDashboardModeChange(mode => {
        analyticsDashboardMode = normalizeAnalyticsDashboardMode(mode);
        setAnalyticsDashboardMode(analyticsDashboardMode);
        refreshAnalyticsDashboard();
    });
    onAnalyticsDashboardTabSelect(tab => {
        analyticsDashboardTab = normalizeAnalyticsDashboardTab(tab);
        refreshAnalyticsDashboard();
    });
    onAnalyticsDashboardHoleSelect(idx => {
        if (!Number.isFinite(idx)) return;
        currentHoleIdx = Math.max(0, Math.min(idx, (vizData?.rounds?.[currentRoundIdx]?.holes?.length ?? 1) - 1));
        analyticsDashboardMode = 'hole';
        analyticsDashboardTab = 'overview';
        setAnalyticsDashboardMode(analyticsDashboardMode);
        selectedTeePlanClub = null;
        plannerState = { club: null, aimOffsetMeters: 0, manualAimPoint: null };
        loadHole();
    });
    onAnalyticsDashboardHoleNav(delta => {
        if (!Number.isFinite(delta) || delta === 0) return;
        changeHole(delta);
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
    const dashboardHidden = !analyticsDashboardVisible;
    setHolePanelVisible(dashboardHidden && panelVisibility.hole);
    setHoleAnalyticsVisible(dashboardHidden && panelVisibility.analytics);
    setShotPanelVisible(dashboardHidden && panelVisibility.shot);
    setCaddieVisible(dashboardHidden && panelVisibility.caddie);
    setPlannerVisible(dashboardHidden && spreadMode && panelVisibility.planner);
    setSpreadLegendVisible(dashboardHidden && spreadMode && panelVisibility.spreadLegend);
    setAnalyticsDashboardVisible(analyticsDashboardVisible);
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
            rebuildDerivedIndexes();
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

function normalizeAnalyticsBenchmarkMode(value) {
    return String(value ?? '').toLowerCase() === 'target' ? 'target' : 'personal';
}

function normalizeAnalyticsDashboardMode(value) {
    return String(value ?? '').toLowerCase() === 'course' ? 'course' : 'hole';
}

function normalizeAnalyticsDashboardTab(value) {
    const normalized = String(value ?? '').toLowerCase();
    return ['overview', 'tee', 'approach', 'putting', 'risk'].includes(normalized) ? normalized : 'overview';
}

function sortRoundsDescByDate(rounds) {
    return [...(rounds ?? [])].sort((a, b) => String(b?.date ?? '').localeCompare(String(a?.date ?? '')));
}

function invalidateAnalyticsCaches() {
    roundStrokesDashboardCache = new Map();
    courseStrokesDashboardCache = new Map();
    courseHoleCardsCache = new Map();
    currentHoleAnalyticsSummary = null;
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
            const orderedShots = [...(holeForAnalysis?.shots ?? [])]
                .filter(shot => Number.isFinite(Number(shot?.shotNumber)))
                .sort((a, b) => Number(a.shotNumber) - Number(b.shotNumber));
            for (let idx = 0; idx < orderedShots.length; idx++) {
                const shot = orderedShots[idx];
                const clubId = Number(shot?.clubId);
                const shotNumber = Number(shot?.shotNumber);
                if (!Number.isFinite(clubId) || !Number.isFinite(shotNumber)) continue;
                if (shotNumber <= 1 || isPenaltyShot(shot)) continue;

                const startDistance = distanceToPinFromPoint(shot?.start, holeForAnalysis?.pin);
                const remainingAfter = holeScore - shotNumber;
                if (!Number.isFinite(startDistance) || !Number.isFinite(remainingAfter) || remainingAfter < 0) continue;
                const startPoint = [Number(shot?.start?.x), Number(shot?.start?.z)];
                const endPoint = [Number(shot?.end?.x), Number(shot?.end?.z)];
                const lie = alignedGeometry ? inferApproachLie(startPoint, alignedGeometry) : null;
                const endLie = alignedGeometry ? inferApproachLie(endPoint, alignedGeometry) : null;
                const nextShot = orderedShots[idx + 1] ?? null;
                const endedOnGreen = endLie === 'green' || Number(nextShot?.clubId) === 13;
                const puttsAfter = orderedShots
                    .slice(idx + 1)
                    .filter(s => Number(s?.clubId) === 13)
                    .length;
                const endDistance = distanceToPinFromPoint(shot?.end, holeForAnalysis?.pin);

                const sample = {
                    clubId,
                    startDistance,
                    remainingAfter,
                    lie,
                    endLie,
                    endedOnGreen,
                    puttsAfter,
                    endDistance
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

function buildStateBaselineIndex(rounds) {
    const byLie = new Map();
    const all = [];

    for (const round of rounds ?? []) {
        for (const holeRaw of round?.holes ?? []) {
            const geometryStatus = inspectHoleGeometry(round, holeRaw);
            const hole = maybeMirrorHoleShots(holeRaw, geometryStatus.holeGeometry);
            const alignedGeometry = alignHoleGeometryToHole(geometryStatus.holeGeometry, hole).geometry;
            const holeScore = Number(hole?.score);
            if (!Number.isFinite(holeScore)) continue;

            const orderedShots = [...(hole?.shots ?? [])]
                .filter(s => Number.isFinite(Number(s?.shotNumber)))
                .sort((a, b) => Number(a.shotNumber) - Number(b.shotNumber));

            for (const shot of orderedShots) {
                if (isPenaltyShot(shot)) continue;

                const shotNumber = Number(shot?.shotNumber);
                const startDistance = distanceToPinFromPoint(shot?.start, hole?.pin);
                if (!Number.isFinite(shotNumber) || !Number.isFinite(startDistance)) continue;

                const lie = shotNumber === 1
                    ? 'tee'
                    : inferApproachLie([Number(shot?.start?.x), Number(shot?.start?.z)], alignedGeometry);
                const strokesToHoleOut = holeScore - shotNumber + 1;
                if (!Number.isFinite(strokesToHoleOut) || strokesToHoleOut <= 0) continue;

                const row = {
                    startDistance,
                    strokesToHoleOut,
                    lie,
                    clubId: Number(shot?.clubId)
                };
                all.push(row);
                const lieRows = byLie.get(lie) ?? [];
                lieRows.push(row);
                byLie.set(lie, lieRows);
            }
        }
    }

    return { byLie, all };
}

function selectTargetBenchmarkRounds(rounds) {
    const validRounds = [...(rounds ?? [])]
        .filter(round => Number.isFinite(Number(round?.totalScore)))
        .map(round => ({
            round,
            totalScore: Number(round.totalScore),
            totalToPar: (round?.holes ?? []).reduce((total, hole) => {
                const score = Number(hole?.score);
                const par = Number(hole?.par);
                return total + (Number.isFinite(score) && Number.isFinite(par) ? score - par : 0);
            }, 0)
        }))
        .sort((a, b) => {
            if (a.totalToPar !== b.totalToPar) return a.totalToPar - b.totalToPar;
            if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
            return String(a.round?.date ?? '').localeCompare(String(b.round?.date ?? ''));
        });

    if (validRounds.length === 0) {
        return {
            rounds: [],
            roundCount: 0,
            share: 0,
            label: 'Target benchmark unavailable'
        };
    }

    const desiredCount = validRounds.length >= 18
        ? Math.max(6, Math.round(validRounds.length * 0.35))
        : validRounds.length >= 10
            ? Math.max(5, Math.round(validRounds.length * 0.4))
            : Math.max(3, Math.ceil(validRounds.length * 0.5));
    const roundCount = Math.min(validRounds.length, desiredCount);
    const roundsSubset = validRounds.slice(0, roundCount).map(entry => entry.round);
    const share = validRounds.length > 0 ? roundCount / validRounds.length : 0;

    return {
        rounds: roundsSubset,
        roundCount,
        share,
        label: `Target benchmark (best ${Math.round(share * 100)}% rounds)`
    };
}

function rebuildShotOutcomeIndex() {
    const shotOutcomeIndex = buildShotOutcomeIndex(vizData?.rounds ?? []);
    shotOutcomeIndexByClubId = shotOutcomeIndex.byClubId;
    shotOutcomeIndexByLie = shotOutcomeIndex.byLie;
    shotOutcomeIndexAll = shotOutcomeIndex.all;
}

function rebuildDerivedIndexes() {
    invalidateAnalyticsCaches();
    rebuildShotOutcomeIndex();
    const allRounds = vizData?.rounds ?? [];
    const stateBaselineIndex = buildStateBaselineIndex(allRounds);
    stateBaselineIndexByLie = stateBaselineIndex.byLie;
    stateBaselineAll = stateBaselineIndex.all;
    const targetRounds = selectTargetBenchmarkRounds(allRounds);
    const targetStateBaselineIndex = buildStateBaselineIndex(targetRounds.rounds);
    targetBaselineIndexByLie = targetStateBaselineIndex.byLie;
    targetBaselineAll = targetStateBaselineIndex.all;
    targetBenchmarkInfo = {
        roundCount: targetRounds.roundCount,
        share: targetRounds.share,
        label: targetRounds.label
    };
    teeDispersionIndexByClub = buildGlobalTeeDispersionIndex(allRounds);
}

function loadRound(idx) {
    currentRoundIdx = idx;
    selectedTeePlanClub = null;
    plannerState = { club: null, aimOffsetMeters: 0, manualAimPoint: null };
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
    plannerState = { club: null, aimOffsetMeters: 0, manualAimPoint: null };
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
    const plannerOptions = buildPlannerClubOptions(selectedHole, analysisSamples, teeOptions);
    selectedTeePlanClub = normalizeSelectedTeePlanClub(teeOptions, selectedTeePlanClub);
    currentTeeOptions = teeOptions;
    currentPlannerOptions = plannerOptions;
    plannerState = normalizePlannerState(plannerOptions, plannerState, selectedTeePlanClub);
    currentPlannerModel = buildWhatIfPlannerModel(selectedHole, analysisSamples, analyticsGeometry, plannerOptions, plannerState);
    const caddiePlanText = formatPreShotCaddiePlan(selectedHole, analysisSamples, analyticsGeometry, selectedTeePlanClub);
    const plannerPanelText = formatWhatIfPlanner(selectedHole, plannerOptions, currentPlannerModel);
    const roundStrokesDashboard = getRoundStrokesDashboard(round);
    const courseStrokesDashboard = getCourseStrokesDashboard(round, spreadFilters);
    const analyticsSummary = buildHoleAnalyticsSummary(selectedHole, analysisSamples, analyticsGeometry, {
        roundStrokesDashboard,
        courseStrokesDashboard
    });
    const analyticsSummaryText = formatHoleAnalyticsBasicFromSummary(selectedHole, analyticsSummary);
    const analyticsDetailsText = formatHoleAnalyticsFromSummary(selectedHole, analyticsSummary);
    const holeForRender = getHoleForRender(renderReferenceHole, holeGeometry);
    currentSelectedHole = selectedHole;
    currentSpreadSamples = spreadSamples;
    currentAnalysisSamples = analysisSamples;
    currentHoleAnalyticsSummary = analyticsSummary;
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
    updatePlannerPanel(plannerPanelText);
    refreshAnalyticsDashboard(analyticsSummaryText, analyticsDetailsText, caddiePlanText);
    if (spreadMode) {
        buildShotSpread(sceneCtx.scene, spreadSamples, spreadFilters);
        const showInsights = spreadFilters.insightAim || spreadFilters.insightDispersion || spreadFilters.insightPenalty;
        if (showInsights) {
            buildSpreadInsightsOverlay(sceneCtx.scene, selectedHole, spreadSamples, holeGeometry, spreadFilters, selectedTeePlanClub);
        }
        if (panelVisibility.planner && currentPlannerModel) {
            buildPlannerOverlay(sceneCtx.scene, currentPlannerModel);
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

    clearTaggedSceneGroups(sceneCtx.scene, ['golf-shot-group', 'golf-insight-group', 'golf-planner-group']);
    buildShotSpread(sceneCtx.scene, currentSpreadSamples, spreadFilters);
    const showInsights = spreadFilters.insightAim || spreadFilters.insightDispersion || spreadFilters.insightPenalty;
    if (showInsights) {
        buildSpreadInsightsOverlay(sceneCtx.scene, currentSelectedHole, currentSpreadSamples, currentHoleGeometry, spreadFilters, selectedTeePlanClub);
    }
    if (panelVisibility.planner && currentPlannerModel) {
        buildPlannerOverlay(sceneCtx.scene, currentPlannerModel);
    }
    updateShotInfo(null);
    setTimelineBounds(0);
    setTimelineValue(0, null);
    setPlayIcon(false);
}

function refreshAnalyticsPanelOnly() {
    if (!currentSelectedHole || !Array.isArray(currentAnalysisSamples)) return;
    const round = vizData?.rounds?.[currentRoundIdx];
    currentHoleAnalyticsSummary = buildHoleAnalyticsSummary(currentSelectedHole, currentAnalysisSamples, currentAnalysisGeometry, {
        roundStrokesDashboard: getRoundStrokesDashboard(round),
        courseStrokesDashboard: getCourseStrokesDashboard(round, spreadFilters)
    });
    const analyticsSummaryText = formatHoleAnalyticsBasicFromSummary(currentSelectedHole, currentHoleAnalyticsSummary);
    const analyticsDetailsText = formatHoleAnalyticsFromSummary(currentSelectedHole, currentHoleAnalyticsSummary);
    const caddiePlanText = formatPreShotCaddiePlan(currentSelectedHole, currentAnalysisSamples, currentAnalysisGeometry, selectedTeePlanClub);
    updateHoleAnalytics(analyticsSummaryText, analyticsDetailsText);
    setAnalyticsDetailsVisible(analyticsDetailsVisible);
    refreshAnalyticsDashboard(analyticsSummaryText, analyticsDetailsText, caddiePlanText);
}

function refreshAnalyticsDashboard(summaryText = null, detailsText = null, caddieText = null) {
    if (!analyticsDashboardVisible || !currentSelectedHole) return;
    const round = vizData?.rounds?.[currentRoundIdx];
    setAnalyticsDashboardMode(analyticsDashboardMode);
    const model = analyticsDashboardMode === 'course'
        ? buildCourseAnalyticsDashboardModel(round)
        : buildHoleAnalyticsDashboardModel(round, currentSelectedHole, currentAnalysisSamples, currentAnalysisGeometry, {
            summary: currentHoleAnalyticsSummary,
            summaryText,
            detailsText,
            caddieText
        });
    updateAnalyticsDashboard(model);
}

function refreshCaddieAndInsights() {
    if (!currentSelectedHole) return;
    const fairwayPolygons = asPolygonArrayFlexible(currentAnalysisGeometry?.fairway);
    const teeOptions = enrichTeeOptionsForDecision(
        buildTeeClubDecisionStats(currentAnalysisSamples, fairwayPolygons),
        currentAnalysisGeometry
    );
    const plannerOptions = buildPlannerClubOptions(currentSelectedHole, currentAnalysisSamples, teeOptions);
    selectedTeePlanClub = normalizeSelectedTeePlanClub(teeOptions, selectedTeePlanClub);
    currentTeeOptions = teeOptions;
    currentPlannerOptions = plannerOptions;
    plannerState = normalizePlannerState(plannerOptions, plannerState, selectedTeePlanClub);
    currentPlannerModel = buildWhatIfPlannerModel(currentSelectedHole, currentAnalysisSamples, currentAnalysisGeometry, plannerOptions, plannerState);
    const caddiePlanText = formatPreShotCaddiePlan(currentSelectedHole, currentAnalysisSamples, currentAnalysisGeometry, selectedTeePlanClub);
    updateCaddiePlan(caddiePlanText);
    updatePlannerPanel(formatWhatIfPlanner(currentSelectedHole, plannerOptions, currentPlannerModel));
    refreshAnalyticsDashboard(null, null, caddiePlanText);
    if (spreadMode) {
        refreshSpreadLayerVisuals();
    }
}

function refreshPlannerAndInsights() {
    if (!currentSelectedHole) return;
    plannerState = normalizePlannerState(currentPlannerOptions, plannerState, selectedTeePlanClub);
    currentPlannerModel = buildWhatIfPlannerModel(currentSelectedHole, currentAnalysisSamples, currentAnalysisGeometry, currentPlannerOptions, plannerState);
    updatePlannerPanel(formatWhatIfPlanner(currentSelectedHole, currentPlannerOptions, currentPlannerModel));
    if (spreadMode) {
        refreshSpreadLayerVisuals();
    }
}

function refreshPlannerOverlayPreview() {
    if (!currentSelectedHole) return;
    plannerState = normalizePlannerState(currentPlannerOptions, plannerState, selectedTeePlanClub);
    currentPlannerModel = buildWhatIfPlannerModel(currentSelectedHole, currentAnalysisSamples, currentAnalysisGeometry, currentPlannerOptions, plannerState);
    if (!spreadMode || !sceneCtx) return;
    clearTaggedSceneGroups(sceneCtx.scene, ['golf-planner-group']);
    if (panelVisibility.planner && currentPlannerModel) {
        buildPlannerOverlay(sceneCtx.scene, currentPlannerModel);
    }
}

function bindPlannerCanvasTargeting(canvas) {
    if (!canvas) return;
    let pointerDown = null;

    canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        pointerDown = {
            pointerId: e.pointerId,
            clientX: e.clientX,
            clientY: e.clientY
        };
    });

    canvas.addEventListener('pointerup', e => {
        if (!pointerDown || e.pointerId !== pointerDown.pointerId) return;
        const moved = Math.hypot(e.clientX - pointerDown.clientX, e.clientY - pointerDown.clientY);
        pointerDown = null;
        if (moved > 6) return;
        if (!spreadMode || !panelVisibility.planner || !currentSelectedHole || isMainMenuVisible()) return;
        const worldPoint = projectPointerToGround(canvas, e.clientX, e.clientY);
        if (!worldPoint) return;
        plannerState = {
            ...plannerState,
            aimOffsetMeters: 0,
            manualAimPoint: worldPoint
        };
        refreshPlannerAndInsights();
    });

    canvas.addEventListener('pointercancel', () => {
        pointerDown = null;
    });
}

function projectPointerToGround(canvas, clientX, clientY) {
    if (!sceneCtx?.camera || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    plannerRaycaster.setFromCamera(new THREE.Vector2(x, y), sceneCtx.camera);
    const hit = new THREE.Vector3();
    if (!plannerRaycaster.ray.intersectPlane(plannerGroundPlane, hit)) return null;
    if (!Number.isFinite(hit.x) || !Number.isFinite(hit.z)) return null;
    return [round2(hit.x), round2(hit.z)];
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
        plannerState = { club: null, aimOffsetMeters: 0, manualAimPoint: null };
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
    return getCourseRounds(round, filters)
        .map(r => {
            const h = (r.holes ?? []).find(x => Number(x.holeNumber) === Number(holeNumber));
            return h ? { ...h, _roundDate: r.date } : null;
        })
        .filter(h => !!h);
}

function getCourseRounds(round, filters = { range: '20' }) {
    const courseName = normalize(round?.courseName);
    let rounds = (vizData?.rounds ?? [])
        .filter(r => normalize(r.courseName) === courseName)
        .sort((a, b) => String(b?.date ?? '').localeCompare(String(a?.date ?? '')));
    const rangeN = String(filters?.range ?? '20');
    if (rangeN !== 'all') {
        const n = Number(rangeN);
        if (Number.isFinite(n) && n > 0) {
            rounds = rounds.slice(0, n);
        }
    }
    return rounds;
}

function getRoundDashboardCacheKey(round) {
    return [
        analyticsBenchmarkMode,
        normalize(round?.courseName),
        String(round?.date ?? '')
    ].join('|');
}

function getCourseDashboardCacheKey(round, filters = { range: 'all' }) {
    return [
        analyticsBenchmarkMode,
        normalize(round?.courseName),
        String(filters?.range ?? 'all')
    ].join('|');
}

function getCourseHoleCardsCacheKey(round, filters = { range: 'all' }) {
    return [
        analyticsBenchmarkMode,
        normalize(round?.courseName),
        String(round?.date ?? ''),
        String(filters?.range ?? 'all')
    ].join('|');
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
    return formatHoleAnalyticsFromSummary(currentHole, s);
}

function formatHoleAnalyticsFromSummary(currentHole, s) {
    if (!s) return '<div class="analytics-muted">No samples found for this hole.</div>';
    const courseLeakSnapshot = buildCourseLeakSnapshot(s.courseStrokesDashboard, s.roundStrokesDashboard);
    const courseLeakStrip = courseLeakSnapshot ? renderCourseLeakSummaryStrip(courseLeakSnapshot) : '';

    const confidenceBadges = renderAnalyticsBadgeRow([
        ['Baseline', s.baselineInfo?.mode === 'target' ? 'Target' : 'Personal'],
        ['Score', s.confidence.score],
        ['Tee', s.confidence.teePlan],
        ['FIR', s.confidence.fir],
        ['Putting', s.confidence.putting]
    ]);

    return [
        '<div class="analytics-stack">',
        courseLeakStrip,
        renderAnalyticsSection('Sample', [
            ['Window', `${s.dateSpan} (${s.rounds} rounds)`],
            ['Normalized', `${s.normalizedCount}/${s.rounds} holes${s.mirroredCount > 0 ? ` | mirrored ${s.mirroredCount}` : ''}`],
            ['Baseline', s.baselineInfo?.label ?? 'My baseline']
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
        courseLeakSnapshot ? renderAnalyticsSection('Course Leak Snapshot', [
            { label: 'Main leak', html: courseLeakSnapshot.mainLeakHtml, valueClasses: 'analytics-row-value-emphasis' },
            { label: 'Secondary', html: courseLeakSnapshot.secondaryLeakHtml },
            { label: 'Best phase', html: courseLeakSnapshot.bestPhaseHtml },
            { label: 'This round', html: courseLeakSnapshot.currentRoundHtml },
            { label: 'Focus', html: courseLeakSnapshot.focusHtml }
        ], courseLeakSnapshot.introHtml) : '',
        s.strokesDashboard ? renderStrokesDashboardSection('Hole Strokes', s.strokesDashboard, {
            baselineLabel: s.baselineInfo?.label ?? 'My baseline',
            currentLabel: 'This hole',
            averageLabel: 'Hole average',
            sampleLabel: `${s.rounds} hole samples`
        }) : '',
        (s.roundStrokesDashboard || s.courseStrokesDashboard) ? renderRoundCourseDashboardSection(s.roundStrokesDashboard, s.courseStrokesDashboard, s.baselineInfo) : '',
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
    return formatHoleAnalyticsBasicFromSummary(currentHole, s);
}

function formatHoleAnalyticsBasicFromSummary(currentHole, s) {
    if (!s) return '<div class="analytics-muted">No samples found for this hole.</div>';
    const courseLeakSnapshot = buildCourseLeakSnapshot(s.courseStrokesDashboard, s.roundStrokesDashboard);
    const courseLeakStrip = courseLeakSnapshot ? renderCourseLeakSummaryStrip(courseLeakSnapshot) : '';

    const strokesNote = s.strokesDashboard
        ? [
            renderAnalyticsInlineMetric('Baseline', escapeHtml(s.baselineInfo?.mode === 'target' ? 'Target benchmark' : 'My baseline')),
            renderAnalyticsInlineMetric('Hole avg', renderAnalyticsDelta(s.strokesDashboard.average?.total)),
            renderAnalyticsInlineMetric('Round total', renderAnalyticsDelta(s.roundStrokesDashboard?.current?.total)),
            s.strokesDashboard.averageWorst
                ? renderAnalyticsInlineMetric('Leak', `${escapeHtml(labelDashboardPhase(s.strokesDashboard.averageWorst.key))} ${renderAnalyticsDelta(s.strokesDashboard.averageWorst.value)}`)
                : ''
        ].filter(Boolean).join('')
        : renderAnalyticsInlineMetric('Baseline', escapeHtml(s.baselineInfo?.label ?? 'My baseline'));

    return [
        '<div class="analytics-stack">',
        courseLeakStrip,
        '<div class="analytics-kpi-grid">',
        renderAnalyticsKpi('This Round', `${escapeHtml(String(currentHole.score))} (${escapeHtml(s.currentToParLabel)})`, `${s.rounds} rounds sampled`),
        renderAnalyticsKpi('Average', s.avgScore.toFixed(2), `Best ${escapeHtml(String(s.bestRound.score))} (${escapeHtml(s.bestRound.toParLabel)})`),
        renderAnalyticsKpi('FIR', s.firCompact, formatTeeOptionCompact(s.primaryTeeOption)),
        renderAnalyticsKpi('GIR / Putts', `${s.girPct.toFixed(1)}%`, `${s.avgPutts.toFixed(2)} putts | 3-putt ${s.threePuttRate.toFixed(1)}%`),
        '</div>',
        renderAnalyticsNote('Strokes Dashboard', `<div class="analytics-inline-grid">${strokesNote}</div>`),
        courseLeakSnapshot ? renderAnalyticsNote('Course Leak Snapshot', courseLeakSnapshot.noteHtml) : '',
        renderAnalyticsNote('Miss Pattern', `${escapeHtml(s.lateral.text)}<br><span class="analytics-muted">${escapeHtml(s.aimNote)}</span>`),
        renderAnalyticsNote('Practice Focus', escapeHtml(s.practiceFocus)),
        '</div>'
    ].join('');
}

function buildHoleAnalyticsDashboardModel(round, currentHole, samples, alignedGeometry, options = {}) {
    const summary = options.summary ?? buildHoleAnalyticsSummary(currentHole, samples, alignedGeometry, {
        roundStrokesDashboard: getRoundStrokesDashboard(round),
        courseStrokesDashboard: getCourseStrokesDashboard(round, spreadFilters)
    });
    return {
        title: 'Hole Analytics Dashboard',
        subtitle: round
            ? `${round.courseName} | ${round.date} | Score ${round.totalScore}`
            : 'Current hole analytics',
        holeLabel: `Hole ${currentHole.holeNumber} (Par ${currentHole.par})`,
        summaryTitle: 'Snapshot',
        secondaryTitle: 'Pre-Shot Caddie',
        mainTitle: 'Detailed Hole Analytics',
        summaryHtml: options.summaryText ?? formatHoleAnalyticsBasicFromSummary(currentHole, summary),
        detailsHtml: renderHoleAnalyticsDashboardDetails(currentHole, summary),
        caddieHtml: options.caddieText ?? formatPreShotCaddiePlan(currentHole, samples, alignedGeometry, selectedTeePlanClub)
    };
}

function buildCourseAnalyticsDashboardModel(round) {
    if (!round) {
        return {
            title: 'Course Analytics Dashboard',
            subtitle: 'No round loaded',
            holeLabel: '',
            summaryTitle: 'Course Snapshot',
            secondaryTitle: 'Hole Board',
            mainTitle: 'Course Overview',
            summaryHtml: '<div class="analytics-muted">No course data available.</div>',
            detailsHtml: '<div class="analytics-muted">No course data available.</div>',
            caddieHtml: '<div class="analytics-muted">No hole summaries available.</div>'
        };
    }

    const rounds = getCourseRounds(round, spreadFilters);
    const roundDashboard = getRoundStrokesDashboard(round);
    const courseDashboard = getCourseStrokesDashboard(round, spreadFilters);
    const leakSnapshot = buildCourseLeakSnapshot(courseDashboard, roundDashboard);
    const holeCards = getCourseHoleDashboardCards(round);

    return {
        title: 'Course Analytics Dashboard',
        subtitle: `${round.courseName} | ${rounds.length} rounds in window`,
        holeLabel: `${round.holes?.length ?? 0} holes`,
        summaryTitle: 'Course Snapshot',
        secondaryTitle: 'Hole Board',
        mainTitle: 'Course Overview',
        summaryHtml: renderCourseDashboardSummary(round, rounds, courseDashboard, leakSnapshot),
        detailsHtml: renderCourseDashboardDetails(round, rounds, courseDashboard, leakSnapshot, holeCards),
        caddieHtml: renderCourseDashboardRail(holeCards)
    };
}

function renderHoleAnalyticsDashboardDetails(currentHole, summary) {
    if (!summary) return '<div class="analytics-muted">No detailed hole analytics available.</div>';
    const courseLeakSnapshot = buildCourseLeakSnapshot(summary.courseStrokesDashboard, summary.roundStrokesDashboard);
    const tab = normalizeAnalyticsDashboardTab(analyticsDashboardTab);
    const panels = {
        overview: [
            courseLeakSnapshot ? renderCourseLeakSummaryStrip(courseLeakSnapshot) : '',
            renderAnalyticsSection('Sample', [
                ['Window', `${summary.dateSpan} (${summary.rounds} rounds)`],
                ['Normalized', `${summary.normalizedCount}/${summary.rounds} holes${summary.mirroredCount > 0 ? ` | mirrored ${summary.mirroredCount}` : ''}`],
                ['Baseline', summary.baselineInfo?.label ?? 'My baseline']
            ], renderAnalyticsBadgeRow([
                ['Baseline', summary.baselineInfo?.mode === 'target' ? 'Target' : 'Personal'],
                ['Score', summary.confidence.score],
                ['Tee', summary.confidence.teePlan],
                ['FIR', summary.confidence.fir],
                ['Putting', summary.confidence.putting]
            ])),
            renderAnalyticsSection('Scoring', [
                ['This round', `${escapeHtml(String(currentHole.score))} (${escapeHtml(summary.currentToParLabel)})`],
                ['Average', `${summary.avgScore.toFixed(2)} per round`],
                ['Best', `${escapeHtml(String(summary.bestRound.score))} (${escapeHtml(summary.bestRound.toParLabel)}) on ${escapeHtml(summary.bestRound.date)}`]
            ]),
            summary.strokesDashboard ? renderStrokesDashboardSection('Hole Strokes', summary.strokesDashboard, {
                baselineLabel: summary.baselineInfo?.label ?? 'My baseline',
                currentLabel: 'This hole',
                averageLabel: 'Hole average',
                sampleLabel: `${summary.rounds} hole samples`
            }) : '',
            (summary.roundStrokesDashboard || summary.courseStrokesDashboard)
                ? renderRoundCourseDashboardSection(summary.roundStrokesDashboard, summary.courseStrokesDashboard, summary.baselineInfo)
                : ''
        ].join(''),
        tee: [
            courseLeakSnapshot ? renderAnalyticsSection('Course Leak Snapshot', [
                { label: 'Main leak', html: courseLeakSnapshot.mainLeakHtml, valueClasses: 'analytics-row-value-emphasis' },
                { label: 'Secondary', html: courseLeakSnapshot.secondaryLeakHtml },
                { label: 'Focus', html: courseLeakSnapshot.focusHtml }
            ], courseLeakSnapshot.introHtml) : '',
            renderAnalyticsSection('Tee Game', [
                ['Primary plan', formatTeeOptionCompact(summary.primaryTeeOption)],
                ['Safer fallback', formatTeeOptionCompact(summary.conservativeTeeOption)],
                ['Usage', summary.teeClubUsage],
                ['FIR', summary.fir],
                ['FIR by club', summary.teeFirByClub],
                ['Score by club', summary.scoreByTeeClub]
            ]),
            renderTeeTrustSection(summary),
            renderTeePlanCompareTable(summary),
            renderAnalyticsSection('Pattern And Plan', [
                ['Miss bias', summary.lateral.text],
                ['Aim note', summary.aimNote],
                ['Practice focus', summary.practiceFocus]
            ])
        ].join(''),
        approach: [
            renderAnalyticsSection('Approach And Green', [
                ['GIR', `${summary.girPct.toFixed(1)}%`],
                ['Approach GIR', summary.girByApproachClub],
                ['Avg putts', `${summary.avgPutts.toFixed(2)} / hole`],
                ['First putt', summary.avgFirstPutt]
            ]),
            summary.strokesDashboard ? renderAnalyticsSection('Approach Strokes', [
                { label: 'This hole', html: renderAnalyticsDelta(summary.strokesDashboard.current?.approach), valueClasses: 'analytics-row-value-emphasis' },
                { label: 'Hole average', html: renderAnalyticsDelta(summary.strokesDashboard.average?.approach), valueClasses: 'analytics-row-value-emphasis' },
                ['Short game avg', formatBaselineDelta(summary.strokesDashboard.average?.short)],
                ['Putting avg', formatBaselineDelta(summary.strokesDashboard.average?.putting)]
            ]) : '',
            renderApproachWindowsSection(summary),
            renderAnalyticsSection('Approach Focus', [
                ['Likely miss pattern', summary.lateral.text],
                ['Practice focus', summary.practiceFocus]
            ])
        ].join(''),
        putting: [
            renderAnalyticsSection('Putting', [
                ['Avg putts', `${summary.avgPutts.toFixed(2)} / hole`],
                ['3-putt rate', `${summary.threePuttRate.toFixed(1)}%`],
                ['First putt', summary.avgFirstPutt],
                ['GIR', `${summary.girPct.toFixed(1)}%`]
            ]),
            summary.strokesDashboard ? renderAnalyticsSection('Putting Strokes', [
                { label: 'This hole', html: renderAnalyticsDelta(summary.strokesDashboard.current?.putting), valueClasses: 'analytics-row-value-emphasis' },
                { label: 'Hole average', html: renderAnalyticsDelta(summary.strokesDashboard.average?.putting), valueClasses: 'analytics-row-value-emphasis' },
                ['Best phase', summary.strokesDashboard.averageBest ? `${labelDashboardPhase(summary.strokesDashboard.averageBest.key)} ${formatBaselineDelta(summary.strokesDashboard.averageBest.value)}` : 'n/a']
            ]) : '',
            renderPuttingPressureSection(summary),
            renderAnalyticsSection('Lag And Conversion', [
                ['First putt distance', summary.avgFirstPutt],
                ['3-putt pressure', `${summary.threePuttRate.toFixed(1)}%`]
            ])
        ].join(''),
        risk: [
            renderAnalyticsSection('Risk', [
                ['Penalties', `${summary.avgPenalties.toFixed(2)} / hole`],
                ['Penalty events', summary.penaltySummary.overview],
                ['Penalty split', summary.penaltySummary.split],
                ['Penalty clubs', summary.penaltySummary.byClub]
            ]),
            courseLeakSnapshot ? renderAnalyticsSection('Course Leak Snapshot', [
                { label: 'Main leak', html: courseLeakSnapshot.mainLeakHtml, valueClasses: 'analytics-row-value-emphasis' },
                { label: 'This round', html: courseLeakSnapshot.currentRoundHtml },
                { label: 'Focus', html: courseLeakSnapshot.focusHtml }
            ], courseLeakSnapshot.introHtml) : '',
            renderAnalyticsSection('Pattern And Plan', [
                ['Miss bias', summary.lateral.text],
                ['Aim note', summary.aimNote],
                ['Practice focus', summary.practiceFocus]
            ])
        ].join('')
    };

    const tabs = [
        ['overview', 'Overview'],
        ['tee', 'Tee Strategy'],
        ['approach', 'Approach'],
        ['putting', 'Putting'],
        ['risk', 'Risk']
    ];

    return [
        '<div class="analytics-dashboard-tabs">',
        tabs.map(([key, label]) => `
            <button type="button" class="analytics-dashboard-tab${key === tab ? ' is-active' : ''}" data-dashboard-tab="${escapeHtml(key)}" aria-pressed="${key === tab ? 'true' : 'false'}">
                ${escapeHtml(label)}
            </button>
        `).join(''),
        '</div>',
        `<div class="analytics-dashboard-tab-panel">${panels[tab] ?? panels.overview}</div>`
    ].join('');
}

function renderCourseDashboardSummary(round, rounds, courseDashboard, leakSnapshot) {
    const rows = [
        renderAnalyticsInlineMetric('Rounds in window', escapeHtml(String(rounds?.length ?? 0))),
        renderAnalyticsInlineMetric('Baseline', escapeHtml(getCurrentBaselineInfo().label)),
        renderAnalyticsInlineMetric('Course avg', renderAnalyticsDelta(courseDashboard?.average?.total)),
        renderAnalyticsInlineMetric('Main leak', leakSnapshot?.mainLeakHtml ?? '<span class="analytics-muted">n/a</span>')
    ].join('');
    return [
        leakSnapshot ? renderCourseLeakSummaryStrip(leakSnapshot) : '',
        `<div class="analytics-inline-grid">${rows}</div>`
    ].join('');
}

function renderTeePlanCompareTable(summary) {
    const options = (summary?.teeOptions ?? [])
        .filter(option => !option?.plannerOnly)
        .slice()
        .sort((a, b) => {
            const scoreA = Number.isFinite(a?.strategyExpectedScore) ? a.strategyExpectedScore : Number.POSITIVE_INFINITY;
            const scoreB = Number.isFinite(b?.strategyExpectedScore) ? b.strategyExpectedScore : Number.POSITIVE_INFINITY;
            if (scoreA !== scoreB) return scoreA - scoreB;
            return (b?.n ?? 0) - (a?.n ?? 0);
        });

    if (options.length === 0) {
        return '<section class="analytics-section"><div class="analytics-section-title">Tee Plan Compare</div><div class="analytics-muted">No tee-plan comparison available yet.</div></section>';
    }

    return [
        '<section class="analytics-section">',
        '<div class="analytics-section-title">Tee Plan Compare</div>',
        '<div class="analytics-section-intro">Click a row to preview that tee plan on the hole.</div>',
        '<div class="tee-plan-table-wrap">',
        '<table class="tee-plan-table">',
        '<thead><tr><th>Club</th><th>Score</th><th>FIR</th><th>Pen</th><th>Leave</th><th>Next</th><th>GIR</th><th>Putts</th><th>Sample</th></tr></thead>',
        '<tbody>',
        options.map(option => renderTeePlanCompareRow(option)).join(''),
        '</tbody>',
        '</table>',
        '</div>',
        '</section>'
    ].join('');
}

function renderTeePlanCompareRow(option) {
    const selected = normalize(selectedTeePlanClub) === normalize(option?.club);
    const expectedScore = Number.isFinite(option?.strategyExpectedScore) ? option.strategyExpectedScore : option?.adjustedExpectedScore;
    const approachPlan = option?.approachPlan ?? null;
    const approachPreview = option?.approachPreview ?? null;
    const girText = Number.isFinite(approachPreview?.girRate) ? `${(approachPreview.girRate * 100).toFixed(0)}%` : 'n/a';
    const puttText = Number.isFinite(approachPreview?.avgPuttsIfGreen) ? approachPreview.avgPuttsIfGreen.toFixed(2) : 'n/a';
    const nextClub = approachPlan?.clubName ?? 'n/a';
    const leaveText = Number.isFinite(option?.leaveDistance) ? `${option.leaveDistance.toFixed(0)} yds` : 'n/a';
    const firText = Number.isFinite(option?.firRateAdj) ? `${(option.firRateAdj * 100).toFixed(0)}%` : 'n/a';
    const penText = Number.isFinite(option?.penaltyHoleRateAdj) ? `${(option.penaltyHoleRateAdj * 100).toFixed(0)}%` : 'n/a';
    const sampleText = `${option?.confidence ?? 'n/a'} | n=${option?.n ?? 0}`;

    return [
        `<tr class="tee-plan-table-row${selected ? ' is-selected' : ''}" data-tee-plan-club="${escapeHtml(option?.club ?? '')}">`,
        `<td><button type="button" class="tee-plan-table-btn" data-tee-plan-club="${escapeHtml(option?.club ?? '')}">${escapeHtml(option?.club ?? 'n/a')}</button></td>`,
        `<td>${Number.isFinite(expectedScore) ? escapeHtml(expectedScore.toFixed(2)) : 'n/a'}</td>`,
        `<td>${escapeHtml(firText)}</td>`,
        `<td>${escapeHtml(penText)}</td>`,
        `<td>${escapeHtml(leaveText)}</td>`,
        `<td>${escapeHtml(nextClub)}</td>`,
        `<td>${escapeHtml(girText)}</td>`,
        `<td>${escapeHtml(puttText)}</td>`,
        `<td>${escapeHtml(sampleText)}</td>`,
        '</tr>'
    ].join('');
}

function renderTeeTrustSection(summary) {
    const trustRows = Array.isArray(summary?.teeTrustScores) ? summary.teeTrustScores : [];
    if (trustRows.length === 0) {
        return '<section class="analytics-section"><div class="analytics-section-title">Club Trust Score</div><div class="analytics-muted">Need a few tee-club samples on this hole before trust scores settle.</div></section>';
    }

    return [
        '<section class="analytics-section">',
        '<div class="analytics-section-title">Club Trust Score</div>',
        '<div class="analytics-section-intro">Blends scoring trend, fairway control, penalty load, dispersion, and sample size. Click a card to preview that club.</div>',
        '<div class="tee-trust-grid">',
        trustRows.map(row => renderTeeTrustCard(row)).join(''),
        '</div>',
        '</section>'
    ].join('');
}

function renderTeeTrustCard(row) {
    const selected = normalize(selectedTeePlanClub) === normalize(row?.club);
    const tone = row?.trustScore >= 76 ? 'high' : row?.trustScore >= 60 ? 'medium' : 'low';
    const metricBits = [
        Number.isFinite(row?.expectedScore) ? `Exp ${row.expectedScore.toFixed(2)}` : null,
        Number.isFinite(row?.firPct) ? `FIR ${row.firPct.toFixed(0)}%` : null,
        Number.isFinite(row?.penaltyPct) ? `Pen ${row.penaltyPct.toFixed(0)}%` : null,
        Number.isFinite(row?.dispersionMeters) ? `Lat spread ${row.dispersionMeters.toFixed(1)}m` : null,
        `n=${row?.n ?? 0}`
    ].filter(Boolean);

    return [
        `<button type="button" class="tee-trust-card tee-trust-card-${tone}${selected ? ' is-selected' : ''}" data-tee-plan-club="${escapeHtml(row?.club ?? '')}">`,
        '<div class="tee-trust-card-head">',
        '<div>',
        `<div class="tee-trust-role">${escapeHtml(row?.roleLabel ?? 'Tee option')}</div>`,
        `<div class="tee-trust-club">${escapeHtml(row?.club ?? 'Unknown club')}</div>`,
        '</div>',
        '<div class="tee-trust-score-wrap">',
        `<div class="tee-trust-score">${escapeHtml(String(row?.trustScore ?? 0))}</div>`,
        `<div class="tee-trust-band">${escapeHtml(row?.trustLabel ?? 'Building')}</div>`,
        '</div>',
        '</div>',
        `<div class="tee-trust-bar"><span style="width:${clamp(Number(row?.trustScore) || 0, 0, 100)}%"></span></div>`,
        `<div class="tee-trust-metrics">${metricBits.map(bit => `<span class="tee-trust-metric">${escapeHtml(bit)}</span>`).join('')}</div>`,
        `<div class="tee-trust-note">${escapeHtml(row?.note ?? 'Signal still building.')}</div>`,
        '</button>'
    ].join('');
}

function renderPuttingPressureSection(summary) {
    const matrix = summary?.puttingPressure;
    const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
    if (rows.length === 0) {
        return '<section class="analytics-section"><div class="analytics-section-title">Putting Pressure Matrix</div><div class="analytics-muted">No first-putt samples available on this hole yet.</div></section>';
    }

    return [
        '<section class="analytics-section">',
        '<div class="analytics-section-title">Putting Pressure Matrix</div>',
        `<div class="analytics-section-intro">${escapeHtml(matrix?.focus ?? 'First-putt outcomes by distance band on this hole.')}</div>`,
        '<div class="putt-pressure-wrap">',
        '<table class="putt-pressure-table">',
        '<thead><tr><th>First putt</th><th>Avg putts</th><th>1-putt</th><th>3-putt</th><th>Sample</th><th>Read</th></tr></thead>',
        '<tbody>',
        rows.map(row => renderPuttingPressureRow(row)).join(''),
        '</tbody>',
        '</table>',
        '</div>',
        '</section>'
    ].join('');
}

function renderPuttingPressureRow(row) {
    const tone = row?.tone ?? 'neutral';
    return [
        `<tr class="putt-pressure-row putt-pressure-row-${escapeHtml(tone)}">`,
        `<td>${escapeHtml(row?.label ?? 'n/a')}</td>`,
        `<td>${Number.isFinite(row?.avgPutts) ? escapeHtml(row.avgPutts.toFixed(2)) : 'n/a'}</td>`,
        `<td>${Number.isFinite(row?.onePuttRate) ? escapeHtml(`${(row.onePuttRate * 100).toFixed(0)}%`) : 'n/a'}</td>`,
        `<td>${Number.isFinite(row?.threePuttRate) ? escapeHtml(`${(row.threePuttRate * 100).toFixed(0)}%`) : 'n/a'}</td>`,
        `<td>${escapeHtml(`n=${row?.count ?? 0}`)}</td>`,
        `<td>${escapeHtml(row?.read ?? 'Building')}</td>`,
        '</tr>'
    ].join('');
}

function renderApproachWindowsSection(summary) {
    const model = summary?.approachWindows;
    const rows = Array.isArray(model?.rows) ? model.rows : [];
    if (rows.length === 0) {
        return '<section class="analytics-section"><div class="analytics-section-title">Approach Windows</div><div class="analytics-muted">Not enough non-tee approach samples on this hole yet.</div></section>';
    }

    return [
        '<section class="analytics-section">',
        '<div class="analytics-section-title">Approach Windows</div>',
        `<div class="analytics-section-intro">${escapeHtml(model?.focus ?? 'Your scoring by starting distance window on this hole.')}</div>`,
        '<div class="approach-window-wrap">',
        '<table class="approach-window-table">',
        '<thead><tr><th>Start</th><th>Lie</th><th>Finish</th><th>GIR</th><th>Proximity</th><th>Club</th><th>Read</th></tr></thead>',
        '<tbody>',
        rows.map(row => renderApproachWindowRow(row)).join(''),
        '</tbody>',
        '</table>',
        '</div>',
        '</section>'
    ].join('');
}

function renderApproachWindowRow(row) {
    const tone = row?.tone ?? 'neutral';
    return [
        `<tr class="approach-window-row approach-window-row-${escapeHtml(tone)}">`,
        `<td>${escapeHtml(row?.label ?? 'n/a')}</td>`,
        `<td>${escapeHtml(row?.lieLabel ?? 'mixed')}</td>`,
        `<td>${Number.isFinite(row?.avgFinish) ? escapeHtml(`${row.avgFinish.toFixed(2)} shots`) : 'n/a'}</td>`,
        `<td>${Number.isFinite(row?.girRate) ? escapeHtml(`${(row.girRate * 100).toFixed(0)}%`) : 'n/a'}</td>`,
        `<td>${Number.isFinite(row?.avgEndDistance) ? escapeHtml(`${row.avgEndDistance.toFixed(1)} yds`) : 'n/a'}</td>`,
        `<td>${escapeHtml(row?.clubLabel ?? 'mixed')}</td>`,
        `<td>${escapeHtml(row?.read ?? 'Building')}</td>`,
        '</tr>'
    ].join('');
}

function renderCourseDashboardRail(holeCards) {
    if (!Array.isArray(holeCards) || holeCards.length === 0) {
        return '<div class="analytics-muted">No hole cards available yet.</div>';
    }
    return [
        '<div class="analytics-dashboard-hole-list">',
        '<div class="analytics-dashboard-hole-list-note">Click a hole to jump into its detailed dashboard.</div>',
        holeCards.map(card => renderCourseHoleCard(card, { compact: true, active: card.idx === currentHoleIdx })).join(''),
        '</div>'
    ].join('');
}

function renderCourseHoleRankings(holeCards) {
    if (!Array.isArray(holeCards) || holeCards.length === 0) return '';
    const sections = [
        {
            title: 'Hardest Holes',
            cards: holeCards
                .filter(card => Number.isFinite(card?.avgToPar))
                .slice()
                .sort((a, b) => b.avgToPar - a.avgToPar)
                .slice(0, 3),
            metric: card => formatSigned(card.avgToPar, 1),
            metricLabel: 'Avg to par'
        },
        {
            title: 'Biggest Leak Holes',
            cards: holeCards
                .filter(card => Number.isFinite(card?.averageStrokesDelta))
                .slice()
                .sort((a, b) => a.averageStrokesDelta - b.averageStrokesDelta)
                .slice(0, 3),
            metric: card => formatBaselineDelta(card.averageStrokesDelta),
            metricLabel: 'Avg strokes'
        },
        {
            title: 'Penalty Trouble',
            cards: holeCards
                .filter(card => Number.isFinite(card?.avgPenalties))
                .slice()
                .sort((a, b) => b.avgPenalties - a.avgPenalties)
                .slice(0, 3),
            metric: card => `${card.avgPenalties.toFixed(2)} / hole`,
            metricLabel: 'Penalties'
        },
        {
            title: 'Best Tee Stability',
            cards: holeCards
                .filter(card => Number.isFinite(card?.firPct))
                .slice()
                .sort((a, b) => b.firPct - a.firPct)
                .slice(0, 3),
            metric: card => `${card.firPct.toFixed(1)}%`,
            metricLabel: 'FIR'
        }
    ].filter(section => section.cards.length > 0);

    if (sections.length === 0) return '';

    return [
        '<section class="analytics-section">',
        '<div class="analytics-section-title">Hole Rankings</div>',
        '<div class="hole-ranking-grid">',
        sections.map(section => renderCourseRankingSection(section.title, section.cards, section.metric, section.metricLabel)).join(''),
        '</div>',
        '</section>'
    ].join('');
}

function renderCourseRankingSection(title, cards, metricFn, metricLabel) {
    return [
        '<div class="hole-ranking-section">',
        `<div class="hole-ranking-title">${escapeHtml(title)}</div>`,
        cards.map((card, index) => renderCourseRankingItem(card, index + 1, metricFn, metricLabel)).join(''),
        '</div>'
    ].join('');
}

function renderCourseRankingItem(card, rank, metricFn, metricLabel) {
    return [
        `<button type="button" class="hole-ranking-item${card.idx === currentHoleIdx ? ' is-active' : ''}" data-dashboard-hole-index="${escapeHtml(String(card.idx))}">`,
        `<span class="hole-ranking-rank">${escapeHtml(String(rank))}</span>`,
        '<span class="hole-ranking-body">',
        `<span class="hole-ranking-hole">Hole ${escapeHtml(String(card.holeNumber))} <span>Par ${escapeHtml(String(card.par))}</span></span>`,
        `<span class="hole-ranking-meta">${escapeHtml(metricLabel)}: ${escapeHtml(metricFn(card))}</span>`,
        `<span class="hole-ranking-sub">${escapeHtml(card.primaryClub)} | ${escapeHtml(card.currentScore.toFixed(0))} ${escapeHtml(card.currentToParLabel)}</span>`,
        '</span>',
        '</button>'
    ].join('');
}

function renderCourseDashboardDetails(round, rounds, courseDashboard, leakSnapshot, holeCards) {
    const courseRows = [
        { label: 'Course avg', html: renderAnalyticsDelta(courseDashboard?.average?.total), valueClasses: 'analytics-row-value-emphasis' },
        { label: 'Best phase', html: courseDashboard?.averageBest ? `${escapeHtml(labelDashboardPhase(courseDashboard.averageBest.key))} ${renderAnalyticsDelta(courseDashboard.averageBest.value)}` : '<span class="analytics-muted">n/a</span>' },
        { label: 'Main leak', html: leakSnapshot?.mainLeakHtml ?? '<span class="analytics-muted">n/a</span>' },
        { label: 'Focus', html: leakSnapshot?.focusHtml ?? '<span class="analytics-muted">n/a</span>' }
    ];
    return [
        renderAnalyticsSection('Course Overview', courseRows, `<div class="analytics-section-intro">${escapeHtml(round.courseName)}<span class="analytics-section-intro-sep">|</span>${escapeHtml(String(rounds?.length ?? 0))} rounds in window</div>`),
        renderCourseHoleRankings(holeCards),
        '<section class="analytics-section">',
        '<div class="analytics-section-title">Hole Board</div>',
        '<div class="analytics-dashboard-hole-grid">',
        holeCards.map(card => renderCourseHoleCard(card, { compact: false, active: card.idx === currentHoleIdx })).join(''),
        '</div>',
        '</section>'
    ].join('');
}

function getCourseHoleDashboardCards(round) {
    if (!round) return [];
    const key = getCourseHoleCardsCacheKey(round, spreadFilters);
    if (courseHoleCardsCache.has(key)) {
        return courseHoleCardsCache.get(key);
    }
    const roundDashboard = getRoundStrokesDashboard(round);
    const courseDashboard = getCourseStrokesDashboard(round, spreadFilters);
    const cards = buildCourseHoleDashboardCards(round, roundDashboard, courseDashboard);
    courseHoleCardsCache.set(key, cards);
    return cards;
}

function buildCourseHoleDashboardCards(round, roundDashboard = null, courseDashboard = null) {
    const holeCards = [];
    const holes = round?.holes ?? [];
    for (let idx = 0; idx < holes.length; idx++) {
        const holeRaw = holes[idx];
        const geometryStatus = inspectHoleGeometry(round, holeRaw);
        const selectedHole = maybeMirrorHoleShots(holeRaw, geometryStatus.holeGeometry);
        const aligned = alignHoleGeometryToHole(geometryStatus.holeGeometry, selectedHole);
        const holeGeometry = aligned.geometry;
        const samplesRaw = getHoleSamples(round, holeRaw.holeNumber, spreadFilters)
            .map(h => maybeMirrorHoleShots(h, geometryStatus.holeGeometry));
        const samples = normalizeSamplesToReference(samplesRaw, selectedHole, holeGeometry);
        const summary = buildHoleAnalyticsSummary(selectedHole, samples, holeGeometry, {
            roundStrokesDashboard: roundDashboard,
            courseStrokesDashboard: courseDashboard
        });
        if (!summary) continue;
        holeCards.push({
            idx,
            holeNumber: Number(selectedHole.holeNumber),
            par: Number(selectedHole.par),
            currentScore: Number(selectedHole.score),
            currentToParLabel: summary.currentToParLabel,
            avgScore: summary.avgScore,
            avgToPar: summary.avgScore - summary.holePar,
            primaryClub: summary.primaryTeeOption?.club ?? 'n/a',
            firCompact: summary.firCompact,
            firPct: Number(summary.firPct),
            girPct: Number(summary.girPct),
            avgPenalties: Number(summary.avgPenalties),
            avgPutts: Number(summary.avgPutts),
            averageStrokesDelta: Number(summary.strokesDashboard?.average?.total),
            leak: summary.strokesDashboard?.averageWorst ?? null,
            bestPhase: summary.strokesDashboard?.averageBest ?? null
        });
    }
    return holeCards;
}

function renderCourseHoleCard(card, options = {}) {
    const compact = !!options.compact;
    const active = !!options.active;
    const leakHtml = card.leak
        ? `${escapeHtml(labelDashboardPhase(card.leak.key))} ${renderAnalyticsDelta(card.leak.value)}`
        : '<span class="analytics-muted">Leak building</span>';
    const bestHtml = card.bestPhase
        ? `${escapeHtml(labelDashboardPhase(card.bestPhase.key))} ${renderAnalyticsDelta(card.bestPhase.value)}`
        : '<span class="analytics-muted">Best phase building</span>';
    return [
        `<button type="button" class="analytics-dashboard-hole-card${active ? ' is-active' : ''}${compact ? ' is-compact' : ''}" data-dashboard-hole-index="${escapeHtml(String(card.idx))}">`,
        '<div class="analytics-dashboard-hole-card-head">',
        `<div><div class="analytics-dashboard-hole-card-title">Hole ${escapeHtml(String(card.holeNumber))}</div><div class="analytics-dashboard-hole-card-sub">Par ${escapeHtml(String(card.par))}</div></div>`,
        `<div class="analytics-dashboard-hole-card-score">${escapeHtml(String(card.currentScore))} <span>${escapeHtml(card.currentToParLabel)}</span></div>`,
        '</div>',
        `<div class="analytics-dashboard-hole-card-row"><span>Average</span><strong>${escapeHtml(card.avgScore.toFixed(2))}</strong></div>`,
        `<div class="analytics-dashboard-hole-card-row"><span>Primary plan</span><strong>${escapeHtml(card.primaryClub)}</strong></div>`,
        compact ? '' : `<div class="analytics-dashboard-hole-card-row"><span>FIR</span><strong>${escapeHtml(card.firCompact)}</strong></div>`,
        `<div class="analytics-dashboard-hole-card-row analytics-dashboard-hole-card-rich"><span>Main leak</span><strong>${leakHtml}</strong></div>`,
        compact ? '' : `<div class="analytics-dashboard-hole-card-row analytics-dashboard-hole-card-rich"><span>Best phase</span><strong>${bestHtml}</strong></div>`,
        '</button>'
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
    const primaryApproachPreview = buildApproachPreviewForPlan(primary, primaryApproachPlan);
    const conservativeApproachPreview = buildApproachPreviewForPlan(conservative, conservativeApproachPlan);

    return [
        '<div class="caddie-stack">',
        `<div class="caddie-meta">Hole ${escapeHtml(String(currentHole.holeNumber))} (Par ${escapeHtml(String(currentHole.par))})<br>Window: ${escapeHtml(dateSpan)} (${samples.length} rounds)<br><span class="analytics-muted">Click a tee plan to preview its aim line and dispersion.</span></div>`,
        '<div class="caddie-plan-grid">',
        renderCaddiePlan(primary, primaryApproachPlan, primaryApproachPreview, 'Primary tee plan', 'primary', normalize(activeOption?.club) === normalize(primary?.club)),
        conservative && conservative.club !== primary?.club
            ? renderCaddiePlan(conservative, conservativeApproachPlan, conservativeApproachPreview, 'Safer fallback', 'secondary', normalize(activeOption?.club) === normalize(conservative?.club))
            : '<div class="caddie-plan secondary disabled"><div class="caddie-plan-header"><div><div class="caddie-plan-label">Safer fallback</div><div class="caddie-plan-club">No distinct backup yet</div></div></div><div class="caddie-subnote">You need a few more rounds with a second tee club before a backup line is reliable.</div></div>',
        '</div>',
        renderCaddieCallout('Aim cue', escapeHtml(planAimNote)),
        comparison ? renderCaddieCallout('Tradeoff', comparison) : '',
        '</div>'
    ].join('');
}

function renderStrokesDashboardSection(title, dashboard, options = {}) {
    if (!dashboard) return '';
    const rows = [
        { label: options.currentLabel ?? 'Current', html: renderAnalyticsDelta(dashboard.current?.total), valueClasses: 'analytics-row-value-emphasis' },
        { label: options.averageLabel ?? 'Average', html: renderAnalyticsDelta(dashboard.average?.total), valueClasses: 'analytics-row-value-emphasis' },
        { label: 'Tee', html: renderAnalyticsDeltaComparison(dashboard.current?.tee, dashboard.average?.tee) },
        { label: 'Approach', html: renderAnalyticsDeltaComparison(dashboard.current?.approach, dashboard.average?.approach) },
        { label: 'Short game', html: renderAnalyticsDeltaComparison(dashboard.current?.short, dashboard.average?.short) },
        { label: 'Putting', html: renderAnalyticsDeltaComparison(dashboard.current?.putting, dashboard.average?.putting) },
        { label: 'Penalties', html: renderAnalyticsDeltaComparison(dashboard.current?.penalties, dashboard.average?.penalties) },
        {
            label: 'Main leak',
            html: dashboard.averageWorst
                ? `${escapeHtml(labelDashboardPhase(dashboard.averageWorst.key))} ${renderAnalyticsDelta(dashboard.averageWorst.value)}`
                : '<span class="analytics-muted">n/a</span>'
        },
        {
            label: 'Best phase',
            html: dashboard.averageBest
                ? `${escapeHtml(labelDashboardPhase(dashboard.averageBest.key))} ${renderAnalyticsDelta(dashboard.averageBest.value)}`
                : '<span class="analytics-muted">n/a</span>'
        }
    ];
    const introBits = [
        options.baselineLabel ? `<span>${escapeHtml(options.baselineLabel)}</span>` : '',
        options.sampleLabel ? `<span>${escapeHtml(options.sampleLabel)}</span>` : ''
    ].filter(Boolean);
    const introHtml = introBits.length > 0
        ? `<div class="analytics-section-intro">${introBits.join('<span class="analytics-section-intro-sep">|</span>')}</div>`
        : '';
    return renderAnalyticsSection(title, rows, introHtml);
}

function renderRoundCourseDashboardSection(roundDashboard, courseDashboard, baselineInfo) {
    if (!roundDashboard && !courseDashboard) return '';
    const rows = [
        { label: 'Baseline', html: `<span class="analytics-muted">${escapeHtml(baselineInfo?.label ?? 'My baseline')}</span>` },
        { label: 'This round', html: renderAnalyticsDelta(roundDashboard?.current?.total), valueClasses: 'analytics-row-value-emphasis' },
        { label: 'Course avg', html: renderAnalyticsDelta(courseDashboard?.average?.total), valueClasses: 'analytics-row-value-emphasis' },
        { label: 'Round tee', html: renderAnalyticsDelta(roundDashboard?.current?.tee) },
        { label: 'Round approach', html: renderAnalyticsDelta(roundDashboard?.current?.approach) },
        { label: 'Round short', html: renderAnalyticsDelta(roundDashboard?.current?.short) },
        { label: 'Round putting', html: renderAnalyticsDelta(roundDashboard?.current?.putting) },
        { label: 'Course tee', html: renderAnalyticsDelta(courseDashboard?.average?.tee) },
        { label: 'Course approach', html: renderAnalyticsDelta(courseDashboard?.average?.approach) },
        { label: 'Course short', html: renderAnalyticsDelta(courseDashboard?.average?.short) },
        { label: 'Course putting', html: renderAnalyticsDelta(courseDashboard?.average?.putting) },
        {
            label: 'Course leak',
            html: courseDashboard?.averageWorst
                ? `${escapeHtml(labelDashboardPhase(courseDashboard.averageWorst.key))} ${renderAnalyticsDelta(courseDashboard.averageWorst.value)}`
                : '<span class="analytics-muted">n/a</span>'
        }
    ];
    const introBits = [
        roundDashboard?.holes ? `<span>${escapeHtml(String(roundDashboard.holes))} holes in this round</span>` : '',
        courseDashboard?.rounds ? `<span>${escapeHtml(String(courseDashboard.rounds))} course rounds</span>` : '',
        courseDashboard?.dateSpan ? `<span>${escapeHtml(courseDashboard.dateSpan)}</span>` : ''
    ].filter(Boolean);
    const introHtml = introBits.length > 0
        ? `<div class="analytics-section-intro">${introBits.join('<span class="analytics-section-intro-sep">|</span>')}</div>`
        : '';
    return renderAnalyticsSection('Round And Course', rows, introHtml);
}

function renderAnalyticsInlineMetric(label, valueHtml) {
    return [
        '<div class="analytics-inline-metric">',
        `<span class="analytics-inline-metric-label">${escapeHtml(label)}</span>`,
        `<span class="analytics-inline-metric-value">${valueHtml}</span>`,
        '</div>'
    ].join('');
}

function renderAnalyticsDeltaComparison(currentValue, averageValue) {
    const parts = [];
    if (Number.isFinite(currentValue)) {
        parts.push(`<span class="analytics-delta-pair-item"><span class="analytics-delta-pair-label">Now</span>${renderAnalyticsDelta(currentValue)}</span>`);
    }
    if (Number.isFinite(averageValue)) {
        parts.push(`<span class="analytics-delta-pair-item"><span class="analytics-delta-pair-label">Avg</span>${renderAnalyticsDelta(averageValue)}</span>`);
    }
    return parts.length > 0 ? `<span class="analytics-delta-pair">${parts.join('<span class="analytics-delta-pair-sep"></span>')}</span>` : '<span class="analytics-muted">n/a</span>';
}

function renderAnalyticsDelta(value, decimals = 2) {
    if (!Number.isFinite(value)) return '<span class="analytics-muted">n/a</span>';
    const tone = value > 0.01 ? 'gained' : value < -0.01 ? 'lost' : 'even';
    return `<span class="analytics-delta analytics-delta-${tone}">${escapeHtml(formatBaselineDelta(value, decimals))}</span>`;
}

function renderCourseLeakSummaryStrip(snapshot) {
    if (!snapshot) return '';
    return [
        '<section class="analytics-strip">',
        '<div class="analytics-strip-title">Course Snapshot</div>',
        '<div class="analytics-strip-grid">',
        renderAnalyticsStripCard('Main leak', snapshot.mainLeakHtml),
        renderAnalyticsStripCard('Best phase', snapshot.bestPhaseHtml),
        renderAnalyticsStripCard('This round', snapshot.currentRoundHtml),
        '</div>',
        snapshot.focusHtml ? `<div class="analytics-strip-footer">${snapshot.focusHtml}</div>` : '',
        '</section>'
    ].join('');
}

function renderAnalyticsStripCard(label, valueHtml) {
    return [
        '<div class="analytics-strip-card">',
        `<div class="analytics-strip-card-label">${escapeHtml(label)}</div>`,
        `<div class="analytics-strip-card-value">${valueHtml}</div>`,
        '</div>'
    ].join('');
}

function buildCourseLeakSnapshot(courseDashboard, roundDashboard) {
    const average = courseDashboard?.average;
    if (!average) return null;

    const ranked = rankDashboardPhases(average, true);
    const leakPhases = ranked.filter(phase => Number.isFinite(phase.value) && phase.value < -0.01);
    const gainPhases = ranked
        .filter(phase => Number.isFinite(phase.value) && phase.value > 0.01)
        .sort((a, b) => b.value - a.value);
    const mainLeak = leakPhases[0] ?? null;
    const secondaryLeak = leakPhases[1] ?? null;
    const bestPhase = gainPhases[0] ?? findBestBreakdownPhase(average);
    const currentWorst = findWorstBreakdownPhase(roundDashboard?.current);

    const introBits = [
        courseDashboard?.rounds ? `<span>${escapeHtml(String(courseDashboard.rounds))} course rounds</span>` : '',
        courseDashboard?.dateSpan ? `<span>${escapeHtml(courseDashboard.dateSpan)}</span>` : ''
    ].filter(Boolean);
    const introHtml = introBits.length > 0
        ? `<div class="analytics-section-intro">${introBits.join('<span class="analytics-section-intro-sep">|</span>')}</div>`
        : '';

    const mainLeakHtml = mainLeak
        ? `${escapeHtml(labelDashboardPhase(mainLeak.key))} ${renderAnalyticsDelta(mainLeak.value)}`
        : '<span class="analytics-muted">No clear course-wide leak yet</span>';
    const secondaryLeakHtml = secondaryLeak
        ? `${escapeHtml(labelDashboardPhase(secondaryLeak.key))} ${renderAnalyticsDelta(secondaryLeak.value)}`
        : '<span class="analytics-muted">No second clear leak</span>';
    const bestPhaseHtml = bestPhase
        ? `${escapeHtml(labelDashboardPhase(bestPhase.key))} ${renderAnalyticsDelta(bestPhase.value)}`
        : '<span class="analytics-muted">n/a</span>';
    const currentRoundHtml = currentWorst
        ? `${escapeHtml(labelDashboardPhase(currentWorst.key))} ${renderAnalyticsDelta(currentWorst.value)}`
        : '<span class="analytics-muted">Round trend building</span>';
    const focusText = buildCourseLeakFocus(mainLeak, secondaryLeak, currentWorst);
    const focusHtml = escapeHtml(focusText);
    const noteHtml = [
        '<div class="analytics-inline-grid">',
        renderAnalyticsInlineMetric('Main leak', mainLeakHtml),
        renderAnalyticsInlineMetric('This round', currentRoundHtml),
        renderAnalyticsInlineMetric('Focus', focusHtml),
        '</div>'
    ].join('');

    return {
        introHtml,
        mainLeakHtml,
        secondaryLeakHtml,
        bestPhaseHtml,
        currentRoundHtml,
        focusHtml,
        noteHtml
    };
}

function buildCourseLeakFocus(mainLeak, secondaryLeak, currentWorst) {
    if (!mainLeak) {
        return 'No single phase is separating from the rest yet. Keep logging rounds so the course trend sharpens.';
    }

    const phaseName = labelDashboardPhase(mainLeak.key);
    const roundMatches = currentWorst?.key && currentWorst.key === mainLeak.key;

    if (mainLeak.key === 'penalties') {
        return roundMatches
            ? 'Penalty management is the clearest scoring win here, and this round is following the same pattern.'
            : 'Penalty management is the clearest scoring win here. Keep the next tee plan biased away from the danger side.';
    }

    if (secondaryLeak?.key === 'penalties') {
        return `${phaseName} is costing the most, with penalties as the backup leak. Clean strike pattern first, then take risk off the miss side.`;
    }

    if (roundMatches) {
        return `${phaseName} is the course-wide leak and it is showing up again this round. That is the first phase to attack in practice and strategy.`;
    }

    return `${phaseName} is the biggest course-wide leak right now. Prioritize decisions that give you easier ${phaseName.toLowerCase()} shots on this course.`;
}

function rankDashboardPhases(row, includePenalties = false) {
    if (!row) return [];
    const keys = includePenalties
        ? ['tee', 'approach', 'short', 'putting', 'penalties']
        : ['tee', 'approach', 'short', 'putting'];
    return keys
        .map(key => ({ key, value: Number(row?.[key]) }))
        .filter(entry => Number.isFinite(entry.value))
        .sort((a, b) => a.value - b.value);
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
        rows.map(entry => renderAnalyticsRow(entry)).join(''),
        '</div>',
        '</section>'
    ].join('');
}

function renderAnalyticsRow(entry, value = undefined) {
    const row = Array.isArray(entry)
        ? {
            label: entry[0],
            value: entry[1]
        }
        : typeof entry === 'object' && entry !== null
            ? entry
            : { label: entry, value };
    const label = row.label ?? '-';
    const valueHtml = typeof row.html === 'string'
        ? row.html
        : escapeHtml(String(row.value ?? '-'));
    const rowClasses = row.rowClasses ? ` ${row.rowClasses}` : '';
    const valueClasses = row.valueClasses ? ` ${row.valueClasses}` : '';
    return [
        `<div class="analytics-row${rowClasses}">`,
        `<div class="analytics-row-label">${escapeHtml(label)}</div>`,
        `<div class="analytics-row-value${valueClasses}">${valueHtml}</div>`,
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

function renderCaddiePlan(option, approachPlan, approachPreview, label, tone, selected = false) {
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
        renderCaddieRow('Approach outlook', formatApproachPreviewOutlook(approachPreview)),
        renderCaddieRow('Avg putts', `${option.avgPutts.toFixed(2)} / hole`)
    ].join('');
    const chainPreview = formatApproachChainPreview(option, approachPlan, approachPreview);

    return [
        `<button type="button" class="caddie-plan ${tone}${selected ? ' selected' : ''}" data-tee-plan-club="${escapeHtml(option.club)}">`,
        '<div class="caddie-plan-header">',
        `<div><div class="caddie-plan-label">${escapeHtml(label)}</div><div class="caddie-plan-club">${escapeHtml(option.club)}</div></div>`,
        `<div class="caddie-plan-badge">${selected ? 'Previewing' : escapeHtml(sampleBadge)}</div>`,
        '</div>',
        `<div class="caddie-row-list">${rowsHtml}</div>`,
        chainPreview ? `<div class="caddie-chain">${chainPreview}</div>` : '',
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

function formatWhatIfPlanner(currentHole, teeOptions, plannerModel) {
    if (!Array.isArray(teeOptions) || teeOptions.length === 0) {
        return '<div class="planner-note">No tee-shot history yet for this hole. Play a few rounds to unlock the planner.</div>';
    }

    const primary = choosePrimaryTeeOption(currentTeeOptions?.length ? currentTeeOptions : teeOptions);
    const selectedClub = plannerModel?.selectedOption?.club ?? plannerState.club ?? primary?.club ?? teeOptions[0]?.club ?? '';
    const aimOffset = Number.isFinite(plannerModel?.aimOffsetMeters) ? plannerModel.aimOffsetMeters : (Number(plannerState.aimOffsetMeters) || 0);
    const manualAim = !!plannerModel?.manualAim || (Array.isArray(plannerState.manualAimPoint) && plannerState.manualAimPoint.length >= 2);
    const clubOptions = teeOptions
        .map(option => {
            const label = option.plannerLabel
                ?? (option.dispersionSource === 'general'
                    ? `General shape n=${option.dispersionN ?? option.n ?? 0}`
                    : `${option.confidence ?? 'Hole'} | n=${option.n ?? 0}`);
            return `<option value="${escapeHtml(option.club)}"${normalize(option.club) === normalize(selectedClub) ? ' selected' : ''}>${escapeHtml(option.club)} (${escapeHtml(label)})</option>`;
        })
        .join('');

    const controls = [
        '<div class="planner-controls" data-planner-controls>',
        '<div class="planner-control-grid">',
        '<div class="planner-control">',
        '<label>Planner Club</label>',
        `<select data-planner-club>${clubOptions}</select>`,
        '</div>',
        '<div class="planner-control">',
        '<label>Aim Offset</label>',
        `<input type="range" min="-24" max="24" step="1" value="${escapeHtml(String(Math.round(aimOffset)))}" data-planner-aim />`,
        `<div class="planner-slider-meta"><span data-planner-aim-label>${formatAimOffsetLabel(aimOffset)}</span><span>Adjust target line left / right</span></div>`,
        '</div>',
        '</div>',
        `<div class="planner-note">${manualAim ? 'Custom target active. Click elsewhere on the hole to move it.' : 'Click on the hole to place a custom target.'}</div>`,
        manualAim ? '<button type="button" class="planner-reset-btn" data-planner-reset>Use suggested target</button>' : ''
    ];

    if (!plannerModel) {
        controls.push('<div class="planner-note">Planner is building from your tee-shot sample.</div>', '</div>');
        return controls.join('');
    }

    const modeledScoreText = Number.isFinite(plannerModel.expectedScore)
        ? `${plannerModel.expectedScore.toFixed(2)} (${formatSigned(plannerModel.toPar, 1)})`
        : 'n/a';
    const landingPattern = [
        Number.isFinite(plannerModel.simulation?.fairwayRate) ? `FIR ${(plannerModel.simulation.fairwayRate * 100).toFixed(0)}%` : null,
        Number.isFinite(plannerModel.simulation?.hazardRate) ? `Pen ${(plannerModel.simulation.hazardRate * 100).toFixed(0)}%` : null,
        Number.isFinite(plannerModel.simulation?.greenRate) ? `Green ${(plannerModel.simulation.greenRate * 100).toFixed(0)}%` : null
    ].filter(Boolean).join(' | ');
    const leaveText = Number.isFinite(plannerModel.syntheticOption?.leaveDistance)
        ? `${plannerModel.syntheticOption.leaveDistance.toFixed(0)} yds | ${plannerModel.leaveLie ?? 'rough'}`
        : 'Leave building';
    const approachText = plannerModel.approachPlan?.label ?? 'No approach model yet';
    const approachOutlook = formatApproachPreviewOutlook(plannerModel.approachPreview);
    const chainPreview = formatApproachChainPreview(plannerModel.syntheticOption, plannerModel.approachPlan, plannerModel.approachPreview);
    const comparison = formatPlannerComparison(plannerModel, primary);
    const dispersionText = plannerModel.teeStats?.source === 'general'
        ? `General club shape (n=${plannerModel.teeStats?.n ?? 0})`
        : `Hole-specific shape (n=${plannerModel.teeStats?.n ?? 0})`;

    controls.push(
        '<div class="planner-summary">',
        '<div class="planner-summary-card">',
        '<div class="planner-summary-title">Planner Preview</div>',
        '<div class="planner-row-list">',
        renderPlannerRow('Dispersion source', dispersionText),
        renderPlannerRow('Modeled score', modeledScoreText),
        renderPlannerRow('Landing pattern', landingPattern || 'Pattern building'),
        renderPlannerRow('Predicted leave', leaveText),
        renderPlannerRow('Smart next club', approachText),
        renderPlannerRow('Approach outlook', approachOutlook),
        '</div>',
        chainPreview ? `<div class="caddie-chain">${escapeHtml(chainPreview)}</div>` : '',
        '</div>',
        comparison ? renderPlannerCallout('Compare To Primary', comparison) : '',
        '<div class="planner-note">Planner uses modeled landing shape + geometry + smart distances. Treat it as a decision aid, not a guarantee.</div>',
        '</div>',
        '</div>'
    );

    return controls.join('');
}

function renderPlannerRow(label, value) {
    return [
        '<div class="planner-row">',
        `<div class="planner-row-label">${escapeHtml(label)}</div>`,
        `<div class="planner-row-value">${escapeHtml(String(value ?? '-'))}</div>`,
        '</div>'
    ].join('');
}

function renderPlannerCallout(title, body) {
    return [
        '<div class="planner-callout">',
        `<div class="planner-callout-title">${escapeHtml(title)}</div>`,
        `<div class="planner-callout-body">${escapeHtml(body)}</div>`,
        '</div>'
    ].join('');
}

function formatAimOffsetLabel(value) {
    const v = Number(value) || 0;
    if (Math.abs(v) < 0.5) return 'Center / default line';
    return v < 0 ? `${Math.abs(v).toFixed(0)}m left` : `${v.toFixed(0)}m right`;
}

function formatPlannerComparison(model, primaryOption) {
    if (!model || !primaryOption || !Number.isFinite(model.expectedScore)) return '';
    const primaryExpected = Number.isFinite(primaryOption.strategyExpectedScore)
        ? primaryOption.strategyExpectedScore
        : primaryOption.adjustedExpectedScore;
    const deltaScore = model.expectedScore - primaryExpected;
    const deltaFir = Number.isFinite(model.simulation?.fairwayRate) && Number.isFinite(primaryOption.firRateAdj)
        ? (model.simulation.fairwayRate - primaryOption.firRateAdj) * 100
        : null;
    const deltaPenalty = Number.isFinite(model.simulation?.hazardRate)
        ? (model.simulation.hazardRate - primaryOption.penaltyHoleRateAdj) * 100
        : null;
    const deltaLeave = Number.isFinite(model.syntheticOption?.leaveDistance) && Number.isFinite(primaryOption.leaveDistance)
        ? model.syntheticOption.leaveDistance - primaryOption.leaveDistance
        : null;

    const parts = [`${model.selectedOption.club} planner trades ${formatSigned(deltaScore, 2)} strokes versus ${primaryOption.club}.`];
    if (Number.isFinite(deltaFir)) parts.push(`FIR ${formatSigned(deltaFir, 0)} pts.`);
    if (Number.isFinite(deltaPenalty)) parts.push(`Penalty ${formatSigned(deltaPenalty, 0)} pts.`);
    if (Number.isFinite(deltaLeave)) parts.push(`Leave ${formatSigned(deltaLeave, 0)} yds.`);
    return parts.join(' ');
}

function normalizePlannerState(teeOptions, state, preferredClub = null) {
    const fallbackClub = preferredClub
        ?? choosePrimaryTeeOption(currentTeeOptions?.length ? currentTeeOptions : teeOptions)?.club
        ?? teeOptions?.[0]?.club
        ?? null;
    const club = resolveTeePlanOption(teeOptions, state?.club)?.club
        ?? resolveTeePlanOption(teeOptions, preferredClub)?.club
        ?? fallbackClub;
    return {
        club,
        aimOffsetMeters: clamp(Number(state?.aimOffsetMeters) || 0, -24, 24),
        manualAimPoint: Array.isArray(state?.manualAimPoint) && state.manualAimPoint.length >= 2
            ? [Number(state.manualAimPoint[0]), Number(state.manualAimPoint[1])]
            : null
    };
}

function buildWhatIfPlannerModel(referenceHole, samples, alignedGeometry, teeOptions, state) {
    if (!referenceHole || !Array.isArray(samples) || samples.length === 0 || !Array.isArray(teeOptions) || teeOptions.length === 0) {
        return null;
    }

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
    const primaryOption = choosePrimaryTeeOption(currentTeeOptions?.length ? currentTeeOptions : teeOptions);
    const selectedOption = resolveTeePlanOption(teeOptions, state?.club) ?? primaryOption ?? teeOptions[0];
    let teeStats = resolvePlannerTeeShapeStats(referenceHole, samples, selectedOption);
    if (!selectedOption || !teeStats) return null;
    if ((!teeStats || teeStats.n < 2) && samples.length > 0) {
        teeStats = buildTeeShotShapeStats(referenceHole, samples, null);
    }
    if (!teeStats) return null;

    const fairwayPolygons = asPolygonArrayFlexible(alignedGeometry?.fairway);
    const defaultAimPoint = findFairwayAimPoint(fairwayPolygons, tee, [ux, uz], [lx, lz], teeStats.meanAlong) ?? teeStats.centerlinePoint;
    const defaultAimLocal = defaultAimPoint ? projectWorldToLocal(tee, [ux, uz], [lx, lz], defaultAimPoint) : { along: teeStats.meanAlong, lateral: 0 };
    const manualAimPoint = Array.isArray(state?.manualAimPoint) && state.manualAimPoint.length >= 2
        ? [Number(state.manualAimPoint[0]), Number(state.manualAimPoint[1])]
        : null;
    const manualAimLocal = manualAimPoint && manualAimPoint.every(Number.isFinite)
        ? projectWorldToLocal(tee, [ux, uz], [lx, lz], manualAimPoint)
        : null;
    const baseAimAlong = manualAimLocal && Number.isFinite(manualAimLocal.along)
        ? clamp(manualAimLocal.along, 12, pinLen * 1.02)
        : (Number.isFinite(defaultAimLocal?.along) ? defaultAimLocal.along : teeStats.meanAlong);
    const baseAimLateral = manualAimLocal && Number.isFinite(manualAimLocal.lateral)
        ? manualAimLocal.lateral
        : (Number.isFinite(defaultAimLocal?.lateral) ? defaultAimLocal.lateral : 0);
    const aimOffsetMeters = clamp(Number(state?.aimOffsetMeters) || 0, -24, 24);
    const targetAimLateral = baseAimLateral + aimOffsetMeters;
    const aimPoint = projectLocalToWorld(tee, [ux, uz], [lx, lz], baseAimAlong, targetAimLateral);
    const meanLanding = projectLocalToWorld(tee, [ux, uz], [lx, lz], teeStats.meanAlong, targetAimLateral + teeStats.meanLateral);
    const simulation = simulatePlannerLandingStats(referenceHole, alignedGeometry, teeStats, targetAimLateral, [ux, uz], [lx, lz]);
    const leaveDistance = Number.isFinite(simulation?.avgLeaveDistance)
        ? simulation.avgLeaveDistance
        : distanceToPinFromPoint({ x: meanLanding[0], z: meanLanding[1] }, referenceHole.pin);
    const leaveLie = simulation?.dominantLie ?? inferApproachLie(meanLanding, alignedGeometry);
    const syntheticOption = {
        ...selectedOption,
        leaveDistance,
        meanEndPoint: meanLanding
    };
    const approachPlan = buildApproachPlanForSyntheticLeave(syntheticOption, leaveLie);
    const approachPreview = buildApproachPreviewForPlan(syntheticOption, approachPlan);
    const continuation = estimateContinuationForApproachPlan(approachPlan, leaveDistance);
    const modeledPenaltyLoad = Math.max(Number(simulation?.hazardRate) || 0, getModeledTeePenaltyLoad(selectedOption) * 0.5);
    const expectedScore = continuation
        ? 1 + modeledPenaltyLoad + continuation.strokesFromHere + (continuation.approachGapPenalty ?? 0)
        : null;
    const holePar = Number(referenceHole?.par) || 0;

    return {
        tee,
        pin,
        axis: { u: [ux, uz], l: [lx, lz] },
        selectedOption,
        primaryOption,
        teeStats,
        aimOffsetMeters,
        manualAim: !!manualAimLocal,
        aimPoint,
        meanLanding,
        targetAimLateral,
        leaveLie,
        simulation,
        syntheticOption,
        approachPlan,
        approachPreview,
        continuation,
        expectedScore,
        toPar: Number.isFinite(expectedScore) ? expectedScore - holePar : null
    };
}

function buildApproachPlanForSyntheticLeave(option, leaveLie) {
    if (!option || !Number.isFinite(option.leaveDistance)) return null;
    const lie = leaveLie ?? inferApproachLie(option.meanEndPoint, currentAnalysisGeometry);
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

function simulatePlannerLandingStats(referenceHole, alignedGeometry, teeStats, targetAimLateral, unitForward, unitLateral) {
    const tee = getHoleTee(referenceHole);
    if (!tee || !teeStats) return null;
    const pin = getHolePin(referenceHole);
    const rng = createSeededRng(`${referenceHole.holeNumber}:${teeStats.club}:${targetAimLateral.toFixed(2)}`);
    const counts = { fairway: 0, rough: 0, sand: 0, green: 0, hazard: 0 };
    const sampleCount = 180;
    let leaveSum = 0;
    let leaveCount = 0;

    for (let i = 0; i < sampleCount; i++) {
        const along = clamp(
            sampleNormal(rng, teeStats.meanAlong, Math.max(teeStats.stdAlong, 4)),
            Math.max(8, teeStats.meanAlong * 0.35),
            teeStats.meanAlong * 1.15
        );
        const lateral = sampleNormal(rng, targetAimLateral + teeStats.meanLateral, Math.max(teeStats.stdLateral, 3));
        const point = projectLocalToWorld(tee, unitForward, unitLateral, along, lateral);
        const lie = inferApproachLie(point, alignedGeometry);
        if (lie === 'fairway') counts.fairway++;
        else if (lie === 'sand') counts.sand++;
        else if (lie === 'green') counts.green++;
        else if (lie === 'hazard') counts.hazard++;
        else counts.rough++;

        if (lie !== 'hazard' && pin) {
            const leave = distanceToPinFromPoint({ x: point[0], z: point[1] }, { x: pin[0], z: pin[1] });
            if (Number.isFinite(leave)) {
                leaveSum += leave;
                leaveCount++;
            }
        }
    }

    const total = sampleCount || 1;
    const dominantLie = Object.entries(counts)
        .filter(([lie]) => lie !== 'hazard')
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'rough';

    return {
        fairwayRate: counts.fairway / total,
        hazardRate: counts.hazard / total,
        greenRate: counts.green / total,
        roughRate: counts.rough / total,
        sandRate: counts.sand / total,
        avgLeaveDistance: leaveCount > 0 ? leaveSum / leaveCount : null,
        dominantLie
    };
}

function buildPlannerOverlay(scene, model) {
    if (!scene || !model?.tee || !model?.aimPoint || !model?.meanLanding) return;

    const group = new THREE.Group();
    group.userData.tag = 'golf-planner-group';

    addDashedGroundLine(group, model.tee, model.aimPoint, 0xffe082, 0.92, 1.1, 4);
    addGroundRing(group, model.aimPoint, 1.6, 0xffe082, 0.76, 0.11);
    addGroundLine(group, model.aimPoint, model.meanLanding, 0xffb74d, 0.95, 0.13);
    addGroundArrowHead(group, model.aimPoint, model.meanLanding, 0xffb74d);
    addGroundRing(group, model.meanLanding, 1.35, 0xffb74d, 0.78, 0.12);
    addGroundDisc(group, model.meanLanding, 1.1, 0xffb74d, 0.16, 0.085);

    const dispersion = buildDispersionEllipsePoints(
        model.tee,
        model.axis.u,
        model.axis.l,
        model.teeStats.meanAlong,
        model.targetAimLateral + model.teeStats.meanLateral,
        model.teeStats.stdAlong,
        model.teeStats.stdLateral
    );
    if (dispersion.length >= 3) {
        const pts = dispersion.map(p => new THREE.Vector3(p[0], 0.11, p[1]));
        pts.push(new THREE.Vector3(dispersion[0][0], 0.11, dispersion[0][1]));
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.9 });
        group.add(new THREE.Line(geom, mat));
    }

    scene.add(group);
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
        meanEnd: projectLocalToWorld(tee, [ux, uz], [lx, lz], meanAlong, meanLateral),
        source: 'hole'
    };
}

function buildGlobalTeeDispersionIndex(rounds) {
    const rowsByClub = new Map();

    for (const round of rounds ?? []) {
        for (const holeRaw of round?.holes ?? []) {
            const geometryStatus = inspectHoleGeometry(round, holeRaw);
            const hole = maybeMirrorHoleShots(holeRaw, geometryStatus.holeGeometry);
            const tee = getHoleTee(hole);
            const pin = getHolePin(hole);
            if (!tee || !pin) continue;

            const vx = pin[0] - tee[0];
            const vz = pin[1] - tee[1];
            const pinLen = Math.hypot(vx, vz);
            if (pinLen < 1e-6) continue;
            const ux = vx / pinLen;
            const uz = vz / pinLen;
            const lx = -uz;
            const lz = ux;

            const teeShot = (hole.shots ?? []).find(s => Number(s.shotNumber) === 1 && Number(s.clubId) !== 13 && !isPenaltyShot(s));
            if (!teeShot) continue;

            const club = resolveClubName(teeShot);
            const key = normalize(club);
            if (!key) continue;
            const ex = Number(teeShot.end?.x);
            const ez = Number(teeShot.end?.z);
            if (!Number.isFinite(ex) || !Number.isFinite(ez)) continue;

            const rx = ex - tee[0];
            const rz = ez - tee[1];
            const along = rx * ux + rz * uz;
            const lateral = rx * lx + rz * lz;
            const row = rowsByClub.get(key) ?? {
                club,
                alongVals: [],
                lateralVals: [],
                teeDistances: [],
                holes: 0,
                penaltyHoles: 0,
                penaltyShots: 0
            };

            row.alongVals.push(along);
            row.lateralVals.push(lateral);
            const teeDistance = Number(teeShot.distance);
            if (Number.isFinite(teeDistance)) {
                row.teeDistances.push(teeDistance);
            }
            row.holes++;
            const penaltyCount = countPenalties(hole.shots ?? []);
            if (penaltyCount > 0) row.penaltyHoles++;
            row.penaltyShots += penaltyCount;
            rowsByClub.set(key, row);
        }
    }

    const summary = new Map();
    for (const [key, row] of rowsByClub.entries()) {
        if (row.alongVals.length === 0) continue;
        const meanAlong = avg(row.alongVals);
        const meanLateral = avg(row.lateralVals);
        summary.set(key, {
            club: row.club,
            n: row.alongVals.length,
            meanAlong,
            meanLateral,
            stdAlong: stddev(row.alongVals, meanAlong),
            stdLateral: stddev(row.lateralVals, meanLateral),
            avgTeeDistance: row.teeDistances.length > 0 ? avg(row.teeDistances) : null,
            penaltyHoleRate: row.holes > 0 ? row.penaltyHoles / row.holes : 0,
            penaltyHoleRateAdj: row.holes > 0 ? (row.penaltyHoles + 1) / (row.holes + 2) : 0.25,
            penaltyShotRate: row.holes > 0 ? row.penaltyShots / row.holes : 0,
            source: 'general'
        });
    }
    return summary;
}

function buildReferenceTeeShapeStats(referenceHole, aggregate, clubOverride = null, source = null) {
    if (!aggregate) return null;
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
    const meanAlong = Number(aggregate.meanAlong);
    const meanLateral = Number(aggregate.meanLateral);
    if (!Number.isFinite(meanAlong) || !Number.isFinite(meanLateral)) return null;

    return {
        club: clubOverride ?? aggregate.club ?? null,
        n: Number(aggregate.n) || 0,
        meanAlong,
        meanLateral,
        stdAlong: Math.max(4, Number(aggregate.stdAlong) || 0),
        stdLateral: Math.max(3, Number(aggregate.stdLateral) || 0),
        centerlinePoint: projectLocalToWorld(tee, [ux, uz], [lx, lz], meanAlong, 0),
        meanEnd: projectLocalToWorld(tee, [ux, uz], [lx, lz], meanAlong, meanLateral),
        source: source ?? aggregate.source ?? 'general'
    };
}

function resolvePlannerTeeShapeStats(referenceHole, samples, option) {
    if (!referenceHole || !option) return null;
    if (option.plannerDispersion) {
        return buildReferenceTeeShapeStats(referenceHole, option.plannerDispersion, option.club, option.dispersionSource);
    }
    const holeStats = buildTeeShotShapeStats(referenceHole, samples, option.club);
    if (holeStats) return holeStats;
    const globalStats = teeDispersionIndexByClub.get(normalize(option.club));
    if (!globalStats) return null;
    return buildReferenceTeeShapeStats(referenceHole, globalStats, option.club, 'general');
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

function projectWorldToLocal(origin, unitForward, unitLateral, point) {
    if (!Array.isArray(origin) || !Array.isArray(point)) {
        return { along: 0, lateral: 0 };
    }
    const rx = Number(point[0]) - Number(origin[0]);
    const rz = Number(point[1]) - Number(origin[1]);
    return {
        along: rx * unitForward[0] + rz * unitForward[1],
        lateral: rx * unitLateral[0] + rz * unitLateral[1]
    };
}

function createSeededRng(seedText) {
    let h = 1779033703 ^ String(seedText ?? '').length;
    for (let i = 0; i < String(seedText ?? '').length; i++) {
        h = Math.imul(h ^ String(seedText).charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function next() {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
}

function sampleNormal(rng, mean = 0, std = 1) {
    const raw1 = typeof rng === 'function' ? rng() : Math.random();
    const raw2 = typeof rng === 'function' ? rng() : Math.random();
    const u1 = Math.max(1e-9, Number.isFinite(raw1) ? raw1 : Math.random());
    const u2 = Math.max(1e-9, Number.isFinite(raw2) ? raw2 : Math.random());
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    return mean + z0 * std;
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

function buildHoleAnalyticsSummary(currentHole, samples, alignedGeometry = null, precomputed = {}) {
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
    const strokesDashboard = buildStrokesDashboard(currentHole, samples, alignedGeometry);
    const roundStrokesDashboard = precomputed.roundStrokesDashboard
        ?? getRoundStrokesDashboard(vizData?.rounds?.[currentRoundIdx] ?? null);
    const courseStrokesDashboard = precomputed.courseStrokesDashboard
        ?? getCourseStrokesDashboard(vizData?.rounds?.[currentRoundIdx] ?? null, spreadFilters);
    const teeOptions = enrichTeeOptionsForDecision(
        buildTeeClubDecisionStats(samples, fairwayPolygons),
        alignedGeometry
    );
    const primaryTeeOption = choosePrimaryTeeOption(teeOptions);
    const conservativeTeeOption = chooseConservativeTeeOption(teeOptions, primaryTeeOption);
    const teeRecommendation = buildBestTeeRecommendation(samples, fairwayPolygons, alignedGeometry);
    const aimNote = buildAimNote(lateral);
    const currentToParLabel = formatToPar(Number(currentHole.score) - Number(currentHole.par));
    const approachWindows = buildApproachWindowsSummary(samples, alignedGeometry);
    const teeTrustScores = buildTeeTrustScores(currentHole, samples, teeOptions, primaryTeeOption, conservativeTeeOption);
    const puttingPressure = buildPuttingPressureMatrix(samples);
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
        avgFirstPutt: firstPuttDists.length ? `${avg(firstPuttDists).toFixed(1)} ft` : '-',
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
        strokesDashboard,
        roundStrokesDashboard,
        courseStrokesDashboard,
        teeOptions,
        primaryTeeOption,
        conservativeTeeOption,
        teeTrustScores,
        teeRecommendation,
        aimNote,
        approachWindows,
        puttingPressure,
        currentToParLabel,
        confidence,
        practiceFocus,
        baselineInfo: getCurrentBaselineInfo()
    };
}

function buildTeeTrustScores(referenceHole, samples, teeOptions, primaryTeeOption = null, conservativeTeeOption = null) {
    const options = (teeOptions ?? []).filter(option => !option?.plannerOnly);
    if (options.length === 0) return [];

    const expectedScores = options
        .map(option => getTeeOptionExpectedScore(option))
        .filter(Number.isFinite);
    const bestExpected = expectedScores.length > 0 ? Math.min(...expectedScores) : NaN;
    const worstExpected = expectedScores.length > 0 ? Math.max(...expectedScores) : NaN;

    return options
        .map(option => {
            const shape = resolvePlannerTeeShapeStats(referenceHole, samples, option);
            const dispersionMeters = Number.isFinite(shape?.stdLateral) ? Number(shape.stdLateral) : null;
            const scoreFactor = computeRelativeExpectedScoreFactor(getTeeOptionExpectedScore(option), bestExpected, worstExpected);
            const firFactor = Number.isFinite(option?.firRateAdj) ? clamp(option.firRateAdj, 0, 1) : null;
            const penaltyFactor = Number.isFinite(option?.penaltyHoleRateAdj) ? clamp(1 - option.penaltyHoleRateAdj, 0, 1) : null;
            const dispersionFactor = Number.isFinite(dispersionMeters)
                ? clamp(1 - ((dispersionMeters - 4) / 18), 0, 1)
                : null;
            const sampleFactor = clamp((Number(option?.n) || 0) / 8, 0, 1);
            const trustScore = Math.round(computeWeightedComponentScore([
                { weight: 0.30, value: scoreFactor },
                { weight: 0.22, value: firFactor },
                { weight: 0.24, value: penaltyFactor },
                { weight: 0.16, value: dispersionFactor },
                { weight: 0.08, value: sampleFactor }
            ]) * 100);
            const roleLabel = normalize(primaryTeeOption?.club) === normalize(option?.club)
                ? 'Primary plan'
                : normalize(conservativeTeeOption?.club) === normalize(option?.club)
                    ? 'Safety fallback'
                    : 'Alternate line';

            return {
                club: option?.club ?? 'Unknown club',
                n: Number(option?.n) || 0,
                trustScore,
                trustLabel: describeTrustLabel(trustScore),
                roleLabel,
                expectedScore: getTeeOptionExpectedScore(option),
                firPct: Number.isFinite(option?.firRateAdj) ? option.firRateAdj * 100 : null,
                penaltyPct: Number.isFinite(option?.penaltyHoleRateAdj) ? option.penaltyHoleRateAdj * 100 : null,
                dispersionMeters,
                note: describeTeeTrustNote({ scoreFactor, firFactor, penaltyFactor, dispersionFactor, sampleFactor })
            };
        })
        .sort((a, b) => {
            if (b.trustScore !== a.trustScore) return b.trustScore - a.trustScore;
            const expectedA = Number.isFinite(a.expectedScore) ? a.expectedScore : Number.POSITIVE_INFINITY;
            const expectedB = Number.isFinite(b.expectedScore) ? b.expectedScore : Number.POSITIVE_INFINITY;
            if (expectedA !== expectedB) return expectedA - expectedB;
            return b.n - a.n;
        });
}

function getTeeOptionExpectedScore(option) {
    if (Number.isFinite(option?.strategyExpectedScore)) return option.strategyExpectedScore;
    if (Number.isFinite(option?.adjustedExpectedScore)) return option.adjustedExpectedScore;
    return NaN;
}

function computeRelativeExpectedScoreFactor(value, best, worst) {
    if (!Number.isFinite(value)) return 0.5;
    if (!Number.isFinite(best) || !Number.isFinite(worst) || Math.abs(worst - best) < 0.08) {
        return 0.65;
    }
    return clamp(1 - ((value - best) / (worst - best)), 0, 1);
}

function computeWeightedComponentScore(components) {
    const usable = (components ?? []).filter(component => Number.isFinite(component?.value) && Number.isFinite(component?.weight) && component.weight > 0);
    if (usable.length === 0) return 0.5;
    const totalWeight = usable.reduce((sum, component) => sum + component.weight, 0);
    if (totalWeight <= 0) return 0.5;
    return usable.reduce((sum, component) => sum + component.value * component.weight, 0) / totalWeight;
}

function describeTrustLabel(trustScore) {
    if (!Number.isFinite(trustScore)) return 'Building';
    if (trustScore >= 78) return 'High trust';
    if (trustScore >= 64) return 'Playable';
    if (trustScore >= 50) return 'Situational';
    return 'Volatile';
}

function describeTeeTrustNote({ scoreFactor, firFactor, penaltyFactor, dispersionFactor, sampleFactor }) {
    const strengths = [];
    const concerns = [];

    if (scoreFactor >= 0.72) strengths.push('best scoring trend');
    if (firFactor !== null && firFactor >= 0.65) strengths.push('fairway control');
    if (penaltyFactor !== null && penaltyFactor >= 0.72) strengths.push('lower penalty load');
    if (dispersionFactor !== null && dispersionFactor >= 0.68) strengths.push('tight start-line pattern');
    if (sampleFactor >= 0.75) strengths.push('stable sample');

    if (firFactor !== null && firFactor < 0.45) concerns.push('fairway misses');
    if (penaltyFactor !== null && penaltyFactor < 0.58) concerns.push('penalty exposure');
    if (dispersionFactor !== null && dispersionFactor < 0.45) concerns.push('wide miss pattern');
    if (sampleFactor < 0.35) concerns.push('small sample');
    if (scoreFactor < 0.38) concerns.push('weaker scoring history');

    const positive = strengths[0] ? `Best signal: ${strengths[0]}.` : 'Signal still building.';
    const caution = concerns[0] ? ` Watch ${concerns[0]}.` : '';
    return `${positive}${caution}`;
}

function buildPuttingPressureMatrix(samples) {
    const buckets = [
        { key: 'short', label: '0-6 ft', min: 0, max: 6 },
        { key: 'makeable', label: '6-15 ft', min: 6, max: 15 },
        { key: 'lag', label: '15-30 ft', min: 15, max: 30 },
        { key: 'long', label: '30-60 ft', min: 30, max: 60 },
        { key: 'extra', label: '60+ ft', min: 60, max: Number.POSITIVE_INFINITY }
    ];
    const rowsByKey = new Map(buckets.map(bucket => [bucket.key, {
        ...bucket,
        count: 0,
        sumPutts: 0,
        onePutt: 0,
        threePutt: 0
    }]));

    for (const hole of samples ?? []) {
        const putts = [...(hole?.shots ?? [])]
            .filter(shot => Number(shot?.clubId) === 13)
            .sort((a, b) => Number(a?.shotNumber) - Number(b?.shotNumber));
        if (putts.length === 0) continue;
        const firstDistance = Number(putts[0]?.distance);
        if (!Number.isFinite(firstDistance)) continue;
        const bucket = buckets.find(entry => firstDistance >= entry.min && firstDistance < entry.max) ?? buckets[buckets.length - 1];
        const row = rowsByKey.get(bucket.key);
        if (!row) continue;
        row.count++;
        row.sumPutts += putts.length;
        if (putts.length === 1) row.onePutt++;
        if (putts.length >= 3) row.threePutt++;
    }

    const rows = buckets.map(bucket => {
        const row = rowsByKey.get(bucket.key);
        const avgPutts = row.count > 0 ? row.sumPutts / row.count : null;
        const onePuttRate = row.count > 0 ? row.onePutt / row.count : null;
        const threePuttRate = row.count > 0 ? row.threePutt / row.count : null;
        const tone = describePuttingPressureTone(bucket, avgPutts, onePuttRate, threePuttRate, row.count);
        const read = describePuttingPressureRead(bucket, avgPutts, onePuttRate, threePuttRate, row.count);
        return {
            key: bucket.key,
            label: bucket.label,
            count: row.count,
            avgPutts,
            onePuttRate,
            threePuttRate,
            tone,
            read
        };
    });

    return {
        rows,
        focus: buildPuttingPressureFocus(rows)
    };
}

function buildApproachWindowsSummary(samples, alignedGeometry) {
    const buckets = [
        { key: 'wedge', label: '0-50 yds', min: 0, max: 50 },
        { key: 'short', label: '50-90 yds', min: 50, max: 90 },
        { key: 'mid', label: '90-130 yds', min: 90, max: 130 },
        { key: 'long', label: '130-170 yds', min: 130, max: 170 },
        { key: 'extra', label: '170+ yds', min: 170, max: Number.POSITIVE_INFINITY }
    ];
    const rowsByKey = new Map(buckets.map(bucket => [bucket.key, {
        ...bucket,
        count: 0,
        sumFinish: 0,
        greenHits: 0,
        sumEndDistance: 0,
        endDistanceCount: 0,
        lieCounts: new Map(),
        clubCounts: new Map()
    }]));

    for (const hole of samples ?? []) {
        const ordered = [...(hole?.shots ?? [])]
            .filter(shot => Number.isFinite(Number(shot?.shotNumber)))
            .sort((a, b) => Number(a.shotNumber) - Number(b.shotNumber));
        const holeScore = Number(hole?.score);
        if (!Number.isFinite(holeScore)) continue;

        for (let idx = 0; idx < ordered.length; idx++) {
            const shot = ordered[idx];
            const clubId = Number(shot?.clubId);
            const shotNumber = Number(shot?.shotNumber);
            if (!Number.isFinite(clubId) || !Number.isFinite(shotNumber)) continue;
            if (shotNumber <= 1 || clubId === 13 || isPenaltyShot(shot)) continue;

            const startDistance = distanceToPinFromPoint(shot?.start, hole?.pin);
            if (!Number.isFinite(startDistance)) continue;

            const bucket = buckets.find(entry => startDistance >= entry.min && startDistance < entry.max) ?? buckets[buckets.length - 1];
            const row = rowsByKey.get(bucket.key);
            if (!row) continue;

            const lie = alignedGeometry
                ? inferApproachLie([Number(shot?.start?.x), Number(shot?.start?.z)], alignedGeometry)
                : null;
            const endLie = alignedGeometry
                ? inferApproachLie([Number(shot?.end?.x), Number(shot?.end?.z)], alignedGeometry)
                : null;
            const nextShot = ordered[idx + 1] ?? null;
            const endedOnGreen = endLie === 'green' || Number(nextShot?.clubId) === 13;
            const avgFinish = holeScore - shotNumber + 1;
            const endDistance = distanceToPinFromPoint(shot?.end, hole?.pin);
            const club = resolveClubName(shot);

            row.count++;
            row.sumFinish += avgFinish;
            if (endedOnGreen) row.greenHits++;
            if (Number.isFinite(endDistance)) {
                row.sumEndDistance += endDistance;
                row.endDistanceCount++;
            }
            if (lie) {
                row.lieCounts.set(lie, (row.lieCounts.get(lie) ?? 0) + 1);
            }
            if (club) {
                row.clubCounts.set(club, (row.clubCounts.get(club) ?? 0) + 1);
            }
        }
    }

    const rows = buckets
        .map(bucket => {
            const row = rowsByKey.get(bucket.key);
            if (!row || row.count === 0) return null;
            const avgFinish = row.sumFinish / row.count;
            const girRate = row.greenHits / row.count;
            const avgEndDistance = row.endDistanceCount > 0 ? row.sumEndDistance / row.endDistanceCount : null;
            const topLie = topMapEntry(row.lieCounts);
            const topClub = topMapEntry(row.clubCounts);
            const tone = describeApproachWindowTone(bucket, avgFinish, girRate, avgEndDistance, row.count);
            const read = describeApproachWindowRead(bucket, avgFinish, girRate, avgEndDistance, row.count);

            return {
                key: bucket.key,
                label: bucket.label,
                count: row.count,
                avgFinish,
                girRate,
                avgEndDistance,
                lieLabel: topLie ? `${topLie[0]} (${topLie[1]}/${row.count})` : 'mixed',
                clubLabel: topClub ? `${topClub[0]} (${topClub[1]})` : 'mixed',
                tone,
                read
            };
        })
        .filter(Boolean);

    return {
        rows,
        focus: buildApproachWindowsFocus(rows)
    };
}

function topMapEntry(map) {
    if (!(map instanceof Map) || map.size === 0) return null;
    return [...map.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return String(a[0]).localeCompare(String(b[0]));
    })[0] ?? null;
}

function describeApproachWindowTone(bucket, avgFinish, girRate, avgEndDistance, count) {
    if (!count) return 'empty';
    if (Number.isFinite(girRate) && girRate >= 0.45 && Number.isFinite(avgFinish) && avgFinish <= 2.6) return 'good';
    if (Number.isFinite(avgFinish) && avgFinish >= 3.2) return 'risk';
    if (Number.isFinite(girRate) && girRate <= 0.15 && count >= 3) return 'attention';
    if (Number.isFinite(avgEndDistance) && avgEndDistance <= 8) return 'good';
    return 'neutral';
}

function describeApproachWindowRead(bucket, avgFinish, girRate, avgEndDistance, count) {
    if (!count) return 'No samples';
    if (bucket.max <= 50 && Number.isFinite(avgFinish) && avgFinish >= 2.9) return 'Wedge scoring leak';
    if (Number.isFinite(girRate) && girRate >= 0.45) return 'Attack window';
    if (Number.isFinite(avgEndDistance) && avgEndDistance <= 8) return 'Strong proximity';
    if (Number.isFinite(avgFinish) && avgFinish >= 3.2) return 'Costly leave';
    if (Number.isFinite(girRate) && girRate <= 0.15) return 'Low green pressure';
    return 'Neutral';
}

function buildApproachWindowsFocus(rows) {
    const populated = (rows ?? []).filter(row => row.count > 0);
    if (populated.length === 0) {
        return 'Not enough approach samples on this hole yet to separate good windows from costly ones.';
    }

    const bestWindow = populated
        .filter(row => row.count >= 2)
        .slice()
        .sort((a, b) => {
            const scoreA = (a.avgFinish ?? 99) - (a.girRate ?? 0) * 0.45;
            const scoreB = (b.avgFinish ?? 99) - (b.girRate ?? 0) * 0.45;
            if (scoreA !== scoreB) return scoreA - scoreB;
            return b.count - a.count;
        })[0] ?? null;
    const dangerWindow = populated
        .filter(row => row.count >= 2)
        .slice()
        .sort((a, b) => {
            const scoreA = (a.avgFinish ?? 0) + (1 - (a.girRate ?? 0)) * 0.35;
            const scoreB = (b.avgFinish ?? 0) + (1 - (b.girRate ?? 0)) * 0.35;
            if (scoreB !== scoreA) return scoreB - scoreA;
            return b.count - a.count;
        })[0] ?? null;

    if (bestWindow && dangerWindow && bestWindow.key !== dangerWindow.key) {
        return `${bestWindow.label} is your best scoring approach window on this hole, while ${dangerWindow.label} is leaking the most.`;
    }
    if (bestWindow) {
        return `${bestWindow.label} is currently the cleanest scoring window on this hole.`;
    }
    return 'Approach scoring is still flattening out across windows. Keep logging rounds for a clearer signal.';
}

function describePuttingPressureTone(bucket, avgPutts, onePuttRate, threePuttRate, count) {
    if (!count) return 'empty';
    if (bucket.max <= 15 && Number.isFinite(onePuttRate) && onePuttRate >= 0.6) return 'good';
    if (Number.isFinite(threePuttRate) && threePuttRate >= 0.25) return 'risk';
    if (Number.isFinite(avgPutts) && avgPutts >= 2.45) return 'risk';
    if (bucket.max <= 15 && Number.isFinite(onePuttRate) && onePuttRate < 0.35) return 'attention';
    return 'neutral';
}

function describePuttingPressureRead(bucket, avgPutts, onePuttRate, threePuttRate, count) {
    if (!count) return 'No reads yet';
    if (bucket.max <= 6 && Number.isFinite(onePuttRate)) {
        return onePuttRate >= 0.75 ? 'Conversion zone' : 'Short-putt leak';
    }
    if (bucket.max <= 15 && Number.isFinite(onePuttRate)) {
        return onePuttRate >= 0.4 ? 'Scoring chance' : 'Opportunity cost';
    }
    if (Number.isFinite(threePuttRate) && threePuttRate >= 0.25) {
        return '3-putt pressure';
    }
    if (Number.isFinite(avgPutts) && avgPutts <= 2.1) {
        return 'Stable lag band';
    }
    return 'Speed-control band';
}

function buildPuttingPressureFocus(rows) {
    const populated = (rows ?? []).filter(row => row.count > 0);
    if (populated.length === 0) {
        return 'Track more first-putt starts on this hole to see where the pressure really lives.';
    }

    const biggestRisk = populated
        .filter(row => row.count >= 2 && Number.isFinite(row.threePuttRate))
        .slice()
        .sort((a, b) => {
            const riskA = (a.threePuttRate * 0.65) + ((a.avgPutts ?? 2) - 2) * 0.35;
            const riskB = (b.threePuttRate * 0.65) + ((b.avgPutts ?? 2) - 2) * 0.35;
            if (riskB !== riskA) return riskB - riskA;
            return b.count - a.count;
        })[0] ?? null;
    if (biggestRisk && biggestRisk.threePuttRate >= 0.18) {
        return `${biggestRisk.label} is the main stress band: ${biggestRisk.avgPutts?.toFixed(2) ?? 'n/a'} putts on average and ${(biggestRisk.threePuttRate * 100).toFixed(0)}% three-putts. Treat that range as pure speed control.`;
    }

    const missedChance = populated
        .filter(row => row.count >= 2 && row.label !== '60+ ft' && Number.isFinite(row.onePuttRate))
        .slice()
        .sort((a, b) => a.onePuttRate - b.onePuttRate)[0] ?? null;
    if (missedChance && missedChance.onePuttRate < 0.35) {
        return `${missedChance.label} is where scores can fall fast: only ${(missedChance.onePuttRate * 100).toFixed(0)}% are cleaned up in one. That band is worth practice reps.`;
    }

    const safestBand = populated
        .filter(row => Number.isFinite(row.onePuttRate))
        .slice()
        .sort((a, b) => b.onePuttRate - a.onePuttRate)[0] ?? null;
    if (safestBand) {
        return `${safestBand.label} is currently your best scoring band on this hole with ${(safestBand.onePuttRate * 100).toFixed(0)}% one-putts.`;
    }

    return 'Putting pattern is fairly neutral here. Keep chasing makeable first-putt looks and protect against long-range 3-putts.';
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

function buildPlannerClubOptions(referenceHole, samples, holeTeeOptions) {
    const validScores = (samples ?? [])
        .map(h => Number(h?.score))
        .filter(Number.isFinite);
    const holePar = avg((samples ?? []).map(h => Number(h?.par))) || Number(referenceHole?.par) || 0;
    const holeAvgScore = validScores.length > 0 ? avg(validScores) : holePar + 1;
    const holeAvgPutts = avg((samples ?? []).map(h => countPutts(h?.shots ?? []))) || null;
    const merged = new Map();

    for (const option of holeTeeOptions ?? []) {
        const key = normalize(option?.club);
        if (!key) continue;
        const globalDispersion = teeDispersionIndexByClub.get(key) ?? null;
        merged.set(key, {
            ...option,
            dispersionSource: globalDispersion ? 'general' : 'hole',
            dispersionN: globalDispersion?.n ?? option.n,
            plannerDispersion: globalDispersion,
            plannerLabel: globalDispersion
                ? `General shape n=${globalDispersion.n}${option.n > 0 ? ` | hole n=${option.n}` : ''}`
                : `Hole shape n=${option.n}`
        });
    }

    for (const [key, dispersion] of teeDispersionIndexByClub.entries()) {
        if (merged.has(key)) continue;
        const noteParts = ['general tee shape'];
        if (Number.isFinite(dispersion.avgTeeDistance)) {
            noteParts.push(`lands ~${dispersion.avgTeeDistance.toFixed(0)} yds`);
        }
        merged.set(key, {
            club: dispersion.club,
            n: 0,
            avgScore: holeAvgScore,
            avgToPar: holeAvgScore - holePar,
            adjustedExpectedScore: holeAvgScore,
            adjustedToPar: holeAvgScore - holePar,
            firRate: null,
            firRateAdj: null,
            penaltyHoleRate: dispersion.penaltyHoleRate,
            penaltyHoleRateAdj: dispersion.penaltyHoleRateAdj,
            penaltyShotRate: dispersion.penaltyShotRate,
            avgPutts: holeAvgPutts,
            avgTeeDistance: dispersion.avgTeeDistance,
            leaveDistance: null,
            meanEndPoint: null,
            historicalNextClub: null,
            historicalNextClubShare: 0,
            avgNextShotDistance: null,
            primaryScore: holeAvgScore + dispersion.penaltyHoleRateAdj * 0.18,
            conservativeScore: holeAvgScore + dispersion.penaltyHoleRateAdj * 0.42 + 0.08,
            confidence: formatConfidenceBadge(dispersion.n, { high: 12, medium: 5 }),
            note: noteParts.join(' | '),
            dispersionSource: 'general',
            dispersionN: dispersion.n,
            plannerDispersion: dispersion,
            plannerLabel: `General shape n=${dispersion.n}`,
            plannerOnly: true
        });
    }

    return [...merged.values()].sort((a, b) => {
        const distA = Number.isFinite(a?.avgTeeDistance) ? Number(a.avgTeeDistance) : -1;
        const distB = Number.isFinite(b?.avgTeeDistance) ? Number(b.avgTeeDistance) : -1;
        if (distA !== distB) return distB - distA;
        return String(a?.club ?? '').localeCompare(String(b?.club ?? ''));
    });
}

function enrichTeeOptionsForDecision(options, alignedGeometry = null) {
    return (options ?? []).map(option => {
        const approachPlan = buildApproachPlanForOption(option, alignedGeometry);
        const approachPreview = buildApproachPreviewForPlan(option, approachPlan);
        const continuation = estimateContinuationForApproachPlan(approachPlan, option.leaveDistance);
        const modeledPenaltyLoad = getModeledTeePenaltyLoad(option);
        const stateExpectedScore = continuation
            ? 1 + modeledPenaltyLoad + continuation.strokesFromHere
            : option.adjustedExpectedScore + modeledPenaltyLoad * 0.25;
        const modeledExpectedScore = continuation
            ? stateExpectedScore + (continuation.approachGapPenalty ?? 0)
            : stateExpectedScore;
        const observedWeight = getObservedWeightForTeeOption(option.n);
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
            approachPreview,
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
        const margin = getTeeOptionDecisionMargin(a, b);
        if (Math.abs(scoreA - scoreB) > margin) return scoreA - scoreB;
        const expA = Number.isFinite(a.strategyExpectedScore) ? a.strategyExpectedScore : a.adjustedExpectedScore;
        const expB = Number.isFinite(b.strategyExpectedScore) ? b.strategyExpectedScore : b.adjustedExpectedScore;
        if (Math.abs(expA - expB) > margin * 0.7) return expA - expB;
        const leaveA = Number.isFinite(a.leaveDistance) ? a.leaveDistance : Number.POSITIVE_INFINITY;
        const leaveB = Number.isFinite(b.leaveDistance) ? b.leaveDistance : Number.POSITIVE_INFINITY;
        if (Math.abs(leaveA - leaveB) > 12) return leaveA - leaveB;
        const firA = a.firRateAdj ?? -1;
        const firB = b.firRateAdj ?? -1;
        if (Math.abs(firA - firB) > 0.08) return firB - firA;
        if (Math.abs(a.penaltyHoleRateAdj - b.penaltyHoleRateAdj) > 0.08) return a.penaltyHoleRateAdj - b.penaltyHoleRateAdj;
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

function buildApproachPreviewForPlan(option, plan) {
    if (!option || !plan || !Number.isFinite(option.leaveDistance)) return null;
    const targetDistance = option.leaveDistance;
    const lie = plan.lie ?? null;
    const stateSummary = summarizeApproachPreviewRows(
        shotOutcomeIndexByLie.get(lie) ?? [],
        targetDistance,
        lie
    );
    const clubSummary = Number.isFinite(Number(plan.clubId))
        ? summarizeApproachPreviewRows(
            shotOutcomeIndexByClubId.get(Number(plan.clubId)) ?? [],
            targetDistance,
            lie
        )
        : null;
    const summary = blendApproachPreviewSummaries(stateSummary, clubSummary);
    if (!summary) return null;

    const smartDistance = Number(plan.distance);
    const gap = Number.isFinite(smartDistance) ? smartDistance - targetDistance : null;
    return {
        ...summary,
        gap,
        clubName: plan.clubName ?? null,
        lie
    };
}

function summarizeApproachPreviewRows(rows, targetDistanceYards, lie = null) {
    if (!Array.isArray(rows) || rows.length === 0 || !Number.isFinite(targetDistanceYards)) return null;
    const normalizedLie = normalize(lie);
    const lieRows = normalizedLie
        ? rows.filter(row => normalize(row?.lie) === normalizedLie)
        : rows;
    const poolRows = lieRows.length >= 8 ? lieRows : rows;
    const nearest = poolRows
        .map(row => ({
            ...row,
            diff: Math.abs(Number(row?.startDistance) - targetDistanceYards)
        }))
        .filter(row => Number.isFinite(row.diff))
        .sort((a, b) => a.diff - b.diff)
        .slice(0, Math.min(36, poolRows.length));
    if (nearest.length === 0) return null;

    const closeBand = nearest.some(r => r.diff <= 15) ? 20 : nearest.some(r => r.diff <= 30) ? 35 : 55;
    const filtered = nearest.filter(r => r.diff <= closeBand);
    const use = filtered.length >= 6 ? filtered : nearest.slice(0, Math.min(16, nearest.length));

    let girWeighted = 0;
    let weightSum = 0;
    let puttsIfGreenWeighted = 0;
    let puttsIfGreenWeights = 0;
    let endDistanceWeighted = 0;
    let endDistanceWeights = 0;

    for (const row of use) {
        const weight = 1 / Math.max(4, row.diff + 4);
        const gir = row.endedOnGreen ? 1 : 0;
        girWeighted += gir * weight;
        weightSum += weight;

        if (row.endedOnGreen && Number.isFinite(Number(row.puttsAfter))) {
            puttsIfGreenWeighted += Number(row.puttsAfter) * weight;
            puttsIfGreenWeights += weight;
        }
        if (Number.isFinite(Number(row.endDistance))) {
            endDistanceWeighted += Number(row.endDistance) * weight;
            endDistanceWeights += weight;
        }
    }

    if (weightSum <= 0) return null;
    return {
        girRate: girWeighted / weightSum,
        avgPuttsIfGreen: puttsIfGreenWeights > 0 ? puttsIfGreenWeighted / puttsIfGreenWeights : null,
        avgEndDistance: endDistanceWeights > 0 ? endDistanceWeighted / endDistanceWeights : null,
        sample: use.length,
        maxDiff: Math.max(...use.map(row => row.diff))
    };
}

function blendApproachPreviewSummaries(stateSummary, clubSummary) {
    if (!stateSummary && !clubSummary) return null;
    if (!stateSummary) return clubSummary;
    if (!clubSummary) return stateSummary;

    const clubWeight = clubSummary.sample >= 10 ? 0.35 : clubSummary.sample >= 6 ? 0.22 : 0.10;
    const stateWeight = 1 - clubWeight;
    return {
        girRate: stateSummary.girRate * stateWeight + clubSummary.girRate * clubWeight,
        avgPuttsIfGreen: weightedBlendNullable(stateSummary.avgPuttsIfGreen, stateWeight, clubSummary.avgPuttsIfGreen, clubWeight),
        avgEndDistance: weightedBlendNullable(stateSummary.avgEndDistance, stateWeight, clubSummary.avgEndDistance, clubWeight),
        sample: Math.max(stateSummary.sample ?? 0, clubSummary.sample ?? 0),
        maxDiff: Math.min(stateSummary.maxDiff ?? Number.POSITIVE_INFINITY, clubSummary.maxDiff ?? Number.POSITIVE_INFINITY)
    };
}

function weightedBlendNullable(a, aWeight, b, bWeight) {
    const hasA = Number.isFinite(Number(a));
    const hasB = Number.isFinite(Number(b));
    if (hasA && hasB) return Number(a) * aWeight + Number(b) * bWeight;
    if (hasA) return Number(a);
    if (hasB) return Number(b);
    return null;
}

function formatApproachPreviewOutlook(preview) {
    if (!preview) return 'Building from broader approach data';
    const gir = Number.isFinite(preview.girRate) ? `GIR ${(preview.girRate * 100).toFixed(0)}%` : 'GIR n/a';
    const putts = Number.isFinite(preview.avgPuttsIfGreen)
        ? `${preview.avgPuttsIfGreen.toFixed(2)} putts if GIR`
        : 'putts on green n/a';
    return `${gir} | ${putts}`;
}

function formatApproachChainPreview(option, approachPlan, preview) {
    if (!option || !approachPlan) return '';
    const teeClub = option.club ?? 'Tee club';
    const leave = Number.isFinite(option.leaveDistance) ? `~${option.leaveDistance.toFixed(0)} yds left` : 'leave n/a';
    const approachClub = approachPlan.clubName ?? 'Approach club';
    const lieText = approachPlan.lie ? ` from ${approachPlan.lie}` : '';
    const girText = preview && Number.isFinite(preview.girRate) ? `GIR ${(preview.girRate * 100).toFixed(0)}%` : '';
    const puttText = preview && Number.isFinite(preview.avgPuttsIfGreen) ? `${preview.avgPuttsIfGreen.toFixed(2)} putts if green` : '';
    const gapText = preview && Number.isFinite(preview.gap)
        ? formatApproachGap(preview.gap)
        : '';
    const parts = [
        `${teeClub} -> ${leave}`,
        `${approachClub}${lieText}`,
        girText,
        puttText,
        gapText
    ].filter(Boolean);
    return parts.join(' | ');
}

function formatApproachGap(gap) {
    const value = Number(gap);
    if (!Number.isFinite(value)) return '';
    if (Math.abs(value) < 4) return 'distance fit on number';
    return value > 0
        ? `smart distance +${value.toFixed(0)} yds long`
        : `smart distance ${value.toFixed(0)} yds short`;
}

function getObservedWeightForTeeOption(n) {
    const count = Number(n);
    if (!Number.isFinite(count) || count <= 1) return 0.50;
    if (count >= 10) return 0.82;
    if (count >= 7) return 0.76;
    if (count >= 5) return 0.70;
    if (count >= 3) return 0.62;
    return 0.55;
}

function getModeledTeePenaltyLoad(option) {
    const holeRate = Number(option?.penaltyHoleRateAdj);
    const shotRate = Number(option?.penaltyShotRate);
    const holeWeight = Number.isFinite(holeRate) ? holeRate * 0.45 : 0;
    const shotWeight = Number.isFinite(shotRate) ? Math.min(shotRate, 1.4) * 0.12 : 0;
    return holeWeight + shotWeight;
}

function getTeeOptionDecisionMargin(a, b) {
    const minN = Math.min(Number(a?.n) || 0, Number(b?.n) || 0);
    if (minN >= 10) return 0.03;
    if (minN >= 6) return 0.05;
    if (minN >= 4) return 0.07;
    return 0.10;
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

function getBaselineProfile(mode = analyticsBenchmarkMode) {
    const normalizedMode = normalizeAnalyticsBenchmarkMode(mode);
    const targetUsable = targetBenchmarkInfo.roundCount >= 3 && targetBaselineAll.length >= 30;
    if (normalizedMode === 'target' && targetUsable) {
        return {
            mode: 'target',
            label: `${targetBenchmarkInfo.label} | n=${targetBenchmarkInfo.roundCount}`,
            byLie: targetBaselineIndexByLie,
            all: targetBaselineAll
        };
    }
    if (normalizedMode === 'target' && !targetUsable) {
        return {
            mode: 'personal',
            label: 'My baseline (target sample too thin)',
            byLie: stateBaselineIndexByLie,
            all: stateBaselineAll
        };
    }
    return {
        mode: 'personal',
        label: 'My baseline',
        byLie: stateBaselineIndexByLie,
        all: stateBaselineAll
    };
}

function getCurrentBaselineInfo() {
    return getBaselineProfile(analyticsBenchmarkMode);
}

function estimateStrokesToHoleOut(distanceYards, lie = null, mode = analyticsBenchmarkMode) {
    if (!Number.isFinite(distanceYards)) return null;
    const profile = getBaselineProfile(mode);
    const normalizedLie = normalize(lie);
    const lieRows = normalizedLie ? (profile.byLie.get(normalizedLie) ?? []) : [];
    const rows = lieRows.length >= 10 ? lieRows : profile.all;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const nearest = rows
        .map(row => ({
            ...row,
            diff: Math.abs(row.startDistance - distanceYards)
        }))
        .sort((a, b) => {
            if (a.diff !== b.diff) return a.diff - b.diff;
            const aLie = normalizedLie && normalize(a.lie) === normalizedLie ? 0 : 1;
            const bLie = normalizedLie && normalize(b.lie) === normalizedLie ? 0 : 1;
            return aLie - bLie;
        })
        .slice(0, Math.min(50, rows.length));

    if (nearest.length === 0) return null;

    const closeBand = nearest.some(r => r.diff <= 8) ? 12 : nearest.some(r => r.diff <= 20) ? 24 : 45;
    const pool = nearest.filter(r => r.diff <= closeBand);
    const use = pool.length >= 8 ? pool : nearest.slice(0, Math.min(22, nearest.length));

    let sum = 0;
    let weightSum = 0;
    for (const row of use) {
        const weight = 1 / Math.max(3, row.diff + 3);
        sum += row.strokesToHoleOut * weight;
        weightSum += weight;
    }
    if (weightSum <= 0) return null;
    return sum / weightSum;
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

function buildStrokesDashboard(currentHole, samples, alignedGeometry = null) {
    const current = computeHoleBaselineBreakdown(currentHole, alignedGeometry);
    const sampleBreakdowns = (samples ?? [])
        .map(h => computeHoleBaselineBreakdown(h, alignedGeometry))
        .filter(Boolean);

    if (!current && sampleBreakdowns.length === 0) return null;

    const average = averageBreakdownRows(sampleBreakdowns);
    const currentWorst = findWorstBreakdownPhase(current);
    const averageWorst = findWorstBreakdownPhase(average);
    const averageBest = findBestBreakdownPhase(average);

    return {
        current,
        average,
        currentWorst,
        averageWorst,
        averageBest
    };
}

function getRoundStrokesDashboard(round) {
    if (!round) return null;
    const key = getRoundDashboardCacheKey(round);
    if (roundStrokesDashboardCache.has(key)) {
        return roundStrokesDashboardCache.get(key);
    }
    const dashboard = buildRoundStrokesDashboard(round);
    roundStrokesDashboardCache.set(key, dashboard);
    return dashboard;
}

function getCourseStrokesDashboard(round, filters = { range: 'all' }) {
    if (!round) return null;
    const key = getCourseDashboardCacheKey(round, filters);
    if (courseStrokesDashboardCache.has(key)) {
        return courseStrokesDashboardCache.get(key);
    }
    const dashboard = buildCourseStrokesDashboard(round, filters);
    courseStrokesDashboardCache.set(key, dashboard);
    return dashboard;
}

function buildRoundStrokesDashboard(round) {
    const current = computeRoundBaselineBreakdown(round);
    if (!current) return null;
    return {
        current,
        currentWorst: findWorstBreakdownPhase(current),
        currentBest: findBestBreakdownPhase(current),
        holes: Number(current?.holeCount) || Number(round?.holes?.length) || 0
    };
}

function buildCourseStrokesDashboard(round, filters = { range: 'all' }) {
    if (!round) return null;
    const rounds = getCourseRounds(round, filters);
    const breakdowns = rounds
        .map(candidate => computeRoundBaselineBreakdown(candidate))
        .filter(Boolean);
    if (breakdowns.length === 0) return null;

    const average = averageBreakdownRows(breakdowns);
    return {
        average,
        averageWorst: findWorstBreakdownPhase(average),
        averageBest: findBestBreakdownPhase(average),
        rounds: breakdowns.length,
        dateSpan: buildRoundDateSpan(rounds)
    };
}

function computeRoundBaselineBreakdown(round) {
    if (!round) return null;
    const holeRows = [];
    for (const holeRaw of round?.holes ?? []) {
        const geometryStatus = inspectHoleGeometry(round, holeRaw);
        const hole = maybeMirrorHoleShots(holeRaw, geometryStatus.holeGeometry);
        const alignedGeometry = alignHoleGeometryToHole(geometryStatus.holeGeometry, hole).geometry;
        const row = computeHoleBaselineBreakdown(hole, alignedGeometry);
        if (row) holeRows.push(row);
    }
    if (holeRows.length === 0) return null;
    return sumBreakdownRows(holeRows);
}

function computeHoleBaselineBreakdown(hole, alignedGeometry = null) {
    if (!hole) return null;
    const orderedShots = [...(hole?.shots ?? [])]
        .filter(s => Number.isFinite(Number(s?.shotNumber)))
        .sort((a, b) => Number(a.shotNumber) - Number(b.shotNumber));
    const playableShots = orderedShots.filter(s => !isPenaltyShot(s));
    if (playableShots.length === 0) return null;

    const phases = {
        tee: 0,
        approach: 0,
        short: 0,
        putting: 0,
        penalties: 0
    };
    const counts = {
        tee: 0,
        approach: 0,
        short: 0,
        putting: 0,
        penalties: 0
    };

    for (let i = 0; i < playableShots.length; i++) {
        const shot = playableShots[i];
        const shotNumber = Number(shot?.shotNumber);
        const startDistance = distanceToPinFromPoint(shot?.start, hole?.pin);
        if (!Number.isFinite(shotNumber) || !Number.isFinite(startDistance)) continue;

        const startLie = shotNumber === 1
            ? 'tee'
            : inferApproachLie([Number(shot?.start?.x), Number(shot?.start?.z)], alignedGeometry);
        const startExpected = estimateStrokesToHoleOut(startDistance, startLie);
        if (!Number.isFinite(startExpected)) continue;

        const nextPlayable = playableShots[i + 1] ?? null;
        const endDistance = distanceToPinFromPoint(shot?.end, hole?.pin);
        const holedOut = !nextPlayable || (Number.isFinite(endDistance) && endDistance <= 0.5);
        const endLie = holedOut
            ? 'holed'
            : inferApproachLie([Number(shot?.end?.x), Number(shot?.end?.z)], alignedGeometry);
        const endExpected = holedOut ? 0 : estimateStrokesToHoleOut(endDistance, endLie);
        if (!holedOut && !Number.isFinite(endExpected)) continue;

        const phase = classifyDashboardShotPhase(shot, startDistance, startLie);
        const sg = startExpected - (1 + (holedOut ? 0 : endExpected));
        phases[phase] += sg;
        counts[phase] += 1;
    }

    const penaltyEvents = analyzePenaltyEvents(hole?.shots ?? []);
    if (penaltyEvents.total > 0) {
        phases.penalties -= penaltyEvents.total;
        counts.penalties += penaltyEvents.total;
    }

    const total = phases.tee + phases.approach + phases.short + phases.putting + phases.penalties;
    return {
        tee: phases.tee,
        approach: phases.approach,
        short: phases.short,
        putting: phases.putting,
        penalties: phases.penalties,
        total,
        counts,
        penaltyEvents: penaltyEvents.total,
        holeCount: 1
    };
}

function sumBreakdownRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const totals = {
        tee: 0,
        approach: 0,
        short: 0,
        putting: 0,
        penalties: 0,
        total: 0,
        counts: {
            tee: 0,
            approach: 0,
            short: 0,
            putting: 0,
            penalties: 0
        },
        penaltyEvents: 0,
        holeCount: 0
    };
    for (const row of rows) {
        totals.tee += Number(row?.tee) || 0;
        totals.approach += Number(row?.approach) || 0;
        totals.short += Number(row?.short) || 0;
        totals.putting += Number(row?.putting) || 0;
        totals.penalties += Number(row?.penalties) || 0;
        totals.total += Number(row?.total) || 0;
        totals.counts.tee += Number(row?.counts?.tee) || 0;
        totals.counts.approach += Number(row?.counts?.approach) || 0;
        totals.counts.short += Number(row?.counts?.short) || 0;
        totals.counts.putting += Number(row?.counts?.putting) || 0;
        totals.counts.penalties += Number(row?.counts?.penalties) || 0;
        totals.penaltyEvents += Number(row?.penaltyEvents) || 0;
        totals.holeCount += Number(row?.holeCount) || 1;
    }
    return totals;
}

function classifyDashboardShotPhase(shot, startDistance, startLie) {
    const clubId = Number(shot?.clubId);
    if (clubId === 13 || normalize(startLie) === 'green') return 'putting';
    if (Number(shot?.shotNumber) === 1 || normalize(startLie) === 'tee') return 'tee';
    if (Number.isFinite(startDistance) && startDistance <= 40) return 'short';
    if (normalize(startLie) === 'sand' && Number.isFinite(startDistance) && startDistance <= 60) return 'short';
    return 'approach';
}

function averageBreakdownRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const keys = ['tee', 'approach', 'short', 'putting', 'penalties', 'total'];
    const avgRow = {};
    for (const key of keys) {
        avgRow[key] = avg(rows.map(row => Number(row?.[key])));
    }
    avgRow.counts = {
        tee: avg(rows.map(row => Number(row?.counts?.tee))),
        approach: avg(rows.map(row => Number(row?.counts?.approach))),
        short: avg(rows.map(row => Number(row?.counts?.short))),
        putting: avg(rows.map(row => Number(row?.counts?.putting))),
        penalties: avg(rows.map(row => Number(row?.counts?.penalties)))
    };
    avgRow.penaltyEvents = avg(rows.map(row => Number(row?.penaltyEvents)));
    avgRow.holeCount = avg(rows.map(row => Number(row?.holeCount)));
    return avgRow;
}

function buildRoundDateSpan(rounds) {
    const dates = (rounds ?? []).map(round => String(round?.date ?? '')).filter(Boolean).sort();
    if (dates.length === 0) return '-';
    return dates.length === 1 ? dates[0] : `${dates[0]} -> ${dates[dates.length - 1]}`;
}

function findWorstBreakdownPhase(row) {
    if (!row) return null;
    const phases = [
        ['tee', row.tee],
        ['approach', row.approach],
        ['short', row.short],
        ['putting', row.putting],
        ['penalties', row.penalties]
    ].filter(([, value]) => Number.isFinite(value));
    if (phases.length === 0) return null;
    phases.sort((a, b) => a[1] - b[1]);
    return { key: phases[0][0], value: phases[0][1] };
}

function findBestBreakdownPhase(row) {
    if (!row) return null;
    const phases = [
        ['tee', row.tee],
        ['approach', row.approach],
        ['short', row.short],
        ['putting', row.putting]
    ].filter(([, value]) => Number.isFinite(value));
    if (phases.length === 0) return null;
    phases.sort((a, b) => b[1] - a[1]);
    return { key: phases[0][0], value: phases[0][1] };
}

function formatBaselineDelta(value, decimals = 2) {
    if (!Number.isFinite(value)) return 'n/a';
    const abs = Math.abs(value);
    if (abs < 0.01) return 'Even vs baseline';
    return value > 0
        ? `${abs.toFixed(decimals)} gained`
        : `${abs.toFixed(decimals)} lost`;
}

function labelDashboardPhase(key) {
    switch (key) {
        case 'tee': return 'Tee';
        case 'approach': return 'Approach';
        case 'short': return 'Short game';
        case 'putting': return 'Putting';
        case 'penalties': return 'Penalties';
        default: return 'Unknown';
    }
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
