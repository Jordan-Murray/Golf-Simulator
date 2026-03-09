let elements = {};

export function initUI() {
    elements = {
        courseName: document.getElementById('course-name'),
        roundInfo: document.getElementById('round-info'),
        holeTitle: document.getElementById('hole-title'),
        holePar: document.getElementById('hole-par'),
        holeScore: document.getElementById('hole-score'),
        holeAnalyticsBody: document.getElementById('hole-analytics-body'),
        shotClub: document.getElementById('shot-club'),
        shotDist: document.getElementById('shot-dist'),
        shotNum: document.getElementById('shot-num'),
        geometryDebug: document.getElementById('geometry-debug'),
        geometryDebugBody: document.getElementById('geometry-debug-body'),
        scorecard: document.getElementById('scorecard'),
        roundSelect: document.getElementById('round-select'),
        spreadMode: document.getElementById('spread-mode'),
        spreadClub: document.getElementById('spread-club'),
        spreadRange: document.getElementById('spread-range'),
        spreadHeatmap: document.getElementById('spread-heatmap'),
        btnBestHole: document.getElementById('btn-best-hole'),
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
        return;
    }

    elements.shotClub.textContent = shot.clubName;
    elements.shotDist.textContent = `${shot.distance} yds`;
    elements.shotNum.textContent = `Shot ${shot.shotNumber}`;
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

function scoreName(diff) {
    if (diff <= -2) return 'Eagle';
    if (diff === -1) return 'Birdie';
    if (diff === 0) return 'Par';
    if (diff === 1) return 'Bogey';
    if (diff === 2) return 'Double';
    return `+${diff}`;
}

function scoreColor(diff) {
    if (diff <= -2) return '#ffd700';
    if (diff === -1) return '#e53935';
    if (diff === 0) return '#4caf50';
    if (diff === 1) return '#1e88e5';
    if (diff === 2) return '#5c6bc0';
    return '#7b1fa2';
}
