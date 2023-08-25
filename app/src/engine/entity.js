import { mat4 } from '../dependencies/gl-matrix.js';

const EntityTypes = {
    MESH: 1,
    FPS_MESH: 2,
    DIRECTIONAL_LIGHT: 3,
    POINT_LIGHT: 4,
    SPOT_LIGHT: 5,
    SKYBOX: 6
};

class Entity {
    constructor(type, updateCallback) {
        const t = this;
        t.type = type;
        t.parent = null;
        t.children = [];
        t.updateCallback = updateCallback;
        t.animationTime = 0;
        t.visible = true;
        t.base_matrix = mat4.create();
        t.ani_matrix = mat4.create();
        mat4.identity(t.base_matrix);
        mat4.identity(t.ani_matrix);
    }

    addChild(entity) {
        this.parent = this;
        this.children.push(entity);
    }

    getChildren(type) {
        const t = this;
        let selection = [];
        t.children.forEach((entity) => {
            if (entity.type === type) {
                selection.push(entity);
            }
            selection = selection.concat(entity.getChildren(type));
        });
        return selection;
    }

    update(frametime) {
        const t = this;

        if (!t.visible) {
            return;
        }

        // update entity
        if (t.updateCallback) {
            t.updateCallback(t, frametime);
        }

        // update entity children
        t.children.forEach((entity) => {
            entity.update(frametime);
        });
    }
}

export { Entity, EntityTypes };
