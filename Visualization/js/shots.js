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
    ballMesh.position.copy(shotCurves[safeIdx].curve.getPoint(t));
    if (ballGroundMarker) {
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
