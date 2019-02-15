import { maquette, Velocity, jss, jssPresetDefault } from '../libs/import.js';

const projector = maquette.createProjector();
const styles = jss.create(jssPresetDefault.default());

const DOM = {
    h: maquette.h,
    append(render) {
        projector.append(document.body, render);
    },
    animate(...args) {
        Velocity(...args);
    },
    registerCSS(styling) {
        styles.createStyleSheet({
            '@global': styling
        }).attach();
    },
    update() {
        projector.scheduleRender();
    }
};

export { DOM as default };
