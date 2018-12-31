import jss from 'jss';
import preset from 'jss-preset-default';
import { createEnterCssTransition, createExitCssTransition } from 'maquette-css-transitions';
import { h, createProjector } from 'maquette';

const projector = createProjector();

jss.setup(preset());

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
