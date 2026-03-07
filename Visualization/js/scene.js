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

export function frameHole(camera, controls, holeData) {
    const pin = holeData.pin;
    const holeLength = pin.z;
    const midZ = holeLength / 2;

    // Position camera behind and above the tee, looking down the hole
    camera.position.set(0, Math.max(60, holeLength * 0.18), -holeLength * 0.15);
    controls.target.set(0, 0, midZ);
    controls.update();
}
