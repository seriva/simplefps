import { createProjector, h } from './libs/maquette.js';
import Velocity from './libs/velocity-animate.js';
import { create } from './libs/jss.js';
import jssPresetDefault from './libs/jss-preset-default.js';

const projector = createProjector();
const styles = create(jssPresetDefault());

const DOM = {
    h,
    append(render) {
        projector.append(document.body, render);
    },
    animate(...args) {
        Velocity(...args);
    },
    css(styling) {
        styles
            .createStyleSheet({
                '@global': styling
            })
            .attach();
    },
    update() {
        projector.scheduleRender();
    }
};

export { DOM as default };
