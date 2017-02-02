import OBJ from '../../node_modules/webgl-obj-loader/webgl-obj-loader';

class Model {
    constructor (path, engine, onSuccess, onError) {
        var e = this.e = engine;
        var m = this;
        var p = path;
        var gl = e.renderer.gl;

        e.utils.loadData(p,
          function (data) {
            m.mesh = new OBJ.Mesh(data);
            OBJ.initMeshBuffers(gl, m.mesh);
            onSuccess(p);
          },
          function () {
            onError(p);
          }
        );
    }
}

export { Model as default };
