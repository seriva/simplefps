class Console {
  constructor (engine) {
    var e = this.e = engine;
  }

  log (message) {
    console.log(message);
  }

  warn (message) {
    console.warning(message);
  }

  error (message) {
    console.error(message);
    throw new Error();
  }
}

export { Console as default };
