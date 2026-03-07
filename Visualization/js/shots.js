import * as THREE from 'three';
import { getClubColor, getArcHeight } from './clubs.js';

let shotGroup = null;
let ballMesh = null;
let shotCurves = [];  // array of { curve, shotData }
let currentShotIdx = -1;
let animProgress = 0;
let isPlaying = false;
let animSpeed = 1.5; // seconds per shot

const BALL_RADIUS = 0.4;
const ARC_SEGMENTS = 64;

export function buildShots(scene, holeData) {
    // Clean up previous
    if (shotGroup) {
        scene.remove(shotGroup);
        shotGroup.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }

    shotGroup = new THREE.Group();
    shotCurves = [];
    currentShotIdx = -1;
    animProgress = 0;
    isPlaying = false;

    // Ball
    const ballGeom = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
    const ballMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.3, metalness: 0.1
    });
    ballMesh = new THREE.Mesh(ballGeom, ballMat);
    ballMesh.castShadow = true;
    ballMesh.position.set(0, BALL_RADIUS, 0);
    shotGroup.add(ballMesh);

    // Build curves for each shot
    holeData.shots.forEach((shot, idx) => {
        const start = new THREE.Vector3(shot.start.x, shot.start.y + BALL_RADIUS, shot.start.z);
        const end = new THREE.Vector3(shot.end.x, shot.end.y + BALL_RADIUS, shot.end.z);

        const dx = end.x - start.x;
        const dy = end.y - start.y;
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

        shotCurves.push({ curve, shot, index: idx });
    });

    scene.add(shotGroup);
}

// Show all arcs up to and including shotIndex
export function showShotsUpTo(shotIndex) {
    // Remove existing arc lines from group (keep ball)
    const toRemove = [];
    shotGroup.children.forEach(child => {
        if (child !== ballMesh) toRemove.push(child);
    });
    toRemove.forEach(c => {
        shotGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
    });

    // Draw arcs for completed shots
    for (let i = 0; i <= shotIndex && i < shotCurves.length; i++) {
        const { curve, shot } = shotCurves[i];
        const points = curve.getPoints(ARC_SEGMENTS);
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
            color: getClubColor(shot.clubId),
            linewidth: 2
        });
        const line = new THREE.Line(geom, mat);
        shotGroup.add(line);

        // Landing marker
        const endPt = points[points.length - 1];
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

    // Position ball at end of current shot
    if (shotIndex >= 0 && shotIndex < shotCurves.length) {
        const endPos = shotCurves[shotIndex].curve.getPoint(1);
        ballMesh.position.copy(endPos);
    }
}

export function goToShot(index) {
    currentShotIdx = Math.max(-1, Math.min(index, shotCurves.length - 1));
    animProgress = 1;
    isPlaying = false;

    if (currentShotIdx === -1) {
        // Reset to tee
        ballMesh.position.set(0, BALL_RADIUS, 0);
        showShotsUpTo(-1);
    } else {
        showShotsUpTo(currentShotIdx);
    }

    return currentShotIdx;
}

export function nextShot() {
    if (currentShotIdx < shotCurves.length - 1) {
        currentShotIdx++;
        animProgress = 0;
        isPlaying = true;
        // Show previous shots, animate current
        showShotsUpTo(currentShotIdx - 1);
    }
    return currentShotIdx;
}

export function prevShot() {
    return goToShot(currentShotIdx - 1);
}

export function playAll() {
    goToShot(-1);
    isPlaying = true;
    currentShotIdx = 0;
    animProgress = 0;
    showShotsUpTo(-1);
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

// Called every frame — returns true if animation is active
export function updateAnimation(deltaTime) {
    if (!isPlaying || currentShotIdx < 0 || currentShotIdx >= shotCurves.length) {
        return false;
    }

    animProgress += deltaTime / animSpeed;

    if (animProgress >= 1) {
        animProgress = 1;
        // Show completed arc
        showShotsUpTo(currentShotIdx);

        // Auto-advance to next shot
        if (currentShotIdx < shotCurves.length - 1) {
            currentShotIdx++;
            animProgress = 0;
            showShotsUpTo(currentShotIdx - 1);
        } else {
            isPlaying = false;
        }
        return true;
    }

    // Animate ball along current curve
    const { curve } = shotCurves[currentShotIdx];
    const pos = curve.getPoint(animProgress);
    ballMesh.position.copy(pos);

    // Draw partial arc
    showShotsUpTo(currentShotIdx - 1);

    // Draw partial current arc
    const partialPoints = [];
    const steps = Math.floor(animProgress * ARC_SEGMENTS);
    for (let i = 0; i <= steps; i++) {
        partialPoints.push(curve.getPoint(i / ARC_SEGMENTS));
    }
    partialPoints.push(curve.getPoint(animProgress));

    if (partialPoints.length >= 2) {
        const geom = new THREE.BufferGeometry().setFromPoints(partialPoints);
        const color = getClubColor(shotCurves[currentShotIdx].shot.clubId);
        const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
        const line = new THREE.Line(geom, mat);
        shotGroup.add(line);
    }

    return true;
}
