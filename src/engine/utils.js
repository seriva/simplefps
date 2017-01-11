class Utils {
  constructor (engine) {
    var e = this.e = engine;
  }

  addCSS (styling) {
      var css = document.createElement('style');
      css.type = 'text/css';
      css.appendChild(document.createTextNode(styling));
      document.head.appendChild(css);
  }

  addElement (type, id){
      var el = document.createElement(type);
      document.body.appendChild(el);
      if(id){
          el.setAttribute('id', id);
      }
      return el;
  }
}

export { Utils as default};
