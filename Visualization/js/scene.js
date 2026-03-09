import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createScene(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const scene = new THREE.Scene();

    // Sky gradient
    scene.background = new THREE.Color(0x7ec8e3);
    scene.fog = new THREE.FogExp2(0x7ec8e3, 0.0015);

    // Camera
    const camera = new THREE.PerspectiveCamera(
        55, window.innerWidth / window.innerHeight, 0.5, 3000
    );

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.1; // prevent going underground
    controls.minDistance = 10;
    controls.maxDistance = 800;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfffde8, 2.0);
    sun.position.set(80, 200, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 600;
    sun.shadow.camera.left = -300;
    sun.shadow.camera.right = 300;
    sun.shadow.camera.top = 300;
    sun.shadow.camera.bottom = -300;
    scene.add(sun);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3a6b35, 0.4);
    scene.add(hemi);

    // Resize handler
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer, controls, sun };
}

export function frameHole(camera, controls, holeData, holeGeometry = null) {
    const points = [{ x: 0, z: 0 }, { x: holeData.pin.x, z: holeData.pin.z }];
    for (const shot of holeData.shots ?? []) {
        points.push({ x: shot.start.x, z: shot.start.z });
        points.push({ x: shot.end.x, z: shot.end.z });
    }
    for (const p of getGeometryPoints(holeGeometry)) {
        points.push(p);
    }

    const xs = points.map(p => p.x);
    const zs = points.map(p => p.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const center = new THREE.Vector2((minX + maxX) / 2, (minZ + maxZ) / 2);

    const tee = new THREE.Vector2(0, 0);
    const pin = new THREE.Vector2(holeData.pin.x, holeData.pin.z);
    const vec = pin.clone().sub(tee);
    const dir = vec.length() > 0.1 ? vec.clone().normalize() : new THREE.Vector2(0, 1);
    const perp = new THREE.Vector2(-dir.y, dir.x);

    const span = Math.max(140, maxX - minX, maxZ - minZ, vec.length());
    const camBack = span * 0.62;
    const camSide = span * 0.06;
    const camHeight = Math.max(85, span * 0.34);
    const target = tee.clone().add(dir.clone().multiplyScalar(span * 0.58));

    // Keep a stable "tee behind, pin ahead" framing so hole direction reads intuitively.
    camera.position.set(
        tee.x - dir.x * camBack + perp.x * camSide,
        camHeight,
        tee.y - dir.y * camBack + perp.y * camSide
    );
    controls.target.set(target.x, 0, target.y);
    controls.update();
}

export function focusCameraForPutt(camera, controls, holeData, shot, ballPos = null, deltaTime = 1 / 60) {
    if (!holeData || !shot) return;

    const fallbackStart = new THREE.Vector2(Number(shot.start?.x ?? 0), Number(shot.start?.z ?? 0));
    const ball = ballPos
        ? new THREE.Vector2(Number(ballPos.x), Number(ballPos.z))
        : fallbackStart;
    const pin = new THREE.Vector2(
        Number(holeData.pin?.x ?? shot.end?.x ?? 0),
        Number(holeData.pin?.z ?? shot.end?.z ?? 0)
    );

    const toPin = pin.clone().sub(ball);
    const dir2 = toPin.length() > 0.2 ? toPin.clone().normalize() : new THREE.Vector2(0, 1);
    if (!Number.isFinite(dir2.x) || !Number.isFinite(dir2.y)) return;

    const perp2 = new THREE.Vector2(-dir2.y, dir2.x);
    const span = Math.max(1.2, toPin.length());
    const mid = ball.clone().add(pin).multiplyScalar(0.5);
    const back = Math.max(6.0, Math.min(24.0, span * 1.55));
    const side = Math.max(1.6, Math.min(6.0, span * 0.16));
    const height = Math.max(5.0, Math.min(15.0, 4.4 + span * 0.42));

    const desiredTarget = new THREE.Vector3(mid.x, 0, mid.y);
    const desiredPos = new THREE.Vector3(
        mid.x - dir2.x * back + perp2.x * side,
        height,
        mid.y - dir2.y * back + perp2.y * side
    );

    const alpha = 1 - Math.exp(-Math.max(0.001, deltaTime) * 7.5);
    camera.position.lerp(desiredPos, alpha);
    controls.target.lerp(desiredTarget, alpha);
}

function getGeometryPoints(holeGeometry) {
    if (!holeGeometry) return [];
    const points = [];

    const collect = arr => {
        if (!Array.isArray(arr)) return;
        for (const p of arr) {
            if (Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
                points.push({ x: p[0], z: p[1] });
            } else if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
                points.push({ x: p.x, z: p.z });
            }
        }
    };

    collect(holeGeometry.tee);
    collect(holeGeometry.fairway);
    collect(holeGeometry.green);
    collect(holeGeometry.trees);

    for (const poly of holeGeometry.bunkers ?? []) collect(poly);
    for (const poly of holeGeometry.water ?? []) collect(poly);

    return points;
}
