import { mat4, glMatrix } from '../dependencies/gl-matrix.js';
import * as CANNON from '../dependencies/cannon-es.js';
import {
    Console, Utils, Loading, Physics, Camera, Scene, MeshEntity, PointLightEntity, SkyboxEntity
} from '../engine/engine.js';
import Pickup from './pickups.js';

const cellSize = 3;

const meshMap = new Map();
meshMap.set(1, 'meshes/wall.mesh');
meshMap.set(2, 'meshes/floor.mesh');
meshMap.set(3, 'meshes/floor_conduit.mesh');
meshMap.set(4, 'meshes/ceiling.mesh');
meshMap.set(5, 'meshes/ceiling_conduit.mesh');
meshMap.set(6, 'meshes/lamp.mesh');
meshMap.set(128, 'meshes/health.mesh');
meshMap.set(129, 'meshes/armor.mesh');
meshMap.set(130, 'meshes/ammo.mesh');
meshMap.set(150, 'meshes/grenade_launcher.mesh');
meshMap.set(151, 'meshes/minigun.mesh');

let skybox = 1;
let data = [];
let pickups = [];
let spawnPoint = {
    position: [0, 0, 0],
    rotation: [0, 0, 0]
};

const createSceneFromMapData = () => {
    // spawnpoint
    Camera.setPosition(spawnPoint.position);
    Camera.setRotation(spawnPoint.rotation);

    // skybox
    Scene.addEntities(new SkyboxEntity(skybox));

    // create physics bodys
    const planeShape = new CANNON.Plane();
    const floorBody = new CANNON.Body({ mass: 0 });
    floorBody.addShape(planeShape);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    Physics.addBody(floorBody);
    const ceilingBody = new CANNON.Body({ mass: 0 });
    ceilingBody.addShape(planeShape);
    ceilingBody.position.set(0, 4.2, 0);
    ceilingBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    Physics.addBody(ceilingBody);
    const wallShape = new CANNON.Box(new CANNON.Vec3(1.525, 4.2, 1.525));

    // create static map entities
    const wallLight = [0.2, 0.4, 0.862];
    const outer = data.length;
    for (let i = 0; i < outer; i++) {
        const inner = data[i].length;
        for (let j = 0; j < inner; j++) {
            const block = data[i][j];
            let entity = null;
            switch (block) {
            case 1:
                if (i + 1 < outer && data[i + 1][j] > 1) {
                    entity = new MeshEntity([(i * cellSize) + 1.505, 0, j * cellSize], meshMap.get(1));
                    entity.addChild(new PointLightEntity([(i * cellSize) + 1.85, 0.25, (j * cellSize) - 1.25], 2, wallLight, 1.85));
                    entity.addChild(new PointLightEntity([(i * cellSize) + 1.85, 0.25, (j * cellSize) + 1.25], 2, wallLight, 1.85));
                    mat4.fromRotation(entity.ani_matrix, glMatrix.toRadian(-90), [0, 1, 0]);
                    Scene.addEntities(entity);
                }
                if (i - 1 >= 0 && data[i - 1][j] > 1) {
                    entity = new MeshEntity([(i * cellSize) - 1.505, 0, j * cellSize], meshMap.get(1));
                    entity.addChild(new PointLightEntity([(i * cellSize) - 1.85, 0.25, (j * cellSize) - 1.25], 2, wallLight, 1.85));
                    entity.addChild(new PointLightEntity([(i * cellSize) - 1.85, 0.25, (j * cellSize) + 1.25], 2, wallLight, 1.85));
                    mat4.fromRotation(entity.ani_matrix, glMatrix.toRadian(90), [0, 1, 0]);
                    Scene.addEntities(entity);
                }
                if (j + 1 < inner && data[i][j + 1] > 1) {
                    entity = new MeshEntity([i * cellSize, 0, (j * cellSize) + 1.505], meshMap.get(1));
                    entity.addChild(new PointLightEntity([(i * cellSize) - 1.25, 0.25, (j * cellSize) + 1.85], 2, wallLight, 1.85));
                    entity.addChild(new PointLightEntity([(i * cellSize) + 1.25, 0.25, (j * cellSize) + 1.85], 2, wallLight, 1.85));
                    mat4.fromRotation(entity.ani_matrix, glMatrix.toRadian(180), [0, 1, 0]);
                    Scene.addEntities(entity);
                }
                if (j - 1 >= 0 && data[i][j - 1] > 1) {
                    entity = new MeshEntity([i * cellSize, 0, (j * cellSize) - 1.505], meshMap.get(1));
                    entity.addChild(new PointLightEntity([(i * cellSize) - 1.25, 0.25, (j * cellSize) - 1.85], 2, wallLight, 1.85));
                    entity.addChild(new PointLightEntity([(i * cellSize) + 1.25, 0.25, (j * cellSize) - 1.85], 2, wallLight, 1.85));
                    Scene.addEntities(entity);
                }

                const wallBody = new CANNON.Body({ mass: 0 });
                wallBody.addShape(wallShape);
                wallBody.position.set(i * cellSize, 2.2, j * cellSize);
                Physics.addBody(wallBody);
                break;
            case 2:
                Scene.addEntities(new MeshEntity([i * cellSize, 0, j * cellSize], meshMap.get(2)));
                Scene.addEntities(new MeshEntity([i * cellSize, 0, j * cellSize], meshMap.get(4)));
                break;
            case 3:
                Scene.addEntities(new MeshEntity([i * cellSize, 0, j * cellSize], meshMap.get(3)));
                Scene.addEntities(new MeshEntity([i * cellSize, 0, j * cellSize], meshMap.get(5)));
                Scene.addEntities(new MeshEntity([i * cellSize, 0, j * cellSize], meshMap.get(6)));
                Scene.addEntities(new PointLightEntity([i * cellSize, 3, j * cellSize], 8, wallLight, 1.0));
                Scene.addEntities(new PointLightEntity([i * cellSize, 1, j * cellSize], 4, wallLight, 4.0));
                break;
            default:
                // code block
            }
        }
    }

    // add dynamic map entities
    pickups.forEach((pickup) => {
        Scene.addEntities(Pickup.createPickup([(pickup[0] - 1) * cellSize, 0.6, (pickup[1] - 1) * cellSize], pickup[2], meshMap.get(pickup[2])));
    });
};

const load = async (name) => {
    Loading.toggle(true);
    data.length = 0;
    pickups.length = 0;
    Scene.init();

    const response = await Utils.fetch(`${window.location}resources/maps/${name}`);
    const world = JSON.parse(response);

    Scene.setAmbient(world.ambient);
    spawnPoint = world.spawnpoint;
    skybox = world.skybox;
    data = world.data;
    pickups = world.pickups;

    createSceneFromMapData();
    Loading.toggle(false);
    Console.log(`Loaded: ${name}`);
};

const World = {
    load,
};

export { World as default };
