(function() {

  //config params
  const WINK_CLIENT_ID = "";
  const WINK_CLIENT_SECRET = "";
  const WINK_USERNAME = "";
  const WINK_PASSWORD = "";
  const WINK_DEVICE_ID = 0;
  const SONOS_IP = "192.168.1.230";
  const TEAM_ID = 10; //Toronto Maple Leafs; see http://statsapi.web.nhl.com/api/v1/teams to get team ID
  const POLL_FREQ = 1000; //every second
  const NHL_API_URL = "http://statsapi.web.nhl.com/api/v1/schedule?teamId=";
  const GOAL_HORN_URL = "http://mlg.local/LeafsGoalSongShort.mp3";
  const FLASH_SPEED = 150;
  const BUTTON_PIN = 13;
  const LED_PIN = 33;

  /* --------- Don't edit anything below this line --------- */

  // var wink = require("wink-jsv2");
  var request = require("request");
  var sonos = require("sonos");
  var gpio = require("rpi-gpio");

  var button;
  var pollTimer;
  var speaker;
  var curScore = 0;
  var isHomeTeam = null;
  var isGameDay = true;
  var flashInterval;
  var flasherFlag;
  var goalCelebrationInProgress = false;

  function initWink(callback) {
    //log into wink account
    wink.init({
      "client_id": WINK_CLIENT_ID,
      "client_secret": WINK_CLIENT_SECRET,
      "username": WINK_USERNAME,
      "password": WINK_PASSWORD
    }, function(auth_return) {

      if ( auth_return === undefined ) {
        console.log("**Error** Could not get Wink authorization.");
      } else {
        console.log("Connection to Wink successful");
        callback();
      }

    });

  }

  function setMarqueePower(state) {
    wink.device_group("binary_switches").device_id(WINK_DEVICE_ID).update(
      {
        "desired_state": {
          "powered": state
        }
      }, function() {
        console.log("Wink device powered " + (state == true ? "on" : "off"));
      }
    );
  }

  function cycleLED() {
    gpio.write(LED_PIN, flasherFlag, function() {});
    flasherFlag = !flasherFlag;
  }

  function startFlashing() {
    flasherFlag = false;
    flashInterval = setInterval(cycleLED, FLASH_SPEED);
  }

  function stopFlashing() {
    clearInterval(flashInterval);
    //restore LED to solid lit state
    gpio.write(LED_PIN, true, function() {});
  }

  function signalGoal() {

    goalCelebrationInProgress = true;

    console.log("   __________  ___    __    ________");
    console.log("  / ____/ __ \\/   |  / /   / / / / /");
    console.log(" / / __/ / / / /| | / /   / / / / /");
    console.log("/ /_/ / /_/ / ___ |/ /___/_/_/_/_/");
    console.log("\\____/\\____/_/  |_/_____(_|_|_|_)");
    console.log(" ");

    // speaker.play(GOAL_HORN_URL, function(err, playing) {
    //   if (err) {
    //     console.log("** Error ** Could not play goal horn. " + err);
    //   }
    //   console.log("Playing goal horn.");
    // });

    speaker.setAVTransportURI(GOAL_HORN_URL)
      .then(() => console.log("Playing goal horn."))
      .catch(error => console.log(error));


    startFlashing();

    // setMarqueePower(true);
    setTimeout(function() {
      // setMarqueePower(false);
      stopFlashing();
      goalCelebrationInProgress = false;
    }, 25000);
  }


  function getScores(initial, callback) {
    request(NHL_API_URL + TEAM_ID, function (error, response, body) {
      if (error) {
        console.log("** Error ** Could not get scores. " + error);
      } else {
        body = JSON.parse(body);

        var game;
        if (initial) {

          if (body.dates.length == 0) { 
            console.log("No game with team ID " + TEAM_ID);
            isGameDay = false;
          } else {
            game = body.dates[0].games[0];
            if (game.teams.away.team.id == TEAM_ID) {
              console.log("Away Team");
              isHomeTeam = false;
              curScore = game.teams.away.score;
            } else {
              console.log("Home Team");
              isHomeTeam = true;
              curScore = game.teams.home.score;
            }

          }

          console.log("Score is currently " + curScore);
          callback();

        } else {

          game = body.dates[0].games[0];

          if (isHomeTeam) {
            if (game.teams.home.score > curScore) {
              signalGoal();
            }
            curScore = game.teams.home.score;
          } else {
            if (game.teams.away.score > curScore) {
              signalGoal();
            } 
            curScore = game.teams.away.score;
          }
        }


      }
    });

  }

  function startKeyboardWatcher() {

    console.log("starting keyboard watcher");

    var stdin = process.stdin;

    // without this, we would only get streams once enter is pressed
    stdin.setRawMode( true );

    // resume stdin in the parent process (node app won't quit all by itself
    // unless an error or process.exit() happens)
    stdin.resume();

    // i don't want binary, do you?
    stdin.setEncoding( "utf8" );

    // on any data into stdin
    stdin.on( "data", function( key ){
      if ( key === "\u0003" ) {
        // ctrl-c ( end of text )
        console.log("CTRL-C: Cleaning up...");
        gpio.write(LED_PIN, false, function() {
          console.log("LED off");
        });
        gpio.destroy(function() {
          console.log("GPIO Unexported");
          process.exit();
        });
      } else if (key === "\u0020" ) {
        // Space Bar
        if (!goalCelebrationInProgress) {
          signalGoal();
        }
      }
    });
  }

  function startButtonWatcher() {

/*
    button = require("rpi-gpio-buttons")([BUTTON_PIN]);
    button.setTiming({
      clicked: 300,
      pressed: 300
    });

    button.on("button_press", function(pin) {
      console.log("Big Blue Button Clicked");
      if (!goalCelebrationInProgress) {
        signalGoal();
      }
    });
*/

    console.log("Setting up the Big Blue Button on pin " + BUTTON_PIN);

    /*

    No longer needed. Pullup is configured in config.txt

    //pull up resistor cannot be set from the js module.  So we'll execute
    //a python script to do it instead.
    //child_process.exec("python ./setPullUp.py " + BUTTON_PIN);

    */

    gpio.setup(BUTTON_PIN, gpio.DIR_IN, gpio.EDGE_RISING, function() {

      gpio.read(BUTTON_PIN, function(err, value) {
        console.log("Pin " + BUTTON_PIN + " current value is " + value);
      });

    });
    gpio.on("change", function(channel, value) {
      console.log("channel: " + channel + ", value: " + value);
      if (channel == BUTTON_PIN && value == false) {
        console.log("Big Blue Button Pressed");
        if (!goalCelebrationInProgress) {
          signalGoal();
        }
      }
    });

  }

  function cleanup() {
    gpio.destroy(function() {
      console.log("GPIO Unexported");
      //child_process.exec("python ./resetPin.py " + BUTTON_PIN);
      process.exit();
    });
  }

  function start() {

    console.log("Starting with team ID: " + TEAM_ID);

    speaker = new sonos.Sonos(SONOS_IP);
    // speaker.flush(function(err, flushed) {
    //   if (err) {
    //     console.log("** Error ** Could not flush speaker queue. " + err);
    //   }
    //   console.log("Speaker queue flushed");
    // });
    speaker.getVolume()
      .then((volume) => console.log("Speaker volume set to " + volume));

    startButtonWatcher();

    //startKeyboardWatcher();
    console.log("Good to GO LEAFS GO!!!");
    gpio.setup(LED_PIN, gpio.DIR_OUT, function() {
      gpio.write(LED_PIN, true, function(err) {
        if (err) {
          console.log("** Error ** Could not light LED");
        }
      });
    });

    process.stdin.resume();
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);


    // initWink(function() {


    //   process.stdin.resume();
    //   process.on("SIGINT", cleanup);
    //   process.on("SIGTERM", cleanup);

    //   console.log("Getting initial scores");
    //   getScores(true, function() {

    //     //disable poll for now
    //     if (isGameDay && 1 == 2) {
    //       console.log("Starting poll...");
    //       pollTimer = setInterval(function() {
    //         getScores(false);
    //       }, POLL_FREQ);          
    //     } 
        
    //   });
    // });
  }

  start();

})();
