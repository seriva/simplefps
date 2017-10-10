import { h, createProjector } from 'maquette';
import { cssTransitions } from 'maquette/dist/css-transitions';

const projector = createProjector({ transitions: cssTransitions });

const GUI = {
    h,
    append(render) {
        projector.append(document.body, render);
    },
    update() {
        projector.scheduleRender();
    }
};

export { GUI as default };
