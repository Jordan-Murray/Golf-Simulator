// DOM-based UI for the 3D viewer

let elements = {};

export function initUI() {
    elements = {
        courseName:   document.getElementById('course-name'),
        roundInfo:    document.getElementById('round-info'),
        holeTitle:    document.getElementById('hole-title'),
        holePar:      document.getElementById('hole-par'),
        holeScore:    document.getElementById('hole-score'),
        shotInfo:     document.getElementById('shot-info'),
        shotClub:     document.getElementById('shot-club'),
        shotDist:     document.getElementById('shot-dist'),
        shotNum:      document.getElementById('shot-num'),
        scorecard:    document.getElementById('scorecard'),
        roundSelect:  document.getElementById('round-select'),
        btnPrevHole:  document.getElementById('btn-prev-hole'),
        btnNextHole:  document.getElementById('btn-next-hole'),
        btnPrevShot:  document.getElementById('btn-prev-shot'),
        btnNextShot:  document.getElementById('btn-next-shot'),
        btnPlay:      document.getElementById('btn-play'),
    };
}

export function populateRoundSelector(rounds) {
    elements.roundSelect.innerHTML = '';
    rounds.forEach((round, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `${round.courseName} — ${round.date} (${round.totalScore})`;
        elements.roundSelect.appendChild(opt);
    });
}

export function updateHoleInfo(hole) {
    elements.holeTitle.textContent = `Hole ${hole.holeNumber}`;
    elements.holePar.textContent = `Par ${hole.par}`;

    const diff = hole.score - hole.par;
    const label = scoreName(diff);
    const color = scoreColor(diff);
    elements.holeScore.textContent = `${hole.score} (${label})`;
    elements.holeScore.style.color = color;
}

export function updateShotInfo(shot) {
    if (!shot) {
        elements.shotClub.textContent = '—';
        elements.shotDist.textContent = '—';
        elements.shotNum.textContent = 'On the tee';
        return;
    }
    elements.shotClub.textContent = shot.clubName;
    elements.shotDist.textContent = `${shot.distance} yds`;
    elements.shotNum.textContent = `Shot ${shot.shotNumber}`;
}

export function updateCourseInfo(round) {
    elements.courseName.textContent = round.courseName;
    elements.roundInfo.textContent = `${round.date}  |  Score: ${round.totalScore}`;
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
    elements.btnPlay.textContent = playing ? '⏸' : '▶';
}

function scoreName(diff) {
    if (diff <= -2) return 'Eagle';
    if (diff === -1) return 'Birdie';
    if (diff === 0)  return 'Par';
    if (diff === 1)  return 'Bogey';
    if (diff === 2)  return 'Double';
    return `+${diff}`;
}

function scoreColor(diff) {
    if (diff <= -2) return '#ffd700';
    if (diff === -1) return '#e53935';
    if (diff === 0)  return '#4caf50';
    if (diff === 1)  return '#1e88e5';
    if (diff === 2)  return '#5c6bc0';
    return '#7b1fa2';
}
