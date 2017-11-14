import { createEnterCssTransition, createExitCssTransition } from 'maquette-css-transitions';
import { h, createProjector } from 'maquette';

const projector = createProjector();

const GUI = {
    h,
    createEnterCssTransition,
    createExitCssTransition,
    append(render) {
        projector.append(document.body, render);
    },
    update() {
        projector.scheduleRender();
    }
};

export { GUI as default };
