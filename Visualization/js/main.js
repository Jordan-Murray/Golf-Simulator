import { createScene, frameHole, focusCameraForPutt } from './scene.js?v=20260309h';
import { buildHole } from './course.js?v=20260309h';
import { buildShots, nextShot, prevShot, togglePlay, goToShot, getCurrentShot, updateAnimation, getShotCount, getPlaybackValue, seekPlayback, setCinematicMode, getBallPositionXZ } from './shots.js?v=20260309h';
import { initUI, populateRoundSelector, updateHoleInfo, updateShotInfo, updateCourseInfo, buildScorecard, onHoleClick, setPlayIcon, updateGeometryDebug, setTimelineBounds, setTimelineValue, onTimelineInput, onCinematicModeChange, setGeometryDebugVisible } from './ui.js?v=20260309h';

let vizData = null;
let geometryData = null;
let currentRoundIdx = 0;
let currentHoleIdx = 0;
let currentHoleForRender = null;
let currentHoleGeometry = null;
let cameraPuttMode = false;
let cameraUserOverrideUntil = 0;
let geometryDebugVisible = false;
let sceneCtx = null;
const clock = { last: 0 };
const FORCE_GEOMETRY_FLIP_180 = false;
const STRICT_VISUAL_ANCHOR_MODE = false;
const AUTO_MIRROR_GEOMETRY = false;

async function init() {
    initUI();
    setGeometryDebugVisible(geometryDebugVisible);

    try {
        const resp = await fetch('data/visualization_data.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        vizData = await resp.json();
    } catch (e) {
        document.getElementById('loading').textContent =
            'Could not load data/visualization_data.json - run the ArccosScraper export first.';
        console.error(e);
        return;
    }

    try {
        const geometryResp = await fetch('data/course_geometry.json');
        if (geometryResp.ok) {
            geometryData = await geometryResp.json();
        }
    } catch {
        geometryData = null;
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
        prevShot();
        const shot = getCurrentShot();
        updateShotInfo(shot);
        syncShotCamera(1 / 60, shot);
        setTimelineValue(getPlaybackValue(), shot);
    });
    document.getElementById('btn-next-shot').addEventListener('click', () => {
        nextShot();
        const shot = getCurrentShot();
        updateShotInfo(shot);
        syncShotCamera(1 / 60, shot);
        setTimelineValue(getPlaybackValue(), shot);
    });
    document.getElementById('btn-play').addEventListener('click', () => {
        const playing = togglePlay();
        setPlayIcon(playing);
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') {
            nextShot();
            const shot = getCurrentShot();
            updateShotInfo(shot);
            syncShotCamera(1 / 60, shot);
            setTimelineValue(getPlaybackValue(), shot);
        }
        if (e.key === 'ArrowLeft') {
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
            const playing = togglePlay();
            setPlayIcon(playing);
        }
        if (e.key.toLowerCase() === 'g') {
            geometryDebugVisible = !geometryDebugVisible;
            setGeometryDebugVisible(geometryDebugVisible);
        }
    });

    onHoleClick(idx => {
        currentHoleIdx = idx;
        loadHole();
    });

    onTimelineInput(value => {
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
    setCinematicMode(true);

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
    const geometryStatus = inspectHoleGeometry(round, hole);
    const aligned = alignHoleGeometryToHole(geometryStatus.holeGeometry, hole);
    const holeGeometry = aligned.geometry;
    const holeForRender = getHoleForRender(hole, holeGeometry);
    currentHoleForRender = holeForRender;
    currentHoleGeometry = holeGeometry;
    cameraPuttMode = false;
    aligned.holePin = hole?.pin ? [Number(hole.pin.x), Number(hole.pin.z)] : null;
    const greenCenter = centroid(holeGeometry?.green);
    aligned.renderPin = holeForRender?.pin ? [Number(holeForRender.pin.x), Number(holeForRender.pin.z)] : null;
    aligned.greenCenter = greenCenter;
    aligned.renderPinDelta = (greenCenter && aligned.renderPin)
        ? Math.hypot(aligned.renderPin[0] - greenCenter[0], aligned.renderPin[1] - greenCenter[1])
        : null;

    clearDynamicSceneGroups(sceneCtx.scene);
    buildHole(sceneCtx.scene, holeForRender, holeGeometry);
    buildShots(sceneCtx.scene, hole);
    setTimelineBounds(getShotCount());
    const sceneDiag = inspectSceneGroups(sceneCtx.scene);
    frameHole(sceneCtx.camera, sceneCtx.controls, holeForRender, holeGeometry);
    updateHoleInfo(hole);
    updateShotInfo(null);
    buildScorecard(round.holes, currentHoleIdx);
    goToShot(-1);
    setPlayIcon(false);
    setTimelineValue(0, null);
    updateGeometryDebug(formatGeometryDebug(geometryStatus, aligned, sceneDiag));
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
    const activeShot = getCurrentShot();
    if (animating) {
        updateShotInfo(activeShot);
    }
    syncShotCamera(delta, activeShot);
    setTimelineValue(getPlaybackValue(), activeShot);

    sceneCtx.controls.update();
    sceneCtx.renderer.render(sceneCtx.scene, sceneCtx.camera);
}

init();

function syncShotCamera(deltaTime, shot = null) {
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
        lines.push(` pinOffsetFix: dx=${aligned.pinOffsetDx.toFixed(1)}, dz=${aligned.pinOffsetDz.toFixed(1)}`);
        lines.push(` teeOffsetFix: dx=${aligned.teeOffsetDx.toFixed(1)}, dz=${aligned.teeOffsetDz.toFixed(1)}`);
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
    lines.push(` fairway polygon: ${pointCount(g.fairway)}`);
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

    const sourceTee = centroid(holeGeometry.tee) ?? centroid(holeGeometry.fairway) ?? [0, 0];
    const sourceTarget = centroid(holeGeometry.green) ?? centroid(holeGeometry.fairway);
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

    const scored = candidates.map(c =>
    {
        const geometry = transformGeometry(holeGeometry, sourceTee, targetTee, scale, c.cos, c.sin, c.mirrored, srcUnit);
        return { ...c, geometry, score: scoreGeometryFit(geometry, hole) };
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
        teeOffsetDz: movedToTee.dz
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
            fairway: shiftPoly(geometry.fairway),
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
    const c = centroid(geometry?.tee) ?? centroid(geometry?.fairway);
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
            fairway: shiftPoly(geometry.fairway),
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

    return {
        ...holeGeometry,
        tee: mapPolygon(holeGeometry.tee),
        fairway: mapPolygon(holeGeometry.fairway),
        green: mapPolygon(holeGeometry.green),
        bunkers: mapPolygons(holeGeometry.bunkers),
        water: mapPolygons(holeGeometry.water),
        trees: mapPolygon(holeGeometry.trees)
    };
}

function scoreGeometryFit(geometry, hole) {
    const fairway = Array.isArray(geometry?.fairway) ? geometry.fairway : null;
    const green = Array.isArray(geometry?.green) ? geometry.green : null;
    const polygons = [fairway, green].filter(p => Array.isArray(p) && p.length >= 3);
    if (polygons.length === 0) return Number.POSITIVE_INFINITY;

    const shotEnds = (hole.shots ?? [])
        .filter(s => Number(s.clubId) !== 13)
        .map(s => [Number(s.end.x), Number(s.end.z)])
        .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (shotEnds.length === 0) return Number.POSITIVE_INFINITY;

    let sum = 0;
    for (const p of shotEnds) {
        let best = Number.POSITIVE_INFINITY;
        for (const poly of polygons) {
            best = Math.min(best, distancePointToPolygon2D(p, poly));
        }
        sum += Math.min(best, 200);
    }
    return sum / shotEnds.length;
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
