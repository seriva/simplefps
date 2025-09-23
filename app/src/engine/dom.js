import { create } from "../dependencies/jss.js";
import jssPresetDefault from "../dependencies/jss-preset-default.js";
import { createProjector, h } from "../dependencies/maquette.js";
import Velocity from "../dependencies/velocity-animate.js";

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
				"@global": styling,
			})
			.attach();
	},
	update() {
		projector.scheduleRender();
	},
};

export default DOM;
