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
    detach(render) {
        const node = projector.detach(render).domNode;
        node.remove();
    },
    update() {
        projector.scheduleRender();
    }
};

export { DOM as default };
