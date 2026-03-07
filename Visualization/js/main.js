import { createScene, frameHole } from './scene.js';
import { buildHole } from './course.js';
import { buildShots, nextShot, prevShot, togglePlay, goToShot,
         getCurrentShot, updateAnimation, getShotCount, getCurrentIndex } from './shots.js';
import { initUI, populateRoundSelector, updateHoleInfo, updateShotInfo,
         updateCourseInfo, buildScorecard, onHoleClick, setPlayIcon } from './ui.js';

let vizData = null;
let currentRoundIdx = 0;
let currentHoleIdx = 0;
let sceneCtx = null;
const clock = { last: 0 };

async function init() {
    initUI();

    // Load data
    try {
        const resp = await fetch('data/visualization_data.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        vizData = await resp.json();
    } catch (e) {
        document.getElementById('loading').textContent =
            'Could not load data/visualization_data.json — run the ArccosScraper export first.';
        console.error(e);
        return;
    }

    if (!vizData.rounds || vizData.rounds.length === 0) {
        document.getElementById('loading').textContent = 'No rounds found in data.';
        return;
    }

    // Hide loading
    document.getElementById('loading').style.display = 'none';

    // Scene
    const canvas = document.getElementById('canvas');
    sceneCtx = createScene(canvas);

    // Populate UI
    populateRoundSelector(vizData.rounds);
    loadRound(0);

    // Event wiring
    document.getElementById('round-select').addEventListener('change', e => {
        loadRound(parseInt(e.target.value));
    });
    document.getElementById('btn-prev-hole').addEventListener('click', () => changeHole(-1));
    document.getElementById('btn-next-hole').addEventListener('click', () => changeHole(1));
    document.getElementById('btn-prev-shot').addEventListener('click', () => {
        prevShot();
        updateShotInfo(getCurrentShot());
    });
    document.getElementById('btn-next-shot').addEventListener('click', () => {
        nextShot();
        updateShotInfo(getCurrentShot());
    });
    document.getElementById('btn-play').addEventListener('click', () => {
        const playing = togglePlay();
        setPlayIcon(playing);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') { nextShot(); updateShotInfo(getCurrentShot()); }
        if (e.key === 'ArrowLeft')  { prevShot(); updateShotInfo(getCurrentShot()); }
        if (e.key === 'ArrowUp')    changeHole(1);
        if (e.key === 'ArrowDown')  changeHole(-1);
        if (e.key === ' ') { e.preventDefault(); togglePlay(); setPlayIcon(true); }
    });

    onHoleClick(idx => {
        currentHoleIdx = idx;
        loadHole();
    });

    // Render loop
    clock.last = performance.now();
    requestAnimationFrame(animate);
}

function loadRound(idx) {
    currentRoundIdx = idx;
    currentHoleIdx = 0;
    const round = vizData.rounds[currentRoundIdx];
    updateCourseInfo(round);
    buildScorecard(round.holes, currentHoleIdx);
    loadHole();
}

function loadHole() {
    const round = vizData.rounds[currentRoundIdx];
    const hole = round.holes[currentHoleIdx];

    buildHole(sceneCtx.scene, hole);
    buildShots(sceneCtx.scene, hole);
    frameHole(sceneCtx.camera, sceneCtx.controls, hole);
    updateHoleInfo(hole);
    updateShotInfo(null);
    buildScorecard(round.holes, currentHoleIdx);
    goToShot(-1);
    setPlayIcon(false);
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

    const animating = updateAnimation(delta);
    if (animating) {
        updateShotInfo(getCurrentShot());
    }

    sceneCtx.controls.update();
    sceneCtx.renderer.render(sceneCtx.scene, sceneCtx.camera);
}

// Boot
init();
