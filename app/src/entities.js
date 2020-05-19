import { mat4 } from './dependencies/gl-matrix.js';
import MeshEntity from './meshentity.js';
import PointlightEntity from './pointlightentity.js';

const updatePickup = (entity, frameTime) => {
    entity.animationTime += frameTime;
    mat4.identity(entity.ani_matrix);
    mat4.fromRotation(entity.ani_matrix, entity.animationTime / 1000, [0, 1, 0]);
    mat4.translate(entity.ani_matrix, entity.ani_matrix,
        [0, (Math.cos(Math.PI * (entity.animationTime / 1000)) * 0.1), 0]);
    entity.children.forEach((e) => {
        mat4.copy(e.ani_matrix, entity.ani_matrix);
        mat4.translate(e.ani_matrix, e.ani_matrix, [0, 0.25, 0]);
    });
};
const createPickup = (pos, type, mesh) => {
    const pickup = new MeshEntity(pos, mesh, updatePickup);
    pickup.castShadow = true;
    switch (type) {
    case 128:
        pickup.addChild(new PointlightEntity(pos, 1.4, [0.752, 0, 0.035], 1.7));
        break;
    case 129:
        pickup.addChild(new PointlightEntity(pos, 1.4, [0, 0.352, 0.662], 1.7));
        break;
    case 130:
        pickup.addChild(new PointlightEntity(pos, 1.4, [0.623, 0.486, 0.133], 1.7));
        break;
    case 150:
        pickup.addChild(new PointlightEntity(pos, 1.4, [0.2, 0.552, 0.862], 1.7));
        break;
    default:
        // code block
    }
    return pickup;
};

const Entities = {
    createPickup
};

export { Entities as default };
