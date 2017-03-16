class Stats {
  constructor (engine) {
    var e = this.e = engine;
    var s = this;

    this.fps = 0;
    this.fpscounter = 0;
    this.frametime = 0;

    //add css for stats
    e.utils.addCSS(
        '#stat-fps { left: 15px; bottom:15px; margin: 0; padding: 0; position: absolute; color: #FFF; font-size: 14px }' +
        '#stat-ftm { left: 15px; bottom:30px; margin: 0; padding: 0; position: absolute; color: #FFF; font-size: 14px  }'
    );

    //add stats elements
    e.utils.addElement('span', 'stat-fps');
    e.utils.addElement('span', 'stat-ftm');

    //stats update event
    window.setInterval(() => {
      s.fps = s.fpscounter;
      s.fpscounter = 0;
      document.getElementById('stat-fps').innerHTML = 'FPS : ' + s.fps.toPrecision(5);
      document.getElementById('stat-ftm').innerHTML = 'FTM : ' + s.frametime.toPrecision(5);
    }, 1000);
  }

  update (frametime){
      this.fpscounter++;
      this.frametime = frametime;
  } 
}

export { Stats as default};
