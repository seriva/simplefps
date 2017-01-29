class Model {
    constructor (path, engine, onSuccess, onError) {
        var t = this.e = engine;
        var r = this;

        onSuccess(path);
    }
}

export { Model as default };
