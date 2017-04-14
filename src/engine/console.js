class Console {
    constructor(engine) {
        const e = this.e = engine;
        const c = this;

        c.visible = false;
        c.logs = [];
        c.commands = [];

        // add css
        e.utils.addCSS(
            '#console {-webkit-transition: all 0.150s ease-in-out; display: flex; flex-flow: column nowrap; line-height: 95%; border:1px solid #999; border-bottom:1px solid #fff; background-color: #999; opacity: 0.75; z-index : 2; width: 100%; height: 50%; position: absolute; top: -52vh; left: 0; overflow: scroll; overflow-x: hidden;}' +
            '#console-input {-webkit-transition: all 0.150s ease-in-out; display: inline; color: #fff; font-size: 14px; position: absolute; top: -52vh; left: 0; width:100%; border:1px solid #999; border-bottom:2px solid #fff; background-color: #999; opacity: 0.75; outline: none;}' +
            '#console p { margin-top: auto !important; font-size: 14px; color: #fff; margin: 0px; white-space: nowrap;}' +
            '.console-down {-webkit-transform: translate(0,52vh);}' +
            '.console-input-down {-webkit-transform: translate(0,102vh);}'
        );

        // add console elements
        c.console = e.utils.addElement('div', 'console');
        c.inputfield = e.utils.addElement('input', 'console-input');
        c.inputfield.disabled = true;

        // add console control
        e.input.addKeyDownEvent(192, () => {
            c.toggle();
        });
        e.input.addKeyDownEvent(13, () => {
            c.execute();
        });
        e.touch.on('panup pandown', (ev) => {
            if (ev.type === 'panup') {
                c.toggle(false);
            }
            if (ev.type === 'pandown') {
                c.toggle(true);
            }
        });
    }

    execute() {
        // TODO: add actual execution and registration
        const c = this;
        if (c.inputfield.value === '') return;
        c.warn('Unknown command "' + c.inputfield.value + '"');
        c.inputfield.value = '';
    }

    toggle(show) {
        const c = this;
        if (show === undefined) {
            c.visible = !c.visible;
        } else {
            c.visible = show;
        }
        if (c.visible) {
            c.console.classList.add('console-down');
            c.inputfield.classList.add('console-input-down');
            c.inputfield.disabled = false;
            setTimeout(() => {
                c.inputfield.focus();
            }, 100);
            c.update();
        } else {
            c.console.classList.remove('console-down');
            c.inputfield.classList.remove('console-input-down');
            c.inputfield.disabled = true;
        }
    }

    update() {
        const c = this;
        let text = '<p>';
        for (let i = 0; i < c.logs.length; i++) {
            const log = c.logs[i];
            let color = '#FFF';
            if (log.type === 'warning') {
                color = '#FF0';
            }
            if (log.type === 'error') {
                color = '#F00';
            }
            text = text + '<span style="color:' + color + '">' + log.message + '</span></br>';
        }
        c.console.innerHTML = text + '</p>';
        c.console.scrollTop = this.console.scrollHeight;
    }

    log(m) {
        console.log(m);
        this.logs.push({
            type: 'log',
            message: m
        });
        this.update();
    }

    warn(m) {
        console.warn(m);
        this.logs.push({
            type: 'warning',
            message: m
        });
        this.update();
    }

    error(m) {
        console.error(m);
        this.logs.push({
            type: 'error',
            message: m
        });
        this.update();
        this.toggle();
        throw new Error();
    }
}

export { Console as default };
