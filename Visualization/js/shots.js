import * as THREE from 'three';
import { getClubColor, getArcHeight } from './clubs.js';

let shotGroup = null;
let ballMesh = null;
let ballGroundMarker = null;
let shotCurves = [];  // array of { curve, shotData }
let currentShotIdx = -1;
let animProgress = 0;
let isPlaying = false;
let animSpeed = 1.5; // seconds per shot
let cinematicMode = false;
let revealDelayRemaining = 0;
let finalPuttIdx = -1;

const BALL_RADIUS = 0.2;
const ARC_SEGMENTS = 64;
const SHOT_GROUP_TAG = 'golf-shot-group';

export function buildShots(scene, holeData) {
    removeTaggedGroups(scene, SHOT_GROUP_TAG);

    shotGroup = new THREE.Group();
    shotGroup.userData.tag = SHOT_GROUP_TAG;
    shotCurves = [];
    currentShotIdx = -1;
    animProgress = 0;
    isPlaying = false;
    revealDelayRemaining = 0;
    finalPuttIdx = -1;

    // Ball
    const ballGeom = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
    const ballMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.35, metalness: 0.08, emissive: 0x2a2a2a
    });
    ballMesh = new THREE.Mesh(ballGeom, ballMat);
    ballMesh.castShadow = true;
    ballMesh.position.set(0, BALL_RADIUS, 0);
    shotGroup.add(ballMesh);

    const markerGeom = new THREE.RingGeometry(0.12, 0.3, 18);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    ballGroundMarker = new THREE.Mesh(markerGeom, markerMat);
    ballGroundMarker.rotation.x = -Math.PI / 2;
    ballGroundMarker.position.set(0, 0.05, 0);
    shotGroup.add(ballGroundMarker);

    let prevEnd = null;

    finalPuttIdx = findFinalPuttIndex(holeData.shots ?? []);

    // Build curves for each shot
    holeData.shots.forEach((shot, idx) => {
        let start = new THREE.Vector3(shot.start.x, shot.start.y + BALL_RADIUS, shot.start.z);
        const end = new THREE.Vector3(shot.end.x, shot.end.y + BALL_RADIUS, shot.end.z);

        // Keep putts visually continuous so the ball rolls from where the previous shot finished.
        if (shot.clubId === 13 && prevEnd) {
            start = prevEnd.clone();
            start.y = Math.max(start.y, BALL_RADIUS);
        }
        if (shot.clubId === 13) {
            const puttY = Math.max(start.y, BALL_RADIUS + 0.06);
            start.y = puttY;
            end.y = puttY;
            // Make the final putt finish at the cup so the replay always shows a satisfying hole-out.
            if (idx === finalPuttIdx && holeData?.pin) {
                end.x = Number(holeData.pin.x);
                end.z = Number(holeData.pin.z);
            }
        }

        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        const peakHeight = getArcHeight(shot.clubId, dist);
        const mid = new THREE.Vector3(
            (start.x + end.x) / 2,
            Math.max(start.y, end.y) + peakHeight,
            (start.z + end.z) / 2
        );

        let curve;
        if (shot.clubId === 13 || peakHeight < 0.5) {
            // Putter: straight line along ground
            curve = new THREE.LineCurve3(start, end);
        } else {
            curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        }

        shotCurves.push({ curve, shot, index: idx, start, end });
        prevEnd = end.clone();
    });

    scene.add(shotGroup);
}

export function buildShotSpread(scene, holes, options = {}) {
    removeTaggedGroups(scene, SHOT_GROUP_TAG);

    shotGroup = new THREE.Group();
    shotGroup.userData.tag = SHOT_GROUP_TAG;
    shotCurves = [];
    currentShotIdx = -1;
    animProgress = 0;
    isPlaying = false;
    revealDelayRemaining = 0;
    ballMesh = null;
    ballGroundMarker = null;
    finalPuttIdx = -1;

    const spreadShots = [];
    for (const hole of holes ?? []) {
        for (const shot of hole.shots ?? []) {
            if (!includeSpreadShot(shot, options)) continue;
            const start = new THREE.Vector3(Number(shot.start?.x ?? 0), 0.15, Number(shot.start?.z ?? 0));
            const end = new THREE.Vector3(Number(shot.end?.x ?? 0), 0.15, Number(shot.end?.z ?? 0));
            addSpreadLine(start, end, shot.clubId);
            spreadShots.push({ start, end, clubId: shot.clubId });
        }
    }
    if (options.heatmap) {
        buildSpreadHeatmap(spreadShots);
    }

    scene.add(shotGroup);
}

function includeSpreadShot(shot, options) {
    const clubFilter = String(options.club ?? 'all');
    if (clubFilter === 'tee') {
        return Number(shot.shotNumber) === 1;
    }
    if (clubFilter !== 'all') {
        return Number(shot.clubId) === Number(clubFilter);
    }
    return true;
}

function addSpreadLine(start, end, clubId) {
    const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
        color: getClubColor(clubId),
        transparent: true,
        opacity: 0.25
    });
    const line = new THREE.Line(geom, mat);
    shotGroup.add(line);

    const markerGeom = new THREE.CircleGeometry(0.45, 12);
    const markerMat = new THREE.MeshBasicMaterial({
        color: getClubColor(clubId),
        transparent: true,
        opacity: 0.35
    });
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(end.x, 0.08, end.z);
    shotGroup.add(marker);
}

function buildSpreadHeatmap(spreadShots) {
    if (!spreadShots || spreadShots.length === 0) return;
    const cellSize = 9;
    const counts = new Map();

    for (const s of spreadShots) {
        const x = s.end.x;
        const z = s.end.z;
        const gx = Math.round(x / cellSize);
        const gz = Math.round(z / cellSize);
        const key = `${gx},${gz}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const max = Math.max(...counts.values(), 1);
    for (const [key, count] of counts.entries()) {
        const [gx, gz] = key.split(',').map(Number);
        const x = gx * cellSize;
        const z = gz * cellSize;
        const t = count / max;
        const radius = 2.4 + t * 6.4;
        const color = heatColor(t);

        const geom = new THREE.CircleGeometry(radius, 24);
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.12 + t * 0.2
        });
        const blob = new THREE.Mesh(geom, mat);
        blob.rotation.x = -Math.PI / 2;
        blob.position.set(x, 0.07, z);
        shotGroup.add(blob);
    }
}

function heatColor(t) {
    const hot = new THREE.Color(0xff3d00);
    const cold = new THREE.Color(0x29b6f6);
    return cold.lerp(hot, Math.max(0, Math.min(1, t)));
}

function removeTaggedGroups(scene, tag) {
    const stale = scene.children.filter(
        child => child?.userData?.tag === tag
    );
    for (const group of stale) {
        scene.remove(group);
        group.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }
}

// Show all arcs up to and including shotIndex
export function showShotsUpTo(shotIndex) {
    clearShotVisuals();
    for (let i = 0; i <= shotIndex && i < shotCurves.length; i++) {
        drawCurveSegment(shotCurves[i], 1);
    }
    if (shotIndex >= 0 && shotIndex < shotCurves.length) {
        ballMesh.position.copy(shotCurves[shotIndex].curve.getPoint(1));
        if (ballGroundMarker) {
            ballGroundMarker.position.set(ballMesh.position.x, 0.05, ballMesh.position.z);
        }
    }
}

function clearShotVisuals() {
    const toRemove = [];
    shotGroup.children.forEach(child => {
        if (child !== ballMesh && child !== ballGroundMarker) toRemove.push(child);
    });
    toRemove.forEach(c => {
        shotGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
    });
}

function drawCurveSegment(entry, progress = 1) {
    const { curve, shot } = entry;
    const t = Math.max(0, Math.min(1, progress));
    if (t <= 0) return;
    const steps = Math.max(2, Math.floor(ARC_SEGMENTS * t));
    const points = [];
    for (let i = 0; i <= steps; i++) {
        points.push(curve.getPoint((i / steps) * t));
    }

    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
        color: getClubColor(shot.clubId),
        linewidth: 2
    });
    const line = new THREE.Line(geom, mat);
    shotGroup.add(line);

    if (t >= 1) {
        const endPt = curve.getPoint(1);
        const markerGeom = new THREE.RingGeometry(0.3, 0.6, 16);
        const markerMat = new THREE.MeshBasicMaterial({
            color: getClubColor(shot.clubId),
            side: THREE.DoubleSide
        });
        const marker = new THREE.Mesh(markerGeom, markerMat);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(endPt.x, 0.05, endPt.z);
        shotGroup.add(marker);
    }
}

function renderPlaybackState() {
    if (!ballMesh) return;
    if (currentShotIdx < 0) {
        ballMesh.position.set(0, BALL_RADIUS, 0);
        if (ballGroundMarker) ballGroundMarker.position.set(0, 0.05, 0);
        clearShotVisuals();
        return;
    }

    const safeIdx = Math.max(0, Math.min(currentShotIdx, shotCurves.length - 1));
    const t = Math.max(0, Math.min(1, animProgress));
    showShotsUpTo(safeIdx - 1);
    drawCurveSegment(shotCurves[safeIdx], t);
    const ballPos = shotCurves[safeIdx].curve.getPoint(t);
    // Tiny sink animation on the final putt so the ball visibly drops into the cup.
    if (safeIdx === finalPuttIdx && t > 0.92) {
        const sinkT = Math.min(1, (t - 0.92) / 0.08);
        ballPos.y -= sinkT * (BALL_RADIUS * 1.35);
    }
    ballMesh.position.copy(ballPos);
    if (ballGroundMarker) {
        const hideMarker = safeIdx === finalPuttIdx && t > 0.92;
        ballGroundMarker.visible = !hideMarker;
        ballGroundMarker.position.set(ballMesh.position.x, 0.05, ballMesh.position.z);
    }
}

export function goToShot(index) {
    currentShotIdx = Math.max(-1, Math.min(index, shotCurves.length - 1));
    animProgress = 1;
    isPlaying = false;
    revealDelayRemaining = 0;
    renderPlaybackState();
    return currentShotIdx;
}

export function nextShot() {
    if (currentShotIdx < shotCurves.length - 1) {
        currentShotIdx++;
        animProgress = 0;
        isPlaying = true;
        renderPlaybackState();
    }
    return currentShotIdx;
}

export function prevShot() {
    return goToShot(currentShotIdx - 1);
}

export function playAll() {
    seekPlayback(0);
    isPlaying = true;
    currentShotIdx = 0;
    animProgress = 0;
    revealDelayRemaining = 0;
    renderPlaybackState();
}

export function togglePlay() {
    if (currentShotIdx >= shotCurves.length - 1 && animProgress >= 1) {
        // Restart
        playAll();
        return true;
    }
    isPlaying = !isPlaying;
    if (isPlaying && animProgress >= 1) {
        nextShot();
    }
    return isPlaying;
}

export function getCurrentShot() {
    if (currentShotIdx >= 0 && currentShotIdx < shotCurves.length) {
        return shotCurves[currentShotIdx].shot;
    }
    return null;
}

export function getShotCount() {
    return shotCurves.length;
}

export function getCurrentIndex() {
    return currentShotIdx;
}

export function getPlaybackValue() {
    if (currentShotIdx < 0) return 0;
    return currentShotIdx + Math.max(0, Math.min(1, animProgress));
}

export function seekPlayback(value) {
    const total = shotCurves.length;
    const v = Math.max(0, Math.min(Number(value) || 0, total));
    isPlaying = false;
    revealDelayRemaining = 0;

    if (v <= 0 || total === 0) {
        currentShotIdx = -1;
        animProgress = 1;
        renderPlaybackState();
        return currentShotIdx;
    }

    let idx = Math.floor(v);
    let frac = v - idx;
    if (v >= total) {
        idx = total - 1;
        frac = 1;
    }

    currentShotIdx = Math.max(0, Math.min(idx, total - 1));
    animProgress = Math.max(0, Math.min(1, frac));
    renderPlaybackState();
    return currentShotIdx;
}

export function setCinematicMode(enabled) {
    cinematicMode = !!enabled;
}

export function getBallPositionXZ() {
    if (!ballMesh) return null;
    return { x: Number(ballMesh.position.x), z: Number(ballMesh.position.z) };
}

function findFinalPuttIndex(shots) {
    if (!Array.isArray(shots) || shots.length === 0) return -1;
    for (let i = shots.length - 1; i >= 0; i--) {
        if (Number(shots[i]?.clubId) === 13) return i;
    }
    return -1;
}

function currentShotDuration() {
    const shot = getCurrentShot();
    if (!shot) return animSpeed;
    const isPutt = Number(shot.clubId) === 13;
    if (!cinematicMode) return animSpeed;
    return isPutt ? 2.8 : 1.9;
}

function currentRevealDelay() {
    const shot = getCurrentShot();
    if (!shot || !cinematicMode) return 0;
    const isPutt = Number(shot.clubId) === 13;
    return isPutt ? 1.2 : 0.2;
}

// Called every frame — returns true if animation is active
export function updateAnimation(deltaTime) {
    if (!isPlaying || currentShotIdx < 0 || currentShotIdx >= shotCurves.length) {
        return false;
    }

    if (revealDelayRemaining > 0) {
        revealDelayRemaining -= deltaTime;
        if (revealDelayRemaining > 0) {
            return true;
        }
        revealDelayRemaining = 0;
        if (currentShotIdx < shotCurves.length - 1) {
            currentShotIdx++;
            animProgress = 0;
            renderPlaybackState();
            return true;
        }
        isPlaying = false;
        return true;
    }

    animProgress += deltaTime / currentShotDuration();

    if (animProgress >= 1) {
        animProgress = 1;
        renderPlaybackState();
        revealDelayRemaining = currentRevealDelay();
        if (revealDelayRemaining <= 0) {
            if (currentShotIdx < shotCurves.length - 1) {
                currentShotIdx++;
                animProgress = 0;
                renderPlaybackState();
            } else {
                isPlaying = false;
            }
        }
        return true;
    }

    renderPlaybackState();

    return true;
}
