import * as THREE from 'three';

const COLORS = {
    rough: 0x2e7d32,
    fairway: 0x3fa45b,
    green: 0xc8ff7a,
    tee: 0xffd54f,
    bunker: 0xd2b48c,
    water: 0x2a6fb0,
    pin: 0xffffff,
    flag: 0xe53935
};
const COURSE_GROUP_TAG = 'golf-course-group';

let courseGroup = null;

export function buildHole(scene, holeData, holeGeometry = null) {
    removeTaggedGroups(scene, COURSE_GROUP_TAG);

    courseGroup = new THREE.Group();
    courseGroup.userData.tag = COURSE_GROUP_TAG;

    const tee = new THREE.Vector2(0, 0);
    const pin = resolvePinForRender(holeData, holeGeometry);
    const bounds = computeBounds(holeData, holeGeometry, pin);

    const holeVec = pin.clone().sub(tee);
    const holeLength = Math.max(120, holeVec.length());
    const dir = holeVec.length() > 0.1 ? holeVec.clone().normalize() : new THREE.Vector2(0, 1);
    const angle = Math.atan2(dir.x, dir.y);

    buildRough(bounds);

    if (!tryBuildGeometryHole(holeGeometry)) {
        buildFairwayFallback(tee, angle, holeLength);
        buildGreenFallback(pin);
    }

    buildTeeBox(tee, angle, holeGeometry?.tee);
    buildPin(pin);
    buildTrees(bounds, holeGeometry);

    scene.add(courseGroup);
}

function removeTaggedGroups(scene, tag) {
    const stale = scene.children.filter(
        child => child?.userData?.tag === tag
    );
    for (const group of stale) {
        scene.remove(group);
        disposeGroup(group);
    }
}

function disposeGroup(group) {
    group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
        }
    });
}

function resolvePinForRender(holeData, holeGeometry) {
    const green = asPointArray(holeGeometry?.green);
    if (green.length >= 3) {
        let sx = 0;
        let sz = 0;
        for (const p of green) {
            sx += p.x;
            sz += p.z;
        }
        return new THREE.Vector2(sx / green.length, sz / green.length);
    }

    return new THREE.Vector2(holeData.pin.x, holeData.pin.z);
}

function tryBuildGeometryHole(holeGeometry) {
    if (!holeGeometry) return false;

    let hasAny = false;
    if (isPolygon(holeGeometry.fairway)) {
        createGroundPolygon(holeGeometry.fairway, COLORS.fairway, 0.0);
        addPolygonOutline(holeGeometry.fairway, 0x0f5f2f, 0.06);
        hasAny = true;
    }
    if (isPolygon(holeGeometry.green)) {
        createGroundPolygon(holeGeometry.green, COLORS.green, 0.04);
        addPolygonOutline(holeGeometry.green, 0xe8ffd0, 0.07);
        hasAny = true;
    }
    for (const bunker of asPolygonArray(holeGeometry.bunkers)) {
        createGroundPolygon(bunker, COLORS.bunker, 0.015);
        hasAny = true;
    }
    for (const water of asPolygonArray(holeGeometry.water)) {
        createGroundPolygon(water, COLORS.water, -0.01);
        hasAny = true;
    }

    return hasAny;
}

function computeBounds(holeData, holeGeometry, pin) {
    const xs = [0, pin.x];
    const zs = [0, pin.y];

    for (const shot of holeData.shots ?? []) {
        xs.push(shot.start.x, shot.end.x);
        zs.push(shot.start.z, shot.end.z);
    }

    for (const p of getGeometryPoints(holeGeometry)) {
        xs.push(p.x);
        zs.push(p.z);
    }

    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
        centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
        centerZ: (Math.min(...zs) + Math.max(...zs)) / 2
    };
}

function buildRough(bounds) {
    const width = Math.max(180, bounds.maxX - bounds.minX + 140);
    const depth = Math.max(220, bounds.maxZ - bounds.minZ + 140);

    const rough = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshStandardMaterial({ color: COLORS.rough, roughness: 0.95, metalness: 0 })
    );
    rough.rotation.x = -Math.PI / 2;
    rough.position.set(bounds.centerX, -0.05, bounds.centerZ);
    rough.receiveShadow = true;
    courseGroup.add(rough);
}

function buildFairwayFallback(tee, angle, holeLength) {
    const fwShape = new THREE.Shape();
    const startHalfWidth = 20;
    const endHalfWidth = 13;
    const extraBehindTee = 8;

    fwShape.moveTo(-startHalfWidth, -extraBehindTee);
    fwShape.lineTo(-startHalfWidth, holeLength * 0.55);
    fwShape.quadraticCurveTo(-endHalfWidth, holeLength * 0.83, -endHalfWidth, holeLength);
    fwShape.lineTo(endHalfWidth, holeLength);
    fwShape.quadraticCurveTo(endHalfWidth, holeLength * 0.83, startHalfWidth, holeLength * 0.55);
    fwShape.lineTo(startHalfWidth, -extraBehindTee);
    fwShape.closePath();

    const fairway = new THREE.Mesh(
        new THREE.ShapeGeometry(fwShape),
        new THREE.MeshStandardMaterial({ color: COLORS.fairway, roughness: 0.85, metalness: 0 })
    );
    fairway.rotation.x = -Math.PI / 2;
    fairway.rotation.y = angle;
    fairway.position.set(tee.x, 0, tee.y);
    fairway.receiveShadow = true;
    courseGroup.add(fairway);
}

function buildGreenFallback(pin) {
    const green = new THREE.Mesh(
        new THREE.CircleGeometry(13, 48),
        new THREE.MeshStandardMaterial({ color: COLORS.green, roughness: 0.7, metalness: 0 })
    );
    green.rotation.x = -Math.PI / 2;
    green.position.set(pin.x, 0.02, pin.y);
    green.receiveShadow = true;
    courseGroup.add(green);
}

function buildTeeBox(tee, angle, teePolygon = null) {
    if (isPolygon(teePolygon)) {
        createGroundPolygon(teePolygon, COLORS.tee, 0.05);
        addPolygonOutline(teePolygon, 0xfff8d6, 0.08);
        return;
    }

    const teeBox = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 5),
        new THREE.MeshStandardMaterial({ color: COLORS.tee, roughness: 0.8, metalness: 0 })
    );
    teeBox.rotation.x = -Math.PI / 2;
    teeBox.rotation.y = angle;
    teeBox.position.set(tee.x, 0.01, tee.y);
    teeBox.receiveShadow = true;
    courseGroup.add(teeBox);

    const markerGeom = new THREE.SphereGeometry(0.3, 8, 8);
    const markerMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    [-2, 2].forEach(x => {
        const marker = new THREE.Mesh(markerGeom, markerMat);
        marker.position.set(tee.x + x, 0.3, tee.y - 1);
        courseGroup.add(marker);
    });
}

function buildPin(pin) {
    const lip = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.24, 24),
        new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.35,
            metalness: 0.05,
            side: THREE.DoubleSide
        })
    );
    lip.rotation.x = -Math.PI / 2;
    lip.position.set(pin.x, 0.046, pin.y);
    courseGroup.add(lip);

    const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.16, 24),
        new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 1.0, metalness: 0.0 })
    );
    cup.position.set(pin.x, -0.035, pin.y);
    cup.castShadow = false;
    cup.receiveShadow = true;
    courseGroup.add(cup);

    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 3, 8),
        new THREE.MeshStandardMaterial({ color: COLORS.pin })
    );
    pole.position.set(pin.x, 1.5, pin.y);
    pole.castShadow = true;
    courseGroup.add(pole);

    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0);
    flagShape.lineTo(1.5, -0.4);
    flagShape.lineTo(0, -0.8);
    flagShape.closePath();

    const flag = new THREE.Mesh(
        new THREE.ShapeGeometry(flagShape),
        new THREE.MeshStandardMaterial({ color: COLORS.flag, side: THREE.DoubleSide })
    );
    flag.position.set(pin.x + 0.05, 2.8, pin.y);
    flag.castShadow = true;
    courseGroup.add(flag);
}

function buildTrees(bounds, holeGeometry) {
    const trees = asPointArray(holeGeometry?.trees);
    if (trees.length > 0) {
        for (const t of trees) {
            addTree(t.x, t.z);
        }
        return;
    }

    const spanZ = Math.max(140, bounds.maxZ - bounds.minZ + 60);
    const startZ = bounds.centerZ - spanZ / 2;
    const spacing = 30;
    const count = Math.floor(spanZ / spacing);

    for (let i = 0; i < count; i++) {
        const z = startZ + i * spacing + (Math.random() - 0.5) * 10;
        for (const side of [-1, 1]) {
            if (Math.random() < 0.45) continue;
            const edgeX = side > 0 ? bounds.maxX : bounds.minX;
            const x = edgeX + side * (24 + Math.random() * 12);
            addTree(x, z);
        }
    }
}

function addTree(x, z) {
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x5d4037 })
    );
    trunk.position.set(x, 3, z);
    trunk.castShadow = true;
    courseGroup.add(trunk);

    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(4, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.9 })
    );
    canopy.position.set(x, 8 + Math.random() * 2, z);
    canopy.castShadow = true;
    courseGroup.add(canopy);
}

function createGroundPolygon(points, color, y = 0) {
    const normalized = asPointArray(points);
    if (normalized.length < 3) return;

    const shape = new THREE.Shape();
    // ShapeGeometry is built in XY and then rotated onto XZ.
    // With -PI/2 rotation, worldZ becomes -shapeY, so negate here to keep world Z consistent.
    shape.moveTo(normalized[0].x, -normalized[0].z);
    for (let i = 1; i < normalized.length; i++) {
        shape.lineTo(normalized[i].x, -normalized[i].z);
    }
    shape.closePath();

    const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    courseGroup.add(mesh);
}

function addPolygonOutline(points, color, y = 0.08) {
    const normalized = asPointArray(points);
    if (normalized.length < 2) return;

    const verts = normalized.map(p => new THREE.Vector3(p.x, y, p.z));
    verts.push(new THREE.Vector3(normalized[0].x, y, normalized[0].z));

    const geom = new THREE.BufferGeometry().setFromPoints(verts);
    const mat = new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geom, mat);
    courseGroup.add(line);
}

function getGeometryPoints(holeGeometry) {
    if (!holeGeometry) return [];
    const points = [];

    for (const p of asPointArray(holeGeometry.tee)) points.push(p);
    for (const p of asPointArray(holeGeometry.fairway)) points.push(p);
    for (const p of asPointArray(holeGeometry.green)) points.push(p);
    for (const poly of asPolygonArray(holeGeometry.bunkers)) {
        for (const p of poly) points.push(p);
    }
    for (const poly of asPolygonArray(holeGeometry.water)) {
        for (const p of poly) points.push(p);
    }
    for (const p of asPointArray(holeGeometry.trees)) points.push(p);

    return points;
}

function asPointArray(points) {
    if (!Array.isArray(points)) return [];
    return points
        .map(p => normalizePoint(p))
        .filter(p => p !== null);
}

function asPolygonArray(polygons) {
    if (!Array.isArray(polygons)) return [];
    return polygons
        .map(poly => asPointArray(poly))
        .filter(poly => poly.length >= 3);
}

function isPolygon(points) {
    return asPointArray(points).length >= 3;
}

function normalizePoint(p) {
    if (!p) return null;
    if (Array.isArray(p) && p.length >= 2) {
        return { x: Number(p[0]), z: Number(p[1]) };
    }
    if (typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        return { x: Number(p.x), z: Number(p.z) };
    }
    return null;
}
