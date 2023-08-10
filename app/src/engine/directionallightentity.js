import { Entity, EntityTypes } from './entity.js';
import { Shaders } from './shaders.js';
import Resources from './resources.js';

class DirectionalLightEntity extends Entity {
    constructor(direction, color, updateCallback) {
        super(EntityTypes.DIRECTIONAL_LIGHT, updateCallback);
        const t = this;
        t.direction = direction;
        t.color = color;
    }

    render() {
        Shaders.directionalLight.setVec3('directionalLight.direction', this.direction);
        Shaders.directionalLight.setVec3('directionalLight.color', this.color);
        const mesh = Resources.get('system/quad.mesh');
        mesh.renderSingle();
    }
}

export { DirectionalLightEntity as default };
