import { EntityTypes } from "./entity.js";
import MeshEntity from "./meshentity.js";

class FpsMeshEntity extends MeshEntity {
	constructor(position, name, updateCallback) {
		super(position, name, updateCallback);
		this.type = EntityTypes.FPS_MESH;
	}
}

export default FpsMeshEntity;
