let elements = {};

export function initUI() {
    elements = {
        courseName: document.getElementById('course-name'),
        roundInfo: document.getElementById('round-info'),
        holeTitle: document.getElementById('hole-title'),
        holePar: document.getElementById('hole-par'),
        holeScore: document.getElementById('hole-score'),
        holeAnalyticsBody: document.getElementById('hole-analytics-body'),
        shotPanel: document.getElementById('shot-panel'),
        shotClub: document.getElementById('shot-club'),
        shotDist: document.getElementById('shot-dist'),
        shotNote: document.getElementById('shot-note'),
        shotNum: document.getElementById('shot-num'),
        caddiePanel: document.getElementById('caddie-panel'),
        caddieBody: document.getElementById('caddie-body'),
        geometryDebug: document.getElementById('geometry-debug'),
        geometryDebugBody: document.getElementById('geometry-debug-body'),
        scorecard: document.getElementById('scorecard'),
        roundSelect: document.getElementById('round-select'),
        spreadMode: document.getElementById('spread-mode'),
        spreadClub: document.getElementById('spread-club'),
        spreadRange: document.getElementById('spread-range'),
        spreadHeatmap: document.getElementById('spread-heatmap'),
        btnBestHole: document.getElementById('btn-best-hole'),
        btnWorstHole: document.getElementById('btn-worst-hole'),
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
        cinematicMode: document.getElementById('cinematic-mode')
    };
}

export function populateRoundSelector(rounds) {
    elements.roundSelect.innerHTML = '';
    rounds.forEach((round, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `${round.courseName} - ${round.date} (${round.totalScore})`;
        elements.roundSelect.appendChild(opt);
    });
}

export function setRoundSelection(idx) {
    if (!elements.roundSelect) return;
    elements.roundSelect.value = String(idx);
}

export function updateHoleInfo(hole) {
    elements.holeTitle.textContent = `Hole ${hole.holeNumber}`;
    elements.holePar.textContent = `Par ${hole.par}`;

    const diff = hole.score - hole.par;
    elements.holeScore.textContent = `${hole.score} (${scoreName(diff)})`;
    elements.holeScore.style.color = scoreColor(diff);
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
        range: elements.spreadRange?.value ?? '20',
        heatmap: !!elements.spreadHeatmap?.checked
    };
}

export function onSpreadFiltersChange(cb) {
    const emit = () => cb(getSpreadFilters());
    if (elements.spreadClub) elements.spreadClub.addEventListener('change', emit);
    if (elements.spreadRange) elements.spreadRange.addEventListener('change', emit);
    if (elements.spreadHeatmap) elements.spreadHeatmap.addEventListener('change', emit);
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
}

export function setGeometryDebugVisible(visible) {
    if (!elements.geometryDebug) return;
    elements.geometryDebug.style.display = visible ? 'block' : 'none';
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

export function updateHoleAnalytics(text) {
    if (!elements.holeAnalyticsBody) return;
    elements.holeAnalyticsBody.textContent = text;
}

export function updateCaddiePlan(text) {
    if (!elements.caddieBody) return;
    elements.caddieBody.textContent = text;
}

export function setCaddieVisible(visible) {
    if (!elements.caddiePanel) return;
    elements.caddiePanel.style.display = visible ? 'block' : 'none';
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

function scoreColor(diff) {
    if (diff <= -2) return '#ffd700';
    if (diff === -1) return '#e53935';
    if (diff === 0) return '#4caf50';
    if (diff === 1) return '#1e88e5';
    if (diff === 2) return '#5c6bc0';
    return '#7b1fa2';
}
