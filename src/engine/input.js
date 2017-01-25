class Input {
  constructor (engine) {
    var e = this.e = engine;
    var i = this;
    i.pressed = {};
  	i.upevents = [];
  	i.downevents = [];

  	window.addEventListener('keyup', function(event) {
  		delete i.pressed[event.keyCode];
  		for (var l = 0; l < i.upevents.length; l++) {
  			if (i.upevents[l].key === event.keyCode){
  				i.upevents[l].event();
  			}
  		}
  		for (var l = 0; l < i.downevents.length; l++) {
  			if (i.downevents[l].pressed){
  				i.downevents[l].pressed = false;
  			}
  		}
  	}, false);
  	window.addEventListener('keydown', function(event) {
  		i.pressed[event.keyCode] = true;
  		for (var l = 0; l < i.downevents.length; l++) {
  			if (i.downevents[l].key === event.keyCode && (!i.downevents[l].pressed)){
  				i.downevents[l].event();
  				i.downevents[l].pressed = true;
  			}
  		}
  	}, false);
  }
  
  ClearInputEvents () {
  	this.pressed    = {};
  	this.upevents   = [];
  	this.downevents = [];
  };

  AddKeyDownEvent (key, event) {
  	this.downevents.push({key : key, event : event, pressed : false});
  };

  AddKeyUpEvent (key, event) {
  	this.upevents.push({key : key, event : event});
  };

  IsDown (keyCode) {
  	return this.pressed[keyCode];
  };
}

export { Input as default };
