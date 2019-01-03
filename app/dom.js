import jss from 'jss';
import preset from 'jss-preset-default';
import Velocity from 'velocity-animate';
import { h, createProjector } from 'maquette';

const projector = createProjector();

jss.setup(preset());

const DOM = {
    h,
    append(render) {
        projector.append(document.body, render);
    },
    addElement(type, id, parent) {
        const el = document.createElement(type);
        if (parent) {
            parent.appendChild(el);
        } else {
            document.body.appendChild(el);
        }
        if (id) {
            el.setAttribute('id', id);
        }
        return el;
    },
    animate(...args) {
        Velocity(...args);
    },
    registerCSS(styling) {
        jss.createStyleSheet({
            '@global': styling
        }).attach();
    },
    update() {
        projector.scheduleRender();
    }
};

export { DOM as default };
