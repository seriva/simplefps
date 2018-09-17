import { createEnterCssTransition, createExitCssTransition } from 'maquette-css-transitions';
import { h, createProjector } from 'maquette';

const projector = createProjector();

const DOM = {
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

export { DOM as default };
