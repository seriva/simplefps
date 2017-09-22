import { h, createProjector } from 'maquette';

const projector = createProjector();

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
