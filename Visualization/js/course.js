import * as THREE from 'three';

const COLORS = {
    rough:   0x2e7d32,
    fairway: 0x4caf50,
    green:   0x66bb6a,
    tee:     0x43a047,
    sand:    0xd2b48c,
    pin:     0xffffff,
    flag:    0xe53935,
};

// Group that holds all course meshes so we can dispose between holes
let courseGroup = null;

export function buildHole(scene, holeData) {
    // Remove previous hole
    if (courseGroup) {
        scene.remove(courseGroup);
        courseGroup.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    }

    courseGroup = new THREE.Group();
    const pin = holeData.pin;
    const holeLength = pin.z;

    // --- Rough (large ground plane) ---
    const roughGeom = new THREE.PlaneGeometry(300, holeLength + 200);
    const roughMat = new THREE.MeshStandardMaterial({
        color: COLORS.rough, roughness: 0.95, metalness: 0
    });
    const rough = new THREE.Mesh(roughGeom, roughMat);
    rough.rotation.x = -Math.PI / 2;
    rough.position.set(0, -0.05, holeLength / 2);
    rough.receiveShadow = true;
    courseGroup.add(rough);

    // --- Fairway ---
    const fwShape = new THREE.Shape();
    const fwWidth = 20; // ~20m each side of center
    const fwNarrow = 14;
    fwShape.moveTo(-fwWidth, -10);
    fwShape.lineTo(-fwWidth, holeLength * 0.7);
    fwShape.quadraticCurveTo(-fwNarrow, holeLength * 0.85, -fwNarrow, holeLength - 20);
    fwShape.lineTo(fwNarrow, holeLength - 20);
    fwShape.quadraticCurveTo(fwNarrow, holeLength * 0.85, fwWidth, holeLength * 0.7);
    fwShape.lineTo(fwWidth, -10);
    fwShape.closePath();

    const fwGeom = new THREE.ShapeGeometry(fwShape);
    const fwMat = new THREE.MeshStandardMaterial({
        color: COLORS.fairway, roughness: 0.85, metalness: 0
    });
    const fairway = new THREE.Mesh(fwGeom, fwMat);
    fairway.rotation.x = -Math.PI / 2;
    fairway.position.y = 0;
    fairway.receiveShadow = true;
    courseGroup.add(fairway);

    // --- Green ---
    const greenRadius = 14;
    const greenGeom = new THREE.CircleGeometry(greenRadius, 48);
    const greenMat = new THREE.MeshStandardMaterial({
        color: COLORS.green, roughness: 0.7, metalness: 0
    });
    const green = new THREE.Mesh(greenGeom, greenMat);
    green.rotation.x = -Math.PI / 2;
    green.position.set(pin.x, 0.02, pin.z);
    green.receiveShadow = true;
    courseGroup.add(green);

    // --- Tee box ---
    const teeGeom = new THREE.PlaneGeometry(8, 5);
    const teeMat = new THREE.MeshStandardMaterial({
        color: COLORS.tee, roughness: 0.8, metalness: 0
    });
    const teeBox = new THREE.Mesh(teeGeom, teeMat);
    teeBox.rotation.x = -Math.PI / 2;
    teeBox.position.set(0, 0.01, 0);
    teeBox.receiveShadow = true;
    courseGroup.add(teeBox);

    // --- Tee markers ---
    const markerGeom = new THREE.SphereGeometry(0.3, 8, 8);
    const markerMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    [-2, 2].forEach(x => {
        const marker = new THREE.Mesh(markerGeom, markerMat);
        marker.position.set(x, 0.3, -1);
        courseGroup.add(marker);
    });

    // --- Pin & Flag ---
    buildPin(pin);

    // --- Trees along edges ---
    buildTrees(holeLength);

    scene.add(courseGroup);
}

function buildPin(pin) {
    // Pole
    const poleGeom = new THREE.CylinderGeometry(0.05, 0.05, 3, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: COLORS.pin });
    const pole = new THREE.Mesh(poleGeom, poleMat);
    pole.position.set(pin.x, pin.y + 1.5, pin.z);
    pole.castShadow = true;
    courseGroup.add(pole);

    // Flag
    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0);
    flagShape.lineTo(1.5, -0.4);
    flagShape.lineTo(0, -0.8);
    flagShape.closePath();

    const flagGeom = new THREE.ShapeGeometry(flagShape);
    const flagMat = new THREE.MeshStandardMaterial({
        color: COLORS.flag, side: THREE.DoubleSide
    });
    const flag = new THREE.Mesh(flagGeom, flagMat);
    flag.position.set(pin.x + 0.05, pin.y + 2.8, pin.z);
    flag.castShadow = true;
    courseGroup.add(flag);

    // Cup ring
    const cupGeom = new THREE.RingGeometry(0.05, 0.12, 16);
    const cupMat = new THREE.MeshStandardMaterial({
        color: 0x222222, side: THREE.DoubleSide
    });
    const cup = new THREE.Mesh(cupGeom, cupMat);
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(pin.x, pin.y + 0.03, pin.z);
    courseGroup.add(cup);
}

function buildTrees(holeLength) {
    const trunkGeom = new THREE.CylinderGeometry(0.5, 0.7, 6, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    const canopyGeom = new THREE.SphereGeometry(4, 8, 6);
    const canopyMat = new THREE.MeshStandardMaterial({
        color: 0x1b5e20, roughness: 0.9
    });

    const spacing = 30;
    const count = Math.floor(holeLength / spacing);

    for (let i = 0; i < count; i++) {
        const z = 20 + i * spacing + (Math.random() - 0.5) * 10;
        const sides = [-1, 1];

        sides.forEach(side => {
            if (Math.random() < 0.4) return; // skip some for variety

            const x = side * (28 + Math.random() * 15);

            const trunk = new THREE.Mesh(trunkGeom, trunkMat);
            trunk.position.set(x, 3, z);
            trunk.castShadow = true;
            courseGroup.add(trunk);

            const canopy = new THREE.Mesh(canopyGeom, canopyMat);
            canopy.position.set(x, 8 + Math.random() * 2, z);
            canopy.castShadow = true;
            courseGroup.add(canopy);
        });
    }
}
