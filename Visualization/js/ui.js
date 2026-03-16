let elements = {};

export function initUI() {
    elements = {
        courseName: document.getElementById('course-name'),
        roundInfo: document.getElementById('round-info'),
        holeTitle: document.getElementById('hole-title'),
        holePar: document.getElementById('hole-par'),
        holePanel: document.getElementById('hole-panel'),
        holeAnalyticsPanel: document.getElementById('hole-analytics'),
        holeAnalyticsContent: document.getElementById('hole-analytics-content'),
        holeAnalyticsSummary: document.getElementById('hole-analytics-summary'),
        holeScore: document.getElementById('hole-score'),
        holeAnalyticsBody: document.getElementById('hole-analytics-body'),
        btnAnalyticsToggle: document.getElementById('btn-analytics-toggle'),
        analyticsBenchmarkMode: document.getElementById('analytics-benchmark-mode'),
        analyticsDashboard: document.getElementById('analytics-dashboard'),
        analyticsDashboardTitle: document.getElementById('analytics-dashboard-title'),
        analyticsDashboardSubtitle: document.getElementById('analytics-dashboard-subtitle'),
        analyticsDashboardHoleLabel: document.getElementById('analytics-dashboard-hole-label'),
        analyticsDashboardSummaryTitle: document.getElementById('analytics-dashboard-summary-title'),
        analyticsDashboardSecondaryTitle: document.getElementById('analytics-dashboard-secondary-title'),
        analyticsDashboardMainTitle: document.getElementById('analytics-dashboard-main-title'),
        analyticsDashboardSummary: document.getElementById('analytics-dashboard-summary'),
        analyticsDashboardDetails: document.getElementById('analytics-dashboard-details'),
        analyticsDashboardCaddie: document.getElementById('analytics-dashboard-caddie'),
        analyticsDashboardClose: document.getElementById('analytics-dashboard-close'),
        analyticsDashboardPrevHole: document.getElementById('analytics-dashboard-prev-hole'),
        analyticsDashboardNextHole: document.getElementById('analytics-dashboard-next-hole'),
        analyticsDashboardBenchmarkMode: document.getElementById('analytics-dashboard-benchmark-mode'),
        analyticsDashboardModeButtons: Array.from(document.querySelectorAll('.analytics-dashboard-mode-btn')),
        shotPanel: document.getElementById('shot-panel'),
        shotClub: document.getElementById('shot-club'),
        shotDist: document.getElementById('shot-dist'),
        shotNote: document.getElementById('shot-note'),
        shotNum: document.getElementById('shot-num'),
        caddiePanel: document.getElementById('caddie-panel'),
        caddieBody: document.getElementById('caddie-body'),
        plannerPanel: document.getElementById('planner-panel'),
        plannerBody: document.getElementById('planner-body'),
        spreadLegend: document.getElementById('spread-legend'),
        spreadLegendItems: Array.from(document.querySelectorAll('.legend-item[data-layer]')),
        insightLayerAim: document.getElementById('insight-layer-aim'),
        insightLayerDispersion: document.getElementById('insight-layer-dispersion'),
        insightLayerPenalty: document.getElementById('insight-layer-penalty'),
        geometryDebug: document.getElementById('geometry-debug'),
        geometryDebugBody: document.getElementById('geometry-debug-body'),
        scorecard: document.getElementById('scorecard'),
        scorecardBar: document.getElementById('scorecard-bar'),
        roundSelect: document.getElementById('round-select'),
        analyticsDashboardRoundSelect: document.getElementById('analytics-dashboard-round-select'),
        spreadMode: document.getElementById('spread-mode'),
        spreadClub: document.getElementById('spread-club'),
        spreadRange: document.getElementById('spread-range'),
        spreadShowShots: document.getElementById('spread-show-shots'),
        spreadHeatmap: document.getElementById('spread-heatmap'),
        btnBestHole: document.getElementById('btn-best-hole'),
        btnWorstHole: document.getElementById('btn-worst-hole'),
        panelHole: document.getElementById('panel-hole'),
        panelAnalytics: document.getElementById('panel-analytics'),
        panelShot: document.getElementById('panel-shot'),
        panelCaddie: document.getElementById('panel-caddie'),
        panelPlanner: document.getElementById('panel-planner'),
        panelSpreadLegend: document.getElementById('panel-spread-legend'),
        btnMenuSettings: document.getElementById('btn-menu-settings'),
        menuSettings: document.getElementById('menu-settings'),
        btnImportGeometry: document.getElementById('btn-import-geometry'),
        importGeometryFile: document.getElementById('import-geometry-file'),
        settingsStatus: document.getElementById('menu-settings-status'),
        mainMenu: document.getElementById('main-menu'),
        btnOpenMenu: document.getElementById('btn-open-menu'),
        mainMenuButtons: Array.from(document.querySelectorAll('.main-menu-btn[data-mode]')),
        btnPlay: document.getElementById('btn-play'),
        shotTimeline: document.getElementById('shot-timeline'),
        timelineLabel: document.getElementById('timeline-label'),
        timelinePanel: document.getElementById('timeline-panel'),
        controls: document.getElementById('controls'),
        cinematicMode: document.getElementById('cinematic-mode'),
        panelToggleButtons: Array.from(document.querySelectorAll('[data-panel-toggle]'))
    };
    elements.collapsiblePanels = {
        analytics: { panel: elements.holeAnalyticsPanel, body: elements.holeAnalyticsContent },
        caddie: { panel: elements.caddiePanel, body: elements.caddieBody },
        planner: { panel: elements.plannerPanel, body: elements.plannerBody },
        spreadLegend: { panel: elements.spreadLegend, body: document.getElementById('spread-legend-body') },
        geometryDebug: { panel: elements.geometryDebug, body: document.getElementById('geometry-debug-content') }
    };
    bindPanelCollapseToggles();
    window.addEventListener('resize', () => requestRightPanelLayout());
    requestRightPanelLayout();
}

export function populateRoundSelector(rounds) {
    const selects = [elements.roundSelect, elements.analyticsDashboardRoundSelect].filter(Boolean);
    for (const select of selects) {
        select.innerHTML = '';
        rounds.forEach((round, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `${round.courseName} - ${round.date} (${round.totalScore})`;
            select.appendChild(opt);
        });
    }
}

export function setRoundSelection(idx) {
    if (elements.roundSelect) elements.roundSelect.value = String(idx);
    if (elements.analyticsDashboardRoundSelect) elements.analyticsDashboardRoundSelect.value = String(idx);
}

export function onRoundSelectionChange(cb) {
    const bind = select => {
        if (!select) return;
        select.addEventListener('change', e => {
            const idx = Number(e.target?.value);
            cb(Number.isFinite(idx) ? idx : 0);
        });
    };
    bind(elements.roundSelect);
    bind(elements.analyticsDashboardRoundSelect);
}

export function updateHoleInfo(hole) {
    elements.holeTitle.textContent = `Hole ${hole.holeNumber}`;
    elements.holePar.textContent = `Par ${hole.par}`;

    const diff = hole.score - hole.par;
    elements.holeScore.textContent = `${hole.score} (${scoreName(diff)})`;
    elements.holeScore.style.color = scoreColor(diff);
    requestRightPanelLayout();
}

export function updateShotInfo(shot) {
    if (!shot) {
        elements.shotClub.textContent = '-';
        elements.shotDist.textContent = '-';
        elements.shotNum.textContent = 'On the tee';
        if (elements.shotNote) elements.shotNote.textContent = '';
        elements.shotPanel?.classList.remove('penalty');
        return;
    }

    const penalty = isPenaltyShot(shot);
    const clubName = String(shot.clubName ?? '').trim() || 'Unknown';
    const distance = Number(shot.distance);

    elements.shotClub.textContent = penalty ? 'Penalty' : clubName;
    if (penalty) {
        elements.shotDist.textContent = Number.isFinite(distance)
            ? `${distance} yds (no advance)`
            : '+1 stroke';
        if (elements.shotNote) elements.shotNote.textContent = 'Penalty stroke (+1)';
    } else {
        elements.shotDist.textContent = `${shot.distance} yds`;
        if (elements.shotNote) elements.shotNote.textContent = '';
    }
    elements.shotNum.textContent = `Shot ${shot.shotNumber}`;
    elements.shotPanel?.classList.toggle('penalty', penalty);
}

export function updateCourseInfo(round) {
    elements.courseName.textContent = round.courseName;
    elements.roundInfo.textContent = `${round.date} | Score: ${round.totalScore}`;
}

export function buildScorecard(holes, currentHoleIndex) {
    elements.scorecard.innerHTML = '';

    holes.forEach((hole, idx) => {
        const div = document.createElement('div');
        div.className = 'sc-hole';
        if (idx === currentHoleIndex) div.classList.add('sc-active');

        const diff = hole.score - hole.par;
        div.style.backgroundColor = scoreColor(diff);

        div.innerHTML = `
            <span class="sc-num">${hole.holeNumber}</span>
            <span class="sc-score">${hole.score}</span>
        `;

        div.addEventListener('click', () => {
            if (elements._onHoleClick) elements._onHoleClick(idx);
        });

        elements.scorecard.appendChild(div);
    });
}

export function onHoleClick(cb) {
    elements._onHoleClick = cb;
}

export function setPlayIcon(playing) {
    elements.btnPlay.textContent = playing ? 'Pause' : 'Play';
}

export function setSpreadMode(enabled) {
    if (!elements.spreadMode) return;
    elements.spreadMode.checked = !!enabled;
}

export function onSpreadModeChange(cb) {
    if (!elements.spreadMode) return;
    elements.spreadMode.addEventListener('change', e => {
        cb(!!e.target.checked);
    });
}

export function getSpreadFilters() {
    return {
        club: elements.spreadClub?.value ?? 'all',
        range: elements.spreadRange?.value ?? 'all',
        showShots: !!elements.spreadShowShots?.checked,
        heatmap: !!elements.spreadHeatmap?.checked,
        insightAim: !!elements.insightLayerAim?.checked,
        insightDispersion: !!elements.insightLayerDispersion?.checked,
        insightPenalty: !!elements.insightLayerPenalty?.checked
    };
}

export function onSpreadFiltersChange(cb) {
    const emit = () => cb(getSpreadFilters());
    if (elements.spreadClub) elements.spreadClub.addEventListener('change', emit);
    if (elements.spreadRange) elements.spreadRange.addEventListener('change', emit);
    if (elements.spreadShowShots) elements.spreadShowShots.addEventListener('change', emit);
    if (elements.spreadHeatmap) elements.spreadHeatmap.addEventListener('change', emit);
    if (elements.insightLayerAim) elements.insightLayerAim.addEventListener('change', emit);
    if (elements.insightLayerDispersion) elements.insightLayerDispersion.addEventListener('change', emit);
    if (elements.insightLayerPenalty) elements.insightLayerPenalty.addEventListener('change', emit);
}

export function getPanelVisibility() {
    return {
        hole: elements.panelHole?.checked ?? true,
        analytics: elements.panelAnalytics?.checked ?? true,
        shot: elements.panelShot?.checked ?? true,
        caddie: elements.panelCaddie?.checked ?? true,
        planner: elements.panelPlanner?.checked ?? true,
        spreadLegend: elements.panelSpreadLegend?.checked ?? true
    };
}

export function onPanelVisibilityChange(cb) {
    const emit = () => cb(getPanelVisibility());
    if (elements.panelHole) elements.panelHole.addEventListener('change', emit);
    if (elements.panelAnalytics) elements.panelAnalytics.addEventListener('change', emit);
    if (elements.panelShot) elements.panelShot.addEventListener('change', emit);
    if (elements.panelCaddie) elements.panelCaddie.addEventListener('change', emit);
    if (elements.panelPlanner) elements.panelPlanner.addEventListener('change', emit);
    if (elements.panelSpreadLegend) elements.panelSpreadLegend.addEventListener('change', emit);
}

export function onBestHoleReplay(cb) {
    if (!elements.btnBestHole) return;
    elements.btnBestHole.addEventListener('click', () => cb());
}

export function onWorstHoleReplay(cb) {
    if (!elements.btnWorstHole) return;
    elements.btnWorstHole.addEventListener('click', () => cb());
}

export function onImportGeometry(cb) {
    if (!elements.btnImportGeometry || !elements.importGeometryFile) return;
    elements.btnImportGeometry.addEventListener('click', () => {
        elements.importGeometryFile.value = '';
        elements.importGeometryFile.click();
    });
    elements.importGeometryFile.addEventListener('change', e => {
        const file = e.target?.files?.[0];
        if (file) cb(file);
    });
}

export function onMenuSettingsToggle(cb) {
    if (!elements.btnMenuSettings) return;
    elements.btnMenuSettings.addEventListener('click', () => cb());
}

export function setMenuSettingsVisible(visible) {
    if (!elements.menuSettings) return;
    elements.menuSettings.style.display = visible ? 'block' : 'none';
}

export function updateSimApiSummary(text) {
    if (!elements.settingsStatus) return;
    elements.settingsStatus.textContent = text;
}

export function setMainMenuVisible(visible) {
    if (!elements.mainMenu) return;
    elements.mainMenu.style.display = visible ? 'flex' : 'none';
}

export function onMainMenuSelect(cb) {
    if (!elements.mainMenuButtons) return;
    for (const btn of elements.mainMenuButtons) {
        btn.addEventListener('click', () => {
            cb(btn.dataset.mode ?? 'replay');
        });
    }
}

export function onOpenMainMenu(cb) {
    if (!elements.btnOpenMenu) return;
    elements.btnOpenMenu.addEventListener('click', () => cb());
}

export function updateGeometryDebug(text) {
    if (!elements.geometryDebugBody) return;
    elements.geometryDebugBody.textContent = text;
    requestRightPanelLayout();
}

export function setGeometryDebugVisible(visible) {
    if (!elements.geometryDebug) return;
    elements.geometryDebug.style.display = visible ? 'block' : 'none';
    requestRightPanelLayout();
}

export function setTimelineBounds(shotCount) {
    if (!elements.shotTimeline) return;
    const max = Math.max(0, Number(shotCount) || 0);
    elements.shotTimeline.min = '0';
    elements.shotTimeline.max = String(max);
    elements.shotTimeline.step = '0.01';
    elements.shotTimeline.value = '0';
    elements.shotTimeline.disabled = max === 0;
    setTimelineValue(0, null);
}

export function setTimelineValue(playbackValue, shot) {
    if (elements.shotTimeline) {
        elements.shotTimeline.value = String(Math.max(0, Number(playbackValue) || 0));
    }
    if (!elements.timelineLabel) return;
    if (!shot) {
        elements.timelineLabel.textContent = 'Tee';
        return;
    }
    elements.timelineLabel.textContent = `Shot ${shot.shotNumber} - ${shot.clubName}`;
}

export function onTimelineInput(cb) {
    if (!elements.shotTimeline) return;
    elements.shotTimeline.addEventListener('input', e => {
        const v = Number(e.target.value);
        cb(Number.isFinite(v) ? v : 0);
    });
}

export function onCinematicModeChange(cb) {
    if (!elements.cinematicMode) return;
    elements.cinematicMode.addEventListener('change', e => {
        cb(!!e.target.checked);
    });
}

export function onAnalyticsToggle(cb) {
    if (!elements.btnAnalyticsToggle) return;
    elements.btnAnalyticsToggle.addEventListener('click', () => cb());
}

export function getAnalyticsBenchmarkMode() {
    return elements.analyticsBenchmarkMode?.value
        ?? elements.analyticsDashboardBenchmarkMode?.value
        ?? 'personal';
}

export function onAnalyticsBenchmarkModeChange(cb) {
    const emit = event => {
        const mode = event?.target?.value ?? getAnalyticsBenchmarkMode();
        cb(mode);
    };
    elements.analyticsBenchmarkMode?.addEventListener('change', emit);
    elements.analyticsDashboardBenchmarkMode?.addEventListener('change', emit);
}

export function setAnalyticsBenchmarkMode(mode) {
    const value = String(mode ?? 'personal').toLowerCase() === 'target' ? 'target' : 'personal';
    if (elements.analyticsBenchmarkMode) elements.analyticsBenchmarkMode.value = value;
    if (elements.analyticsDashboardBenchmarkMode) elements.analyticsDashboardBenchmarkMode.value = value;
}

export function setAnalyticsDetailsVisible(visible) {
    applyAnalyticsToggleState(visible);
}

export function updateHoleAnalytics(summaryText, detailsText = '') {
    if (elements.holeAnalyticsSummary) {
        elements.holeAnalyticsSummary.innerHTML = summaryText;
    }
    if (elements.holeAnalyticsBody) {
        elements.holeAnalyticsBody.innerHTML = detailsText;
    }
    const keepVisible = elements.holeAnalyticsBody ? !elements.holeAnalyticsBody.hidden : false;
    applyAnalyticsToggleState(keepVisible);
    requestRightPanelLayout();
}

export function updateAnalyticsDashboard(model) {
    if (!model) return;
    if (elements.analyticsDashboardTitle) elements.analyticsDashboardTitle.textContent = model.title ?? 'Hole Analytics Dashboard';
    if (elements.analyticsDashboardSubtitle) elements.analyticsDashboardSubtitle.textContent = model.subtitle ?? '';
    if (elements.analyticsDashboardHoleLabel) elements.analyticsDashboardHoleLabel.textContent = model.holeLabel ?? '';
    if (elements.analyticsDashboardSummaryTitle) elements.analyticsDashboardSummaryTitle.textContent = model.summaryTitle ?? 'Overview';
    if (elements.analyticsDashboardSecondaryTitle) elements.analyticsDashboardSecondaryTitle.textContent = model.secondaryTitle ?? 'Pre-Shot Caddie';
    if (elements.analyticsDashboardMainTitle) elements.analyticsDashboardMainTitle.textContent = model.mainTitle ?? 'Detailed Hole Analytics';
    if (elements.analyticsDashboardSummary) elements.analyticsDashboardSummary.innerHTML = model.summaryHtml ?? '';
    if (elements.analyticsDashboardDetails) elements.analyticsDashboardDetails.innerHTML = model.detailsHtml ?? '';
    if (elements.analyticsDashboardCaddie) elements.analyticsDashboardCaddie.innerHTML = model.caddieHtml ?? '';
}

export function setAnalyticsDashboardVisible(visible) {
    if (!elements.analyticsDashboard) return;
    elements.analyticsDashboard.style.display = visible ? 'block' : 'none';
}

export function onAnalyticsDashboardClose(cb) {
    elements.analyticsDashboardClose?.addEventListener('click', () => cb());
}

export function onAnalyticsDashboardHoleNav(cb) {
    elements.analyticsDashboardPrevHole?.addEventListener('click', () => cb(-1));
    elements.analyticsDashboardNextHole?.addEventListener('click', () => cb(1));
}

export function setAnalyticsDashboardMode(mode) {
    const normalized = String(mode ?? 'hole').toLowerCase() === 'course' ? 'course' : 'hole';
    for (const button of elements.analyticsDashboardModeButtons ?? []) {
        const active = String(button.dataset.dashboardMode ?? '') === normalized;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
}

export function onAnalyticsDashboardModeChange(cb) {
    for (const button of elements.analyticsDashboardModeButtons ?? []) {
        button.addEventListener('click', () => {
            cb(button.dataset.dashboardMode ?? 'hole');
        });
    }
}

export function onAnalyticsDashboardTabSelect(cb) {
    const bind = container => {
        container?.addEventListener('click', e => {
            const button = e.target?.closest?.('[data-dashboard-tab]');
            if (!button) return;
            cb(button.dataset.dashboardTab ?? 'overview');
        });
    };
    bind(elements.analyticsDashboardDetails);
}

export function onAnalyticsDashboardHoleSelect(cb) {
    const bind = container => {
        container?.addEventListener('click', e => {
            const target = e.target?.closest?.('[data-dashboard-hole-index]');
            if (!target) return;
            const idx = Number(target.dataset.dashboardHoleIndex);
            if (!Number.isFinite(idx)) return;
            cb(idx);
        });
    };
    bind(elements.analyticsDashboardDetails);
    bind(elements.analyticsDashboardCaddie);
}

export function updateCaddiePlan(text) {
    if (!elements.caddieBody) return;
    elements.caddieBody.innerHTML = text;
    requestRightPanelLayout();
}

export function updatePlannerPanel(text) {
    if (!elements.plannerBody) return;
    elements.plannerBody.innerHTML = text;
    requestRightPanelLayout();
}

export function onCaddiePlanSelect(cb) {
    const bind = container => {
        if (!container) return;
        container.addEventListener('click', e => {
            const button = e.target?.closest?.('[data-tee-plan-club]');
            if (!button) return;
            const club = String(button.dataset.teePlanClub ?? '').trim();
            if (!club) return;
            cb(club);
        });
    };
    bind(elements.caddieBody);
    bind(elements.analyticsDashboardCaddie);
    bind(elements.analyticsDashboardDetails);
}

export function setCaddieVisible(visible) {
    if (!elements.caddiePanel) return;
    elements.caddiePanel.style.display = visible ? 'block' : 'none';
    requestRightPanelLayout();
}

export function setPlannerVisible(visible) {
    if (!elements.plannerPanel) return;
    elements.plannerPanel.style.display = visible ? 'block' : 'none';
    requestRightPanelLayout();
}

export function setSpreadLegendVisible(visible) {
    if (!elements.spreadLegend) return;
    elements.spreadLegend.style.display = visible ? 'block' : 'none';
    requestRightPanelLayout();
}

export function onPlannerChange(cb) {
    if (!elements.plannerBody) return;
    const emit = meta => cb(getPlannerControls(), meta ?? {});
    elements.plannerBody.addEventListener('click', e => {
        const target = e.target?.closest?.('[data-planner-reset]');
        if (!target) return;
        emit({
            live: false,
            source: 'reset',
            action: 'reset'
        });
    });
    elements.plannerBody.addEventListener('change', e => {
        const target = e.target;
        if (!target?.closest?.('[data-planner-controls]')) return;
        emit({
            live: false,
            source: target.matches?.('[data-planner-aim]') ? 'aim' : 'club'
        });
    });
    elements.plannerBody.addEventListener('input', e => {
        const target = e.target;
        if (!target?.closest?.('[data-planner-controls]')) return;
        if (target.matches?.('[data-planner-aim]')) {
            updatePlannerAimLabel(target.value);
            emit({
                live: true,
                source: 'aim'
            });
        }
    });
}

function getPlannerControls() {
    return {
        club: elements.plannerBody?.querySelector?.('[data-planner-club]')?.value ?? '',
        aimOffsetMeters: Number(elements.plannerBody?.querySelector?.('[data-planner-aim]')?.value ?? 0)
    };
}

function updatePlannerAimLabel(value) {
    const label = elements.plannerBody?.querySelector?.('[data-planner-aim-label]');
    if (!label) return;
    const numeric = Number(value) || 0;
    if (Math.abs(numeric) < 0.5) {
        label.textContent = 'Center / default line';
        return;
    }
    label.textContent = numeric < 0
        ? `${Math.abs(numeric).toFixed(0)}m left`
        : `${numeric.toFixed(0)}m right`;
}

export function syncSpreadLegendItems(filters) {
    const f = filters ?? {};
    for (const item of elements.spreadLegendItems ?? []) {
        const key = String(item.dataset.layer ?? '').trim();
        if (!key) continue;
        const show = !!f[key];
        item.classList.toggle('legend-hidden', !show);
    }
    requestRightPanelLayout();
}

export function setHolePanelVisible(visible) {
    if (!elements.holePanel) return;
    elements.holePanel.style.display = visible ? 'block' : 'none';
    requestRightPanelLayout();
}

export function setHoleAnalyticsVisible(visible) {
    if (!elements.holeAnalyticsPanel) return;
    elements.holeAnalyticsPanel.style.display = visible ? 'block' : 'none';
    requestRightPanelLayout();
}

export function setShotPanelVisible(visible) {
    if (!elements.shotPanel) return;
    elements.shotPanel.style.display = visible ? 'block' : 'none';
    requestRightPanelLayout();
}

function scoreName(diff) {
    if (diff <= -2) return 'Eagle';
    if (diff === -1) return 'Birdie';
    if (diff === 0) return 'Par';
    if (diff === 1) return 'Bogey';
    if (diff === 2) return 'Double';
    return `+${diff}`;
}

function isPenaltyShot(shot) {
    const name = String(shot?.clubName ?? '').trim().toLowerCase();
    return Number(shot?.clubId) === 99 || name.includes('penalty');
}

function applyAnalyticsToggleState(visible) {
    if (!elements.holeAnalyticsBody) return;
    const hasDetails = String(elements.holeAnalyticsBody.textContent ?? '').trim().length > 0;
    const showDetails = !!visible && hasDetails;
    elements.holeAnalyticsBody.hidden = !showDetails;

    if (!elements.btnAnalyticsToggle) return;
    elements.btnAnalyticsToggle.textContent = showDetails ? 'Hide Details' : 'Show Details';
    elements.btnAnalyticsToggle.disabled = !hasDetails;
    elements.btnAnalyticsToggle.style.opacity = hasDetails ? '1' : '0.5';
    requestRightPanelLayout();
}

function bindPanelCollapseToggles() {
    for (const button of elements.panelToggleButtons ?? []) {
        button.addEventListener('click', () => {
            const key = String(button.dataset.panelToggle ?? '').trim();
            if (!key) return;
            togglePanelCollapsed(key);
        });
    }
}

function togglePanelCollapsed(key) {
    const config = elements.collapsiblePanels?.[key];
    if (!config?.panel) return;
    const collapsed = !config.panel.classList.contains('panel-collapsed');
    config.panel.classList.toggle('panel-collapsed', collapsed);
    syncPanelToggleButtons(key, collapsed);
    requestRightPanelLayout();
}

function syncPanelToggleButtons(key, collapsed) {
    for (const button of elements.panelToggleButtons ?? []) {
        if (button.dataset.panelToggle !== key) continue;
        button.textContent = collapsed ? '+' : '-';
        button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        button.title = collapsed ? 'Expand panel' : 'Minimize panel';
    }
}

function requestRightPanelLayout() {
    if (!elements) return;
    if (elements._layoutRaf) {
        cancelAnimationFrame(elements._layoutRaf);
    }
    elements._layoutRaf = requestAnimationFrame(() => {
        elements._layoutRaf = 0;
        layoutLeftPanels();
        layoutRightPanels();
    });
}

function layoutLeftPanels() {
    if (!isVisible(elements.holeAnalyticsPanel)) return;

    const topAnchor = isVisible(elements.holePanel)
        ? elements.holePanel.getBoundingClientRect().bottom + 12
        : 70;
    const bottomLimit = getBottomLimit();
    const collapsed = elements.holeAnalyticsPanel.classList.contains('panel-collapsed');
    const minHeight = collapsed ? 54 : 120;
    const available = Math.max(48, bottomLimit - topAnchor);

    elements.holeAnalyticsPanel.style.top = `${Math.round(topAnchor)}px`;
    elements.holeAnalyticsPanel.style.maxHeight = `${Math.max(minHeight, Math.min(available, window.innerHeight - topAnchor - 12))}px`;
}

function layoutRightPanels() {
    const shotVisible = isVisible(elements.shotPanel);
    const shotRect = shotVisible ? elements.shotPanel.getBoundingClientRect() : null;
    let nextTop = shotRect ? (shotRect.bottom + 12) : 70;

    const visiblePanels = [elements.caddiePanel, elements.plannerPanel, elements.spreadLegend, elements.geometryDebug]
        .filter(isVisible);
    const bottomLimit = getBottomLimit();
    const collapsedHeight = 54;

    visiblePanels.forEach((panel, index) => {
        const remainingPanels = visiblePanels.length - index - 1;
        const reserve = remainingPanels * (collapsedHeight + 12);
        const remainingSpace = Math.max(44, bottomLimit - nextTop);
        const collapsed = panel.classList.contains('panel-collapsed');
        const targetHeight = collapsed
            ? Math.min(collapsedHeight, remainingSpace)
            : Math.max(120, remainingSpace - reserve);

        panel.style.top = `${Math.round(nextTop)}px`;
        panel.style.maxHeight = `${Math.max(44, Math.min(targetHeight, remainingSpace))}px`;
        const h = panel.getBoundingClientRect().height;
        nextTop += h + 12;
    });
}

function getBottomLimit() {
    const candidates = [window.innerHeight - 16];
    if (isVisible(elements.scorecardBar)) {
        candidates.push(elements.scorecardBar.getBoundingClientRect().top - 12);
    }
    return Math.max(140, Math.min(...candidates));
}

function isVisible(el) {
    if (!el) return false;
    return window.getComputedStyle(el).display !== 'none';
}

function scoreColor(diff) {
    if (diff <= -2) return '#ffd700';
    if (diff === -1) return '#e53935';
    if (diff === 0) return '#4caf50';
    if (diff === 1) return '#1e88e5';
    if (diff === 2) return '#5c6bc0';
    return '#7b1fa2';
}
