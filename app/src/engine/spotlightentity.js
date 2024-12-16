import { mat4, vec3 } from "../dependencies/gl-matrix.js";
import { Entity, EntityTypes } from "./entity.js";
import { Shaders } from "./shaders.js";
import { spotlightVolume } from "./shapes.js";
import BoundingBox from "./boundingbox.js";

class SpotLightEntity extends Entity {
    constructor(position, direction, color, intensity = 1.0, angle = 45, range = 10, updateCallback = null) {
        super(EntityTypes.SPOT_LIGHT, updateCallback);

        this.position = position;
        this.direction = vec3.normalize(vec3.create(), direction);
        this.color = color;
        this.intensity = intensity;
        this.angle = angle;
        this.range = range;

        // Calculate cosine of cutoff angle for efficient spotlight calculations
        this.cutoff = Math.cos(angle * Math.PI / 180);

        // Create base transform for the light volume
        mat4.translate(this.base_matrix, this.base_matrix, position);

        // Scale the cone based on range and angle
        const radius = Math.tan(angle * Math.PI / 180) * range;
        mat4.scale(this.base_matrix, this.base_matrix, [radius, range, radius]);

        // Rotate the cone to match the light direction
        const up = vec3.fromValues(0, 0, -1);
        const dot = vec3.dot(direction, up);

        if (Math.abs(Math.abs(dot) - 1.0) < 0.000001) {
            // Special case: looking straight up/down
            if (dot < 0) {
                mat4.rotateX(this.base_matrix, this.base_matrix, Math.PI);
            }
        } else {
            const rotationAxis = vec3.cross(vec3.create(), up, direction);
            vec3.normalize(rotationAxis, rotationAxis);
            const rotationAngle = Math.acos(dot);
            mat4.rotate(this.base_matrix, this.base_matrix, rotationAngle, rotationAxis);
        }

        // Create the bounding box with initial values
        this.boundingBox = new BoundingBox(vec3.clone(position), vec3.clone(position));
        this.updateBoundingVolume();
    }

    render() {
        if (!this.visible) return;

        const m = mat4.create();
        mat4.multiply(m, this.base_matrix, this.ani_matrix);

        // Render light volume
        Shaders.spotLight.bind();
        Shaders.spotLight.setMat4("matWorld", m);
        Shaders.spotLight.setVec3("spotLight.position", this.position);
        Shaders.spotLight.setVec3("spotLight.direction", this.direction);
        Shaders.spotLight.setVec3("spotLight.color", this.color);
        Shaders.spotLight.setFloat("spotLight.intensity", this.intensity);
        Shaders.spotLight.setFloat("spotLight.cutoff", this.cutoff);
        Shaders.spotLight.setFloat("spotLight.range", this.range);

        spotlightVolume.renderSingle();
    }

    updateBoundingVolume() {
        const unitBox = spotlightVolume.boundingBox;
        const m = mat4.create();
        mat4.multiply(m, this.base_matrix, this.ani_matrix);
        this.boundingBox = unitBox.transform(m);
    }
}

export default SpotLightEntity;
